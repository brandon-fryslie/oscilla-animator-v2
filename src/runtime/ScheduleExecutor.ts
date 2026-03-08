/**
 * Schedule Executor - Core Frame Execution Loop
 *
 * Executes the IR program schedule step-by-step to produce a frame.
 * Simplified for v2 - pure IR path, no legacy complexity.
 */

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ScheduleIR } from '../compiler/backend/schedule-program';
import type { Step, InstanceDecl, StepRender } from '../compiler/ir/types';
import type { IrInstanceId as InstanceId } from '../types';
import { instanceId as makeInstanceId } from '../core/ids';
import type { RuntimeState } from './RuntimeState';
import type { RenderFrameIR } from '../render/types';
import type { RenderBufferArena } from '../render/RenderBufferArena';
import { resolveTime } from './timeResolution';
import {
  beginRuntimeFrameSemantics,
  enterRuntimeFrameSegment,
  resetFrameVolatileShapeBank,
  prepareStateWriteBank,
  commitStateWriteBank,
  type RuntimeFrameSegment,
} from './RuntimeState';
import {
  MATERIALIZE_SCRATCH,
  renderStepsBuffer as _renderSteps,
  assemblerCtx as _assemblerCtx,
} from './executor-init';
import { detectDomainChange, recordDomainTransition } from './ContinuityMapping';
import { applyContinuity, finalizeContinuityFrame } from './ContinuityApply';
import {
  createStableDomainInstance,
  createUnstableDomainInstance,
  shouldRebuildDomainInstance,
} from './DomainIdentity';
import { assembleRenderFrame, type AssemblerContext } from './RenderAssembler';
import { resolveCameraFromGlobals } from './CameraResolver';
import type { CanonicalType } from '../core/canonical-types';
import { payloadStride, requireInst } from '../core/canonical-types';
import type { ValueSlot } from '../compiler/ir/Indices';
import { SCALAR_INSTANCE_ID } from '../compiler/ir/Indices';
import { evaluateValueExprEvent } from './ValueExprEventEvaluator';
import { materializeValueExpr } from './ValueExprMaterializer';
import { applyStateWritePolicy } from './StateWritePolicy';
import type { PureFnExecutionContext } from './ScalarKernelLibrary';
import { resolveInstanceLaneCount } from './InstanceCountResolver';
import {
  arenaDecodeToAoS,
  arenaEncodeFromAoS,
  arenaRead,
  type ArenaSlotDescriptor,
} from './ArenaValueStore';
import {
  type SlotLookup,
  getExprAddressTable,
  isNumericStorage,
} from './ExprAddressTable';

// [LAW:one-source-of-truth] Arena is the canonical numeric store.
// slotToArena comes from ExprAddressTable — no direct program.arenaLayout accesses here.
function resolveArenaDescriptor(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  lookup: SlotLookup,
): ArenaSlotDescriptor {
  const arenaDesc = slotToArena.get(lookup.slot);
  if (!arenaDesc) {
    throw new Error(`resolveArenaDescriptor: missing arena descriptor for numeric slot ${lookup.slot}`);
  }
  return arenaDesc;
}

function resolveNumericBuffer(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  state: RuntimeState,
  slot: ValueSlot,
): Float32Array {
  const arenaDesc = slotToArena.get(slot);
  if (!arenaDesc || arenaDesc.offset < 0 || arenaDesc.length <= 0) {
    throw new Error('resolveNumericBuffer: missing arena descriptor for numeric slot ' + slot);
  }
  if (state.arena.length < arenaDesc.offset + arenaDesc.length) {
    throw new Error(
      'resolveNumericBuffer: arena too small for slot ' +
        slot +
        ' (need ' +
        (arenaDesc.offset + arenaDesc.length) +
        ', have ' +
        state.arena.length +
        ')',
    );
  }
  return arenaDecodeToAoS(state.arena, arenaDesc);
}

function ensureOutputBuffer(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  state: RuntimeState,
  slot: ValueSlot,
  length: number,
): Float32Array {
  const arenaDesc = slotToArena.get(slot);
  if (!arenaDesc || arenaDesc.offset < 0 || arenaDesc.length <= 0) {
    throw new Error('ensureOutputBuffer: missing arena descriptor for numeric slot ' + slot);
  }
  if (arenaDesc.length < length) {
    throw new Error(
      'ensureOutputBuffer: arena descriptor too small for slot ' +
        slot +
        ' (need length ' +
        length +
        ', have ' +
        arenaDesc.length +
        ')',
    );
  }
  if (state.arena.length < arenaDesc.offset + arenaDesc.length) {
    throw new Error(
      'ensureOutputBuffer: arena too small for slot ' +
        slot +
        ' (need ' +
        (arenaDesc.offset + arenaDesc.length) +
        ', have ' +
        state.arena.length +
        ')',
    );
  }
  return new Float32Array(length);
}

function readCanonicalNumeric(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  state: RuntimeState,
  lookup: SlotLookup,
  component: number = 0,
): number {
  const arenaDesc = resolveArenaDescriptor(slotToArena, lookup);
  return arenaRead(state.arena, arenaDesc, 0, component);
}

// Module-level helper: resolve slot to storage offset (hoisted to avoid per-frame closure)
function resolveSlotOffsetFromMap(slotLookupMap: ReadonlyMap<ValueSlot, SlotLookup>, slot: ValueSlot): SlotLookup {
  const lookup = slotLookupMap.get(slot);
  if (!lookup) {
    throw new Error('Slot ' + slot + ' not found in canonical slot lookup');
  }
  return lookup;
}

const stateSlotMappingCache = new WeakMap<
  ScheduleIR,
  ReadonlyMap<number, ScheduleIR['stateMappings'][number]>
>();
const NO_DOMAIN_CHANGE = {
  changed: false,
  mapping: null,
} as const;

function getStateSlotToMapping(
  schedule: ScheduleIR,
): ReadonlyMap<number, ScheduleIR['stateMappings'][number]> {
  const cached = stateSlotMappingCache.get(schedule);
  if (cached) {
    return cached;
  }
  const byStateSlot = new Map<number, ScheduleIR['stateMappings'][number]>();
  for (const mapping of schedule.stateMappings) {
    byStateSlot.set(mapping.slotStart, mapping);
  }
  stateSlotMappingCache.set(schedule, byStateSlot);
  return byStateSlot;
}

// Module-level callback for events.forEach (hoisted to avoid per-frame closure)
function _clearEventPayloads(payloads: unknown[]): void {
  payloads.length = 0;
}

interface ContinuityBufferResolverContext {
  baseSlot: ValueSlot;
  outputSlot: ValueSlot;
  baseBuffer: Float32Array;
  outputBuffer: Float32Array;
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>;
  state: RuntimeState;
}

// [LAW:no-shared-mutable-globals] Resolver context is single-owner runtime scratch
// scoped to executeFrame; values are overwritten before each continuity step.
const _continuityResolverContext: ContinuityBufferResolverContext = {
  baseSlot: 0 as ValueSlot,
  outputSlot: 0 as ValueSlot,
  baseBuffer: new Float32Array(0),
  outputBuffer: new Float32Array(0),
  slotToArena: new Map<ValueSlot, ArenaSlotDescriptor>(),
  state: null as unknown as RuntimeState,
};
const _continuityEmptyBaseBuffer = _continuityResolverContext.baseBuffer;
const _continuityEmptyOutputBuffer = _continuityResolverContext.outputBuffer;
const _continuityEmptySlotMap = _continuityResolverContext.slotToArena;

function clearContinuityResolverContext(): void {
  // [LAW:no-shared-mutable-globals] Clear frame-owned references immediately
  // after continuity resolution so this module scratch context cannot retain
  // the previous RuntimeState/arena across halted runtimes.
  _continuityResolverContext.baseSlot = 0 as ValueSlot;
  _continuityResolverContext.outputSlot = 0 as ValueSlot;
  _continuityResolverContext.baseBuffer = _continuityEmptyBaseBuffer;
  _continuityResolverContext.outputBuffer = _continuityEmptyOutputBuffer;
  _continuityResolverContext.slotToArena = _continuityEmptySlotMap;
  _continuityResolverContext.state = null as unknown as RuntimeState;
}

function resolveContinuityBuffer(slot: ValueSlot): Float32Array {
  if (slot === _continuityResolverContext.baseSlot) return _continuityResolverContext.baseBuffer;
  if (slot === _continuityResolverContext.outputSlot) return _continuityResolverContext.outputBuffer;
  return resolveNumericBuffer(
    _continuityResolverContext.slotToArena,
    _continuityResolverContext.state,
    slot,
  );
}

export interface ExecuteFrameOptions {
  /**
   * Enable cardinality/runtime write assertions.
   * Intended for debug-mode execution only due per-step overhead.
   */
  readonly assertCardinalitySlotWrites?: boolean;
}

type RuntimeValueKind = 'signal' | 'field' | 'event';
type RuntimeWriteKind = 'signal' | 'field';

function deriveRuntimeValueKind(type: CanonicalType): RuntimeValueKind {
  const temporality = requireInst(type.extent.temporality, 'temporality');
  if (temporality.kind === 'discrete') {
    return 'event';
  }
  const cardinality = requireInst(type.extent.cardinality, 'cardinality');
  return cardinality.kind === 'many' ? 'field' : 'signal';
}

function deriveExpectedLaneCount(
  lookup: SlotLookup,
  instances: ReadonlyMap<InstanceId, InstanceDecl>,
  state: RuntimeState,
): number | null {
  const cardinality = requireInst(lookup.type.extent.cardinality, 'cardinality');
  if (cardinality.kind !== 'many') {
    return 1;
  }
  const instance = instances.get(cardinality.instance.instanceId as InstanceId);
  if (!instance) {
    return null;
  }
  if (instance.count !== 'dynamic') {
    return instance.count;
  }
  const cached = state.cache.instanceLaneCounts?.get(String(instance.id));
  return cached ?? instance.maxCount;
}

function assertRuntimeSlotWrite(
  slotLookupMap: ReadonlyMap<ValueSlot, SlotLookup>,
  instances: ReadonlyMap<InstanceId, InstanceDecl>,
  state: RuntimeState,
  stepKind: Step['kind'],
  slot: ValueSlot,
  observedKind: RuntimeWriteKind,
  observedLaneCount: number,
): void {
  const lookup = resolveSlotOffsetFromMap(slotLookupMap, slot);
  const expectedKind = deriveRuntimeValueKind(lookup.type);
  if (expectedKind === 'event') {
    throw new Error(
      `Internal error: non-event step ${stepKind} attempted to write to event-typed slot ${slot} ` +
      `(discrete temporality slots must only be written by eventDispatch; observed write kind: ${observedKind})`,
    );
  }
  if (expectedKind !== observedKind) {
    throw new Error(
      `Cardinality write assertion failed at ${stepKind} slot ${slot}: ` +
      `expected ${expectedKind}, actual ${observedKind}`,
    );
  }
  if (lookup.arena.laneCount !== observedLaneCount) {
    throw new Error(
      `Cardinality write assertion failed at ${stepKind} slot ${slot}: ` +
      `expected laneCount ${lookup.arena.laneCount}, actual ${observedLaneCount}`,
    );
  }
  const expectedLaneCount = deriveExpectedLaneCount(lookup, instances, state);
  if (expectedLaneCount !== null && expectedLaneCount !== observedLaneCount) {
    throw new Error(
      `Cardinality write assertion failed at ${stepKind} slot ${slot}: ` +
      `expected cardinality lanes ${expectedLaneCount}, actual ${observedLaneCount}`,
    );
  }
}

/**
 * Execute one frame of the program
 *
 * @param program - Compiled IR program (CompiledProgramIR)
 * @param state - Runtime state
 * @param arena - Pre-allocated buffer arena for render operations
 * @param tAbsMs - Absolute time in milliseconds
 * @returns RenderFrameIR for this frame
 */
export function executeFrame(
  program: CompiledProgramIR,
  state: RuntimeState,
  arena: RenderBufferArena,
  tAbsMs: number,
  options?: ExecuteFrameOptions,
): RenderFrameIR {
  MATERIALIZE_SCRATCH.reset();

  // Extract schedule components
  const schedule = program.schedule as ScheduleIR;
  const timeModel = schedule.timeModel;
  const instances = schedule.instances;
  const steps = schedule.steps;
  const stateSlotToMapping = getStateSlotToMapping(schedule);

  // [LAW:one-source-of-truth] Single address table for all slot/expr/field queries.
  // slotToArena replaces all direct program.arenaLayout[slot] accesses in this file.
  const addressTable = getExprAddressTable(program);
  const { slotLookup: slotLookupMap, slotToArena } = addressTable;
  const pureFnContext: PureFnExecutionContext = { kernelRegistry: program.kernelRegistry };
  // [LAW:dataflow-not-control-flow] Assertion mode is chosen once per frame.
  // Step execution order is unchanged; only validation dataflow varies.
  const assertCardinalitySlotWrites = options?.assertCardinalitySlotWrites === true;

  // Helper uses module-level resolveSlotOffsetFromMap() — no closure needed

  // 1. Advance frame (cache owns frameId)
  state.cache.frameId++;
  beginRuntimeFrameSemantics(state);
  resetFrameVolatileShapeBank(state);

  // 1.5. Commit external channel writes (spec: External Input System Section 3.1)
  enterRuntimeFrameSegment(state, 'preframe-external-input');
  state.externalChannels.commit();

  // 2. Resolve effective time
  enterRuntimeFrameSegment(state, 'preframe-time-resolve');
  const time = resolveTime(tAbsMs, timeModel, state.timeState);
  state.time = time;

  // 2.5. Clear event scalars and payloads (events fire for exactly one tick, spec §6.1)
  enterRuntimeFrameSegment(state, 'preframe-event-reset');
  state.eventScalars.fill(0);

  // Clear event payload arrays (spec-compliant event storage)
  // Monotone OR semantics: clear at frame start, only append during frame
  state.events.forEach(_clearEventPayloads);

  // ═══════════════════════════════════════════════════════════════════════════
  // TWO-PHASE EXECUTION MODEL
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Phase 1 (below): Evaluate all one-cardinality values, materialize fields, fire events,
  //                  collect render ops. Reads state from PREVIOUS frame.
  // Phase 2 (line ~464): Write new state values for NEXT frame.
  //
  // This separation is NON-NEGOTIABLE. It ensures:
  // - Stateful blocks (UnitDelay, Lag, etc.) maintain proper delay semantics
  // - Cycles only cross frame boundaries via state (invariant I7)
  // - All one-cardinality values see consistent state within a frame
  // - Hot-swap can migrate state without corruption
  //
  // See: docs/runtime/execution-model.md for full rationale and examples.
  // ═══════════════════════════════════════════════════════════════════════════

  // Unified ValueExpr table (one/many/event values live here)
  const valueExprs = program.valueExprs.nodes;

  // Resolve camera from program render globals (will be populated after value evaluation)
  // Note: assemblerContext is constructed after Phase 1 when slots are populated
  let assemblerContext: AssemblerContext;

  // Collect render steps for v2 batch assembly (reuse module-level array)
  _renderSteps.length = 0;

  // [LAW:one-source-of-truth] Populate canonical scalar arena addresses before Phase 1
  // so extract reads resolve from compiler-emitted ExprAddressTable metadata only.
  state.cache.scalarExprToArenaAddress = addressTable.scalarExprToArenaAddress;

  // PHASE 1: Execute all non-stateWrite steps
  let eventDispatchSeen = false;
  let continuityMapSeen = false;
  const resolvePhase1ValueSegment = (): RuntimeFrameSegment => {
    if (eventDispatchSeen) return 'phase1-value-post-event';
    if (continuityMapSeen) return 'phase1-value-after-map';
    return 'phase1-value-pre-event';
  };
  for (const step of steps) {
    switch (step.kind) {
      case 'eventDispatch': {
        enterRuntimeFrameSegment(state, 'phase1-event-dispatch');
        eventDispatchSeen = true;
        // ValueExpr-only event evaluation (cutover complete)
        const fired = evaluateValueExprEvent(step.expr, program.valueExprs, state, program, pureFnContext);

        // Monotone OR: only write 1, never write 0 back — ensures any-fired-stays-fired
        if (fired) {
          state.eventScalars[step.target as number] = 1;
        }
        break;
      }

      case 'materialize': {
        enterRuntimeFrameSegment(state, resolvePhase1ValueSegment());
        // ValueExpr-only materialization (cutover complete)
        const veId = step.field;

        // Use the instanceId from the schedule step (set by schedule-program.ts)
        // rather than deriving from the ValueExpr type, which may have a stale placeholder
        const instanceDecl = instances.get(step.instanceId);
        const count = instanceDecl
          ? resolveInstanceLaneCount(instanceDecl, program, state, pureFnContext)
          : 0;
        // [LAW:one-source-of-truth] Arena lookup via ExprAddressTable — no direct arenaLayout access.
        const arenaDesc = slotToArena.get(step.target);
        if (!arenaDesc || arenaDesc.offset < 0 || arenaDesc.length <= 0) {
          throw new Error('materialize: missing arena descriptor for slot ' + step.target);
        }
        if (state.arena.length < arenaDesc.offset + arenaDesc.length) {
          throw new Error(
            'materialize: arena too small for slot ' +
              step.target +
              ' (need ' +
              (arenaDesc.offset + arenaDesc.length) +
              ', have ' +
              state.arena.length +
              ')',
          );
        }
        const buffer = materializeValueExpr(
          veId,
          program.valueExprs,
          step.instanceId,
          count,
          state,
          program,
          undefined,
          MATERIALIZE_SCRATCH,
          pureFnContext,
        );
        arenaEncodeFromAoS(state.arena, arenaDesc, buffer);

        // Debug tap: Record field value
        state.tap?.recordFieldValue?.(step.target, buffer);
        if (assertCardinalitySlotWrites) {
          assertRuntimeSlotWrite(slotLookupMap, instances, state, step.kind, step.target, 'field', count);
        }
        break;
      }

      case 'render': {
        enterRuntimeFrameSegment(state, 'phase1-render-collect');
        // Collect render steps for v2 batch assembly (after Phase 1)
        _renderSteps.push(step);
        break;
      }

      case 'stateWrite': {
        // SKIP in Phase 1 - will be executed in Phase 2
        break;
      }

      case 'continuityMapBuild': {
        enterRuntimeFrameSegment(state, 'phase1-continuity-map');
        continuityMapSeen = true;
        // Continuity System: Build element mapping when domain changes (spec §5.1)
        const { instanceId } = step;

        // Get instance declaration
        const instance = instances.get(instanceId as InstanceId);
        if (!instance) {
          // Instance not found - skip
          break;
        }

        const count = resolveInstanceLaneCount(instance, program, state, pureFnContext);
        if (count === 0) break;

        const seed = instance.elementIdSeed ?? 0;
        const previousDomain = state.continuity.prevDomains.get(instanceId);
        const identityMode = instance.identityMode === 'stable' ? 'stable' : 'none';
        if (!shouldRebuildDomainInstance(previousDomain, count, identityMode, seed)) {
          // [LAW:dataflow-not-control-flow] Continuity transition recording runs
          // every frame; unchanged domains emit canonical "no change" data.
          recordDomainTransition(state.continuity, instanceId, NO_DOMAIN_CHANGE);
          break;
        }
        const newDomain = identityMode === 'stable'
          ? createStableDomainInstance(count, seed)
          : createUnstableDomainInstance(count);

        // Detect domain change and compute mapping
        const change = detectDomainChange(
          instanceId,
          newDomain,
          state.continuity.prevDomains,
        );
        // [LAW:one-source-of-truth] Domain transition ownership is updated through
        // a single continuity mapping boundary.
        recordDomainTransition(state.continuity, instanceId, change);

        // Update prevDomains for next frame comparison
        state.continuity.prevDomains.set(instanceId, newDomain);
        break;
      }

      case 'continuityApply': {
        enterRuntimeFrameSegment(state, 'phase1-continuity-apply');
        // Continuity System: Apply continuity policy to field target (spec §5.1)
        const { baseSlot, outputSlot } = step;

        // Resolve base/output through canonical numeric arena descriptors only.
        const baseDesc = slotToArena.get(baseSlot);
        if (!baseDesc || baseDesc.offset < 0 || baseDesc.length <= 0) {
          throw new Error('Continuity: missing arena descriptor for base slot ' + baseSlot);
        }
        const outputDesc = slotToArena.get(outputSlot);
        if (!outputDesc || outputDesc.offset < 0 || outputDesc.length <= 0) {
          throw new Error('Continuity: missing arena descriptor for output slot ' + outputSlot);
        }
        const baseBuffer = resolveNumericBuffer(slotToArena, state, baseSlot);

        const outputBuffer = baseSlot === outputSlot
          ? baseBuffer
          : ensureOutputBuffer(slotToArena, state, outputSlot, baseBuffer.length);

        _continuityResolverContext.baseSlot = baseSlot;
        _continuityResolverContext.outputSlot = outputSlot;
        _continuityResolverContext.baseBuffer = baseBuffer;
        _continuityResolverContext.outputBuffer = outputBuffer;
        _continuityResolverContext.slotToArena = slotToArena;
        _continuityResolverContext.state = state;
        try {
          applyContinuity(step, state, resolveContinuityBuffer);
        } finally {
          clearContinuityResolverContext();
        }
        arenaEncodeFromAoS(state.arena, outputDesc, outputBuffer);
        state.tap?.recordFieldValue?.(outputSlot, outputBuffer);
        if (assertCardinalitySlotWrites) {
          const observedLaneCount = step.stride > 0 ? Math.floor(baseBuffer.length / step.stride) : 0;
          assertRuntimeSlotWrite(
            slotLookupMap,
            instances,
            state,
            step.kind,
            outputSlot,
            'field',
            observedLaneCount,
          );
        }
        break;
      }



      case 'fieldStateWrite': {
        // Per-lane state write is handled in PHASE 2 (after all reads complete)
        break;
      }

      default: {
        const _exhaustive: never = step;
        throw new Error('Unknown step kind: ' + (_exhaustive as Step).kind);
      }
    }
  }

  // PHASE 1.5: Demand-driven field materialization for debug tracking
  // Materialize any tracked field slots that weren't already written by the render pipeline
  if (state.tap) {
    const trackedSlots = state.tap.getTrackedFieldSlots?.();
    if (trackedSlots && trackedSlots.size > 0) {
      enterRuntimeFrameSegment(state, 'phase1-debug-materialize');
      for (const slot of trackedSlots) {
        const arenaDesc = slotToArena.get(slot);
        if (arenaDesc && arenaDesc.offset >= 0 && arenaDesc.length > 0) {
          if (state.arena.length < arenaDesc.offset + arenaDesc.length) {
            throw new Error(
              'debug tracked slot arena too small for slot ' +
                slot +
                ' (need ' +
                (arenaDesc.offset + arenaDesc.length) +
                ', have ' +
                state.arena.length +
                ')',
            );
          }
          state.tap.recordFieldValue?.(slot, arenaDecodeToAoS(state.arena, arenaDesc));
          continue;
        }
        // [LAW:one-source-of-truth] Debug-tracked field reads must resolve through
        // the canonical arena descriptor map only.
        throw new Error('debug tracked slot missing arena descriptor for slot ' + slot);
      }
    }
  }

  // Resolve camera from program render globals (slots now populated by value evaluation)
  const resolvedCamera = resolveCameraFromGlobals(program, state);

  // Build assembler context with resolved camera and arena
  // Populate reusable module-level context to avoid per-frame object literal
  _assemblerCtx.program = program;
  _assemblerCtx.instances = instances as ReadonlyMap<string, InstanceDecl>;
  _assemblerCtx.state = state;
  _assemblerCtx.resolvedCamera = resolvedCamera;
  _assemblerCtx.arena = arena;
  _assemblerCtx.scalarExprToArenaAddress = state.cache.scalarExprToArenaAddress ?? undefined;
  _assemblerCtx.slotToArena = addressTable.slotToArena;
  _assemblerCtx.pureFnContext = pureFnContext;
  assemblerContext = _assemblerCtx as AssemblerContext;

  // Build v2 frame from collected render steps (zero allocations - uses arena)
  enterRuntimeFrameSegment(state, 'render-assembly');
  const frame = assembleRenderFrame(_renderSteps, assemblerContext);

  // PHASE 2: Execute all stateWrite steps
  // This ensures state reads in Phase 1 saw previous frame's values
  enterRuntimeFrameSegment(state, 'phase2-state-write');
  // [LAW:dataflow-not-control-flow] Phase 2 always prepares the write bank first;
  // per-step variability is encoded in written values, not whether prep runs.
  prepareStateWriteBank(state);
  for (const step of steps) {
    if (step.kind === 'stateWrite') {
      const mapping = stateSlotToMapping.get(step.stateSlot as number);
      const stride = mapping?.stride ?? 1;

      // [LAW:one-source-of-truth] State mapping stride is the canonical write width.
      const oneValue = materializeValueExpr(
        step.value,
        program.valueExprs,
        SCALAR_INSTANCE_ID,
        1,
        state,
        program,
        undefined,
        MATERIALIZE_SCRATCH,
        pureFnContext,
      );
      const baseSlot = step.stateSlot as number;
      for (let c = 0; c < stride; c++) {
        const fallback = mapping?.initial[c] ?? 0;
        state.stateWrite![baseSlot + c] = applyStateWritePolicy(mapping, oneValue[c] ?? fallback);
      }
    }
    if (step.kind === 'fieldStateWrite') {
      // Per-lane state write: evaluate field and write each lane+component.
      const mapping = stateSlotToMapping.get(step.stateSlot as number);
      if (!mapping || mapping.instanceId === undefined) {
        throw new Error('fieldStateWrite: missing field state mapping for slot ' + step.stateSlot);
      }

      const veId = step.value;
      const exprNode = valueExprs[veId as number];
      const count = mapping.laneCount;
      if (count === 0) continue;

      const tempBuffer = materializeValueExpr(
        veId,
        program.valueExprs,
        makeInstanceId(String(mapping.instanceId)),
        count,
        state,
        program,
        undefined,
        MATERIALIZE_SCRATCH,
        pureFnContext,
      );

      const srcStride = payloadStride(exprNode.type.payload);
      const copyStride = Math.min(srcStride, mapping.stride);
      const baseSlot = step.stateSlot as number;
      const src = tempBuffer as Float32Array;
      for (let lane = 0; lane < count; lane++) {
        const dstLaneBase = baseSlot + lane * mapping.stride;
        const srcLaneBase = lane * srcStride;
        for (let c = 0; c < copyStride; c++) {
          state.stateWrite![dstLaneBase + c] = applyStateWritePolicy(mapping, src[srcLaneBase + c] ?? 0);
        }
        for (let c = copyStride; c < mapping.stride; c++) {
          state.stateWrite![dstLaneBase + c] = applyStateWritePolicy(mapping, mapping.initial[c] ?? 0);
        }
      }
    }
  }
  commitStateWriteBank(state);

  // Reset scratch allocator after all materialized buffers have been consumed.
  MATERIALIZE_SCRATCH.reset();

  // 3.5 Finalize continuity frame (spec §5.1)
  // Updates time tracking and clears frame-local flags
  enterRuntimeFrameSegment(state, 'continuity-finalize');
  finalizeContinuityFrame(state);

  // [LAW:one-source-of-truth] RenderFrame output flows through one canonical
  // runtime field, not a synthetic object slot indirection.
  enterRuntimeFrameSegment(state, 'frame-output');
  state.lastRenderFrame = frame;
  if (program.outputs.length > 0) {
    const outputSpec = program.outputs[0];
    if (outputSpec.kind !== 'renderFrame') {
      throw new Error('Unsupported output kind: ' + (outputSpec as { kind?: string }).kind);
    }
    return frame;
  }

  // Fallback: no outputs defined (shouldn't happen with proper compilation)
  return frame;
}
