/**
 * Schedule Executor - Core Frame Execution Loop
 *
 * Executes the IR program schedule step-by-step to produce a frame.
 * Simplified for v2 - pure IR path, no legacy complexity.
 */

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ScheduleIR } from '../compiler/backend/schedule-program';
import type { Step, InstanceDecl, DomainInstance, StepRender } from '../compiler/ir/types';
import type { IrInstanceId as InstanceId } from '../types';
import { instanceId as makeInstanceId } from '../core/ids';
import type { RuntimeState } from './RuntimeState';
import type { RenderFrameIR } from '../render/types';
import type { RenderBufferArena } from '../render/RenderBufferArena';
import { resolveTime } from './timeResolution';
import {
  writeShape2D,
  beginRuntimeFrameSemantics,
  enterRuntimeFrameSegment,
  type RuntimeFrameSegment,
} from './RuntimeState';
import {
  MATERIALIZE_SCRATCH,
  renderStepsBuffer as _renderSteps,
  shapeRecord as _shapeRecord,
  assemblerCtx as _assemblerCtx,
} from './executor-init';
import { detectDomainChange, recordDomainTransition } from './ContinuityMapping';
import { applyContinuity, finalizeContinuityFrame } from './ContinuityApply';
import { createStableDomainInstance, createUnstableDomainInstance } from './DomainIdentity';
import { assembleRenderFrame, type AssemblerContext } from './RenderAssembler';
import { resolveCameraFromGlobals } from './CameraResolver';
import { payloadStride } from '../core/canonical-types';
import type { ValueSlot } from '../compiler/ir/Indices';
import { SCALAR_INSTANCE_ID, SYSTEM_PALETTE_SLOT } from '../compiler/ir/Indices';
import { evaluateValueExprEvent } from './ValueExprEventEvaluator';
import { materializeValueExpr } from './ValueExprMaterializer';
import {
  arenaDecodeToAoS,
  arenaEncodeFromAoS,
  arenaRead,
  arenaWrite,
  type ArenaSlotDescriptor,
} from './ArenaValueStore';
import {
  type SlotLookup,
  getExprAddressTable,
  assertNumericStride,
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

function writeArenaStrided(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  state: RuntimeState,
  lookup: SlotLookup,
  src: ArrayLike<number>,
  stride: number,
): void {
  if (!isNumericStorage(lookup.storage)) {
    throw new Error(
      'writeArenaStrided: expected numeric storage for slot ' + lookup.slot + ', got ' + lookup.storage,
    );
  }
  if (lookup.stride !== stride) {
    throw new Error('writeArenaStrided: expected stride=' + stride + ' for slot ' + lookup.slot + ', got ' + lookup.stride);
  }
  const arenaDesc = resolveArenaDescriptor(slotToArena, lookup);
  for (let i = 0; i < stride; i++) {
    arenaWrite(state.arena, arenaDesc, 0, i, src[i] as number);
  }
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

// Module-level callback for events.forEach (hoisted to avoid per-frame closure)
function _clearEventPayloads(payloads: unknown[]): void {
  payloads.length = 0;
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
): RenderFrameIR {
  MATERIALIZE_SCRATCH.reset();

  // Extract schedule components
  const schedule = program.schedule as ScheduleIR;
  const timeModel = schedule.timeModel;
  const instances = schedule.instances;
  const steps = schedule.steps;
  const stateSlotToMapping = new Map<number, (typeof schedule.stateMappings)[number]>();
  for (const mapping of schedule.stateMappings) {
    stateSlotToMapping.set(mapping.slotStart, mapping);
  }

  // [LAW:one-source-of-truth] Single address table for all slot/expr/field queries.
  // slotToArena replaces all direct program.arenaLayout[slot] accesses in this file.
  const addressTable = getExprAddressTable(program);
  const { slotLookup: slotLookupMap, fieldExprToSlot, slotToArena } = addressTable;

  // Helper uses module-level resolveSlotOffsetFromMap() — no closure needed

  // 1. Advance frame (cache owns frameId)
  state.cache.frameId++;
  beginRuntimeFrameSemantics(state);

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

  // === System-reserved time outputs ===
  // These are part of the runtime contract: they are written deterministically from resolved time each frame.
  // Slot allocation/stride is enforced via slotMeta; no runtime-only side channels.
  const TIME_PALETTE_SLOT = SYSTEM_PALETTE_SLOT;
  if (!(time.palette instanceof Float32Array) || time.palette.length !== 4) {
    throw new Error('time.palette must be Float32Array(4) in RGBA [0..1]');
  }
  const palette = assertNumericStride(slotLookupMap, TIME_PALETTE_SLOT, 4, 'time.palette slot');
  writeArenaStrided(slotToArena, state, palette, time.palette, 4);

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

  // [LAW:one-source-of-truth] Populate scalarExprToArenaOffset before Phase 1 so extract
  // reads multi-component values from arena using canonical ExprAddressTable offsets.
  state.cache.scalarExprToArenaOffset = addressTable.scalarExprToArenaOffset;

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
      case 'evalOne': {
        enterRuntimeFrameSegment(state, resolvePhase1ValueSegment());
        const targetSlot = step.target;
        const lookup = resolveSlotOffsetFromMap(slotLookupMap, targetSlot);
        const { storage, offset, slot, stride } = lookup;

        if (storage === 'shape2d') {
          // Shape value: write Shape2D record to shape2d bank
          const veId = step.expr;
          const exprNode = valueExprs[veId as number];
          if (exprNode.kind === 'shapeRef') {
            // Resolve control point field slot (avoid IIFE closure)
            let cpFieldSlot = 0;
            if (exprNode.controlPointField != null) {
              const cpSlot = fieldExprToSlot.get(exprNode.controlPointField as number);
              if (cpSlot === undefined) throw new Error('Control point field ' + exprNode.controlPointField + ' not in fieldExprToSlot — compiler bug');
              cpFieldSlot = cpSlot;
            }
            // Write shape record — populate reusable record fields
            _shapeRecord.topologyId = exprNode.topologyId;
            _shapeRecord.pointsFieldSlot = cpFieldSlot;
            _shapeRecord.pointsCount = 0;
            _shapeRecord.styleRef = 0;
            _shapeRecord.flags = 0;
            writeShape2D(state.values.shape2d, offset, _shapeRecord);
          }
        } else if (isNumericStorage(storage)) {
          const arenaDesc = resolveArenaDescriptor(slotToArena, lookup);

          // [LAW:one-source-of-truth] Evaluate one-lane values through the same
          // materialization path as many-lane values (count=1).
          const buffer = materializeValueExpr(
            step.expr,
            program.valueExprs,
            SCALAR_INSTANCE_ID,
            1,
            state,
            program,
            undefined,
            MATERIALIZE_SCRATCH,
          );
          arenaEncodeFromAoS(state.arena, arenaDesc, buffer);
          if (buffer.length < stride) {
            throw new Error(
              'evalOne: materialized buffer too small for slot ' + slot + ' (need ' + stride + ', got ' + buffer.length + ')',
            );
          }

          // Debug tap: Record each component value
          for (let i = 0; i < stride; i++) {
            state.tap?.recordSlotValue?.((slot + i) as ValueSlot, readCanonicalNumeric(slotToArena, state, lookup, i));
          }
        } else {
          throw new Error('evalOne: unsupported storage type \'' + storage + '\' for slot ' + slot + ' expr ' + step.expr);
        }
        break;
      }

      case 'eventDispatch': {
        enterRuntimeFrameSegment(state, 'phase1-event-dispatch');
        eventDispatchSeen = true;
        // ValueExpr-only event evaluation (cutover complete)
        const fired = evaluateValueExprEvent(step.expr as any, program.valueExprs, state, program);

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
        const count = instanceDecl && typeof instanceDecl.count === 'number' ? instanceDecl.count : 0;
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
        );
        arenaEncodeFromAoS(state.arena, arenaDesc, buffer);

        // Debug tap: Record field value
        state.tap?.recordFieldValue?.(step.target, buffer);
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

        // Resolve count (dynamic counts need evaluation)
        const count = typeof instance.count === 'number' ? instance.count : 0;
        if (count === 0) break;

        // Create DomainInstance from InstanceDecl
        // Use identity mode from instance declaration
        let newDomain: DomainInstance;
        if (instance.identityMode === 'stable') {
          // Stable identity: generate deterministic element IDs
          const seed = instance.elementIdSeed ?? 0;
          newDomain = createStableDomainInstance(count, seed);
        } else {
          // No identity: crossfade fallback required
          newDomain = createUnstableDomainInstance(count);
        }

        // Detect domain change and compute mapping
        const change = detectDomainChange(
          instanceId,
          newDomain,
          state.continuity.prevDomains
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

        applyContinuity(step, state, (slot) => {
          if (slot === baseSlot) return baseBuffer;
          if (slot === outputSlot) return outputBuffer;
          const buffer = resolveNumericBuffer(slotToArena, state, slot);
          if (!buffer) throw new Error('Continuity: Buffer not found for slot ' + slot);
          return buffer;
        });
        arenaEncodeFromAoS(state.arena, outputDesc, outputBuffer);
        state.tap?.recordFieldValue?.(outputSlot, outputBuffer);
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
  _assemblerCtx.instances = instances as ReadonlyMap<string, InstanceDecl>;
  _assemblerCtx.state = state;
  _assemblerCtx.resolvedCamera = resolvedCamera;
  _assemblerCtx.arena = arena;
  _assemblerCtx.scalarExprToArenaOffset = state.cache.scalarExprToArenaOffset!;
  _assemblerCtx.slotToArena = addressTable.slotToArena;
  assemblerContext = _assemblerCtx as AssemblerContext;

  // Build v2 frame from collected render steps (zero allocations - uses arena)
  enterRuntimeFrameSegment(state, 'render-assembly');
  const frame = assembleRenderFrame(_renderSteps, assemblerContext);

  // PHASE 2: Execute all stateWrite steps
  // This ensures state reads in Phase 1 saw previous frame's values
  enterRuntimeFrameSegment(state, 'phase2-state-write');
  for (const step of steps) {
    if (step.kind === 'stateWrite') {
      const mapping = stateSlotToMapping.get(step.stateSlot as number);
      const stride = mapping?.stride ?? 1;

      // [LAW:one-source-of-truth] State mapping stride is the canonical write width.
      const oneValue = materializeValueExpr(
        step.value as any,
        program.valueExprs,
        SCALAR_INSTANCE_ID,
        1,
        state,
        program,
        undefined,
        MATERIALIZE_SCRATCH,
      );
      const baseSlot = step.stateSlot as number;
      for (let c = 0; c < stride; c++) {
        const fallback = mapping?.initial[c] ?? 0;
        state.state[baseSlot + c] = oneValue[c] ?? fallback;
      }
    }
    if (step.kind === 'fieldStateWrite') {
      // Per-lane state write: evaluate field and write each lane+component.
      const mapping = stateSlotToMapping.get(step.stateSlot as number);
      if (!mapping || mapping.instanceId === undefined) {
        throw new Error(`fieldStateWrite: missing field state mapping for slot ${step.stateSlot}`);
      }

      const veId = step.value as any;
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
      );

      const srcStride = payloadStride(exprNode.type.payload);
      const copyStride = Math.min(srcStride, mapping.stride);
      const baseSlot = step.stateSlot as number;
      const src = tempBuffer as Float32Array;
      for (let lane = 0; lane < count; lane++) {
        const dstLaneBase = baseSlot + lane * mapping.stride;
        const srcLaneBase = lane * srcStride;
        for (let c = 0; c < copyStride; c++) {
          state.state[dstLaneBase + c] = src[srcLaneBase + c] ?? 0;
        }
        for (let c = copyStride; c < mapping.stride; c++) {
          state.state[dstLaneBase + c] = mapping.initial[c] ?? 0;
        }
      }
    }
  }

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
