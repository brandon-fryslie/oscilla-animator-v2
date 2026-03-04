/**
 * Generator-based Stepped Frame Executor
 *
 * Mirrors the structure of executeFrame() in ScheduleExecutor.ts but yields
 * a StepSnapshot after each schedule step, enabling step-through debugging.
 *
 * IMPORTANT: This is a debug-only code path. The production executeFrame()
 * is never modified — this generator uses the same imported helpers.
 *
 * Invariant: Once started, the generator MUST be run to completion (or
 * finalized via .return()) to leave RuntimeState in a consistent state.
 * Abandoning mid-frame would leave incomplete Phase 2 writes.
 */

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ScheduleIR } from '../compiler/backend/schedule-program';
import type { Step, InstanceDecl, StepRender, StateMapping, StableStateId } from '../compiler/ir/types';
import type { IrInstanceId as InstanceId } from '../types';
import { instanceId as makeInstanceId } from '../core/ids';
import type { RuntimeState } from './RuntimeState';
import type { RenderFrameIR } from '../render/types';
import type { RenderBufferArena } from '../render/RenderBufferArena';
import { createMaterializeScratch } from './MaterializeScratch';
import { resolveTime } from './timeResolution';
import {
  resetFrameVolatileShapeBank,
  prepareStateWriteBank,
  commitStateWriteBank,
} from './RuntimeState';
import { detectDomainChange, recordDomainTransition } from './ContinuityMapping';
import { applyContinuity, finalizeContinuityFrame } from './ContinuityApply';
import {
  createStableDomainInstance,
  createUnstableDomainInstance,
  shouldRebuildDomainInstance,
} from './DomainIdentity';
import { assembleRenderFrame, type AssemblerContext } from './RenderAssembler';
import { resolveCameraFromGlobals } from './CameraResolver';
import { payloadStride } from '../core/canonical-types';
import type { ValueSlot, StateSlotId } from '../compiler/ir/Indices';
import { SCALAR_INSTANCE_ID } from '../compiler/ir/Indices';
import { evaluateValueExprEvent } from './ValueExprEventEvaluator';
import { materializeValueExpr } from './ValueExprMaterializer';
import { applyStateWritePolicy } from './StateWritePolicy';
import type { PureFnExecutionContext } from './ScalarKernelLibrary';
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
import type { StepSnapshot, SlotValue, StateSlotValue, ExecutionPhase } from './StepDebugTypes';
import { readSlotValue, readEventSlotValue, detectAnomalies } from './ValueInspector';

// Separate scratch allocator for stepped execution (avoid interference with production scratch)
const STEPPED_MATERIALIZE_SCRATCH = createMaterializeScratch();
const steppedStateSlotMappingCache = new WeakMap<ScheduleIR, ReadonlyMap<number, StateMapping>>();
const NO_DOMAIN_CHANGE = {
  changed: false,
  mapping: null,
} as const;

function getSteppedStateSlotToMapping(schedule: ScheduleIR): ReadonlyMap<number, StateMapping> {
  const cached = steppedStateSlotMappingCache.get(schedule);
  if (cached) {
    return cached;
  }
  const byStateSlot = new Map<number, StateMapping>();
  for (const mapping of schedule.stateMappings) {
    byStateSlot.set(mapping.slotStart, mapping);
  }
  steppedStateSlotMappingCache.set(schedule, byStateSlot);
  return byStateSlot;
}

// =============================================================================
// Helpers (duplicated from ScheduleExecutor — these are private in the original)
// =============================================================================

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

function readCanonicalNumeric(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  state: RuntimeState,
  lookup: SlotLookup,
  component: number = 0,
): number {
  const arenaDesc = resolveArenaDescriptor(slotToArena, lookup);
  return arenaRead(state.arena, arenaDesc, 0, component);
}

function resolveNumericBuffer(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  state: RuntimeState,
  slot: ValueSlot,
): Float32Array {
  const arenaDesc = slotToArena.get(slot);
  if (!arenaDesc || arenaDesc.offset < 0 || arenaDesc.length <= 0) {
    throw new Error(`resolveNumericBuffer: missing arena descriptor for numeric slot ${slot}`);
  }
  if (state.arena.length < arenaDesc.offset + arenaDesc.length) {
    throw new Error(
      `resolveNumericBuffer: arena too small for slot ${slot} (need ${arenaDesc.offset + arenaDesc.length}, have ${state.arena.length})`,
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
    throw new Error(`ensureOutputBuffer: missing arena descriptor for numeric slot ${slot}`);
  }
  if (arenaDesc.length < length) {
    throw new Error(
      `ensureOutputBuffer: arena descriptor too small for slot ${slot} (need length ${length}, have ${arenaDesc.length})`,
    );
  }
  if (state.arena.length < arenaDesc.offset + arenaDesc.length) {
    throw new Error(
      `ensureOutputBuffer: arena too small for slot ${slot} (need ${arenaDesc.offset + arenaDesc.length}, have ${state.arena.length})`,
    );
  }
  return new Float32Array(length);
}

// =============================================================================
// Snapshot builder
// =============================================================================

function buildSnapshot(
  stepIndex: number,
  step: Step | null,
  phase: ExecutionPhase,
  totalSteps: number,
  program: CompiledProgramIR,
  state: RuntimeState,
  tMs: number,
  writtenSlots: Map<ValueSlot, SlotValue>,
  previousFrameValues: ReadonlyMap<ValueSlot, number> | null,
  writtenStateSlots?: Map<StateSlotId, StateSlotValue>,
): StepSnapshot {
  const debugIndex = program.debugIndex;

  // Resolve block/port provenance
  let blockId = null as StepSnapshot['blockId'];
  let blockName = null as StepSnapshot['blockName'];
  let portId = null as StepSnapshot['portId'];

  if (step && stepIndex >= 0) {
    // Use step index as a StepId for lookup (the debugIndex.stepToBlock keys are StepId strings)
    // Try numeric-keyed lookup first
    for (const [sid, bid] of debugIndex.stepToBlock) {
      // StepId is a branded string, but the map may use numeric or string keys
      if (String(sid) === String(stepIndex)) {
        blockId = bid;
        break;
      }
    }
    if (blockId !== null) {
      blockName = debugIndex.blockDisplayNames?.get(blockId)
        ?? debugIndex.blockMap.get(blockId)
        ?? null;
    }
    if (debugIndex.stepToPort) {
      for (const [sid, pid] of debugIndex.stepToPort) {
        if (String(sid) === String(stepIndex)) {
          portId = pid;
          break;
        }
      }
    }
  }

  const anomalies = detectAnomalies(writtenSlots, debugIndex);

  return {
    stepIndex,
    step,
    phase,
    totalSteps,
    blockId,
    blockName,
    portId,
    frameId: state.cache.frameId,
    tMs,
    writtenSlots,
    writtenStateSlots: writtenStateSlots ?? new Map(),
    anomalies,
    previousFrameValues,
  };
}

// =============================================================================
// Generator executor
// =============================================================================

/**
 * Generator-based frame executor that yields StepSnapshot at each step.
 *
 * Mirrors executeFrame() exactly (same imports, same execution order,
 * same phase boundaries) but pauses between steps for inspection.
 *
 * @yields StepSnapshot after each step/phase marker
 * @returns RenderFrameIR when the frame completes
 */
export function* executeFrameStepped(
  program: CompiledProgramIR,
  state: RuntimeState,
  arena: RenderBufferArena,
  tAbsMs: number,
  previousFrameValues?: ReadonlyMap<ValueSlot, number> | null,
): Generator<StepSnapshot, RenderFrameIR, void> {
  STEPPED_MATERIALIZE_SCRATCH.reset();

  const schedule = program.schedule as ScheduleIR;
  const timeModel = schedule.timeModel;
  const instances = schedule.instances;
  const steps = schedule.steps;
  const totalSteps = steps.length;

  const prevValues = previousFrameValues ?? null;

  // [LAW:one-source-of-truth] Single address table for all slot/expr/field queries.
  // slotToArena replaces all direct program.arenaLayout[slot] accesses in this file.
  const addressTable = getExprAddressTable(program);
  const { slotLookup: slotLookupMap, slotToArena } = addressTable;
  const pureFnContext: PureFnExecutionContext = { kernelRegistry: program.kernelRegistry };

  const resolveSlotOffset = (slot: ValueSlot): SlotLookup => {
    const lookup = slotLookupMap.get(slot);
    if (!lookup) throw new Error(`Slot ${slot} not found in canonical slot lookup`);
    return lookup;
  };

  // Build reverse lookup from state slot index to StateMapping for debug labeling
  const stateSlotToMapping = getSteppedStateSlotToMapping(schedule);

  // --- PRE-FRAME SETUP ---
  state.cache.frameId++;
  resetFrameVolatileShapeBank(state);
  state.externalChannels.commit();
  const time = resolveTime(tAbsMs, timeModel, state.timeState);
  state.time = time;
  state.eventScalars.fill(0);
  state.events.forEach((payloads) => { payloads.length = 0; });

  // Yield pre-frame snapshot
  yield buildSnapshot(-1, null, 'pre-frame', totalSteps, program, state, tAbsMs, new Map(), prevValues);

  // [LAW:one-source-of-truth] Populate canonical scalar arena addresses before Phase 1
  // so extract reads resolve from compiler-emitted ExprAddressTable metadata only.
  state.cache.scalarExprToArenaAddress = addressTable.scalarExprToArenaAddress;

  // --- PHASE 1: Execute all non-stateWrite steps ---
  const valueExprs = program.valueExprs.nodes;
  const renderSteps: StepRender[] = [];

  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const step = steps[stepIdx];
    const writtenSlots = new Map<ValueSlot, SlotValue>();

    switch (step.kind) {
      case 'eventDispatch': {
        const fired = evaluateValueExprEvent(step.expr as any, program.valueExprs, state, program, pureFnContext);
        if (fired) {
          state.eventScalars[step.target as number] = 1;
        }

        // Capture event value
        writtenSlots.set(
          step.target as unknown as ValueSlot,
          readEventSlotValue(state, step.target as number),
        );
        break;
      }

      case 'materialize': {
        const veId = step.field;
        const instanceDecl = instances.get(step.instanceId);
        const count = instanceDecl
          ? (typeof instanceDecl.count === 'number' ? instanceDecl.count : instanceDecl.maxCount)
          : 0;
        // [LAW:one-source-of-truth] Arena lookup via ExprAddressTable — no direct arenaLayout access.
        const arenaDesc = slotToArena.get(step.target);
        if (!arenaDesc || arenaDesc.offset < 0 || arenaDesc.length <= 0) {
          throw new Error(`materialize: missing arena descriptor for slot ${step.target}`);
        }
        if (state.arena.length < arenaDesc.offset + arenaDesc.length) {
          throw new Error(
            `materialize: arena too small for slot ${step.target} (need ${arenaDesc.offset + arenaDesc.length}, have ${state.arena.length})`,
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
          STEPPED_MATERIALIZE_SCRATCH,
          pureFnContext,
        );
        arenaEncodeFromAoS(state.arena, arenaDesc, buffer);

        state.tap?.recordFieldValue?.(step.target, buffer);

        const valueType = valueExprs[veId as number].type;
        if (step.instanceId === SCALAR_INSTANCE_ID && buffer.length === 1) {
          writtenSlots.set(step.target, {
            kind: 'scalar',
            value: buffer[0],
            type: valueType,
          });
        } else {
          // Capture materialized buffer (materializeValueExpr returns Float32Array)
          writtenSlots.set(step.target, {
            kind: 'buffer', buffer, count: buffer.length, type: valueType,
          });
        }
        break;
      }

      case 'render': {
        renderSteps.push(step);
        break;
      }

      case 'stateWrite':
      case 'fieldStateWrite': {
        // Skipped in Phase 1 — handled in Phase 2
        break;
      }

      case 'continuityMapBuild': {
        const { instanceId } = step;
        const instance = instances.get(instanceId as InstanceId);
        if (!instance) break;
        const count = typeof instance.count === 'number' ? instance.count : instance.maxCount;
        if (count === 0) break;
        const seed = instance.elementIdSeed ?? 0;
        const previousDomain = state.continuity.prevDomains.get(instanceId);
        const identityMode = instance.identityMode === 'stable' ? 'stable' : 'none';
        if (!shouldRebuildDomainInstance(previousDomain, count, identityMode, seed)) {
          recordDomainTransition(state.continuity, instanceId, NO_DOMAIN_CHANGE);
          break;
        }
        const newDomain = identityMode === 'stable'
          ? createStableDomainInstance(count, seed)
          : createUnstableDomainInstance(count);
        const change = detectDomainChange(instanceId, newDomain, state.continuity.prevDomains);
        // [LAW:single-enforcer] Continuity transition ownership is enforced at one boundary.
        recordDomainTransition(state.continuity, instanceId, change);
        state.continuity.prevDomains.set(instanceId, newDomain);
        break;
      }

      case 'continuityApply': {
        const { policy, baseSlot, outputSlot } = step;
        void policy;
        const outputDesc = slotToArena.get(outputSlot);
        if (!outputDesc || outputDesc.offset < 0 || outputDesc.length <= 0) {
          throw new Error(`Continuity: missing arena descriptor for output slot ${outputSlot}`);
        }
        const baseBuffer = resolveNumericBuffer(slotToArena, state, baseSlot);
        const outputBuffer = baseSlot === outputSlot
          ? baseBuffer
          : ensureOutputBuffer(slotToArena, state, outputSlot, baseBuffer.length);
        applyContinuity(step, state, (slot: ValueSlot) => {
          if (slot === baseSlot) return baseBuffer;
          if (slot === outputSlot) return outputBuffer;
          const buffer = resolveNumericBuffer(slotToArena, state, slot);
          if (!buffer) throw new Error(`Continuity: Buffer not found for slot ${slot}`);
          return buffer;
        });
        arenaEncodeFromAoS(state.arena, outputDesc, outputBuffer);
        break;
      }

      default: {
        const _exhaustive: never = step;
        throw new Error(`Unknown step kind: ${(_exhaustive as Step).kind}`);
      }
    }

    // Yield snapshot for non-skipped steps
    // stateWrite and fieldStateWrite are skipped in Phase 1, but we still yield for them
    // so the debugger shows their position in the schedule
    if (step.kind !== 'stateWrite' && step.kind !== 'fieldStateWrite') {
      yield buildSnapshot(stepIdx, step, 'phase1', totalSteps, program, state, tAbsMs, writtenSlots, prevValues);
    }
  }

  // --- PHASE BOUNDARY: Render assembly ---
  const resolvedCamera = resolveCameraFromGlobals(program, state);
  const assemblerContext: AssemblerContext = {
    program,
    instances: instances as ReadonlyMap<string, InstanceDecl>,
    state,
    resolvedCamera,
    arena,
    scalarExprToArenaAddress: state.cache.scalarExprToArenaAddress ?? undefined,
    slotToArena: addressTable.slotToArena,
  };
  const frame = assembleRenderFrame(renderSteps, assemblerContext);

  yield buildSnapshot(-1, null, 'phase-boundary', totalSteps, program, state, tAbsMs, new Map(), prevValues);

  // --- PHASE 2: State writes ---
  prepareStateWriteBank(state);
  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const step = steps[stepIdx];

    if (step.kind === 'stateWrite') {
      const mapping = stateSlotToMapping.get(step.stateSlot as number);
      const stride = mapping?.stride ?? 1;
      const oneValue = materializeValueExpr(
        step.value as any,
        program.valueExprs,
        SCALAR_INSTANCE_ID,
        1,
        state,
        program,
        undefined,
        STEPPED_MATERIALIZE_SCRATCH,
        pureFnContext,
      );
      const baseSlot = step.stateSlot as number;
      for (let c = 0; c < stride; c++) {
        const fallback = mapping?.initial[c] ?? 0;
        state.stateWrite![baseSlot + c] = applyStateWritePolicy(mapping, oneValue[c] ?? fallback);
      }

      const writtenStateSlots = new Map<StateSlotId, StateSlotValue>();
      writtenStateSlots.set(step.stateSlot, {
        kind: 'scalar',
        value: state.stateWrite![step.stateSlot as number] ?? 0,
        stateId: (() => {
          if (!mapping?.stateId) throw new Error(`State slot ${step.stateSlot} has no mapping — incomplete compiler metadata`);
          return mapping.stateId;
        })(),
      });

      yield buildSnapshot(stepIdx, step, 'phase2', totalSteps, program, state, tAbsMs, new Map(), prevValues, writtenStateSlots);
    }

    if (step.kind === 'fieldStateWrite') {
      const mapping = stateSlotToMapping.get(step.stateSlot as number);
      if (!mapping || mapping.instanceId === undefined) {
        throw new Error(`fieldStateWrite: missing field state mapping for slot ${step.stateSlot}`);
      }

      const veId = step.value as any;
      const exprNode = valueExprs[veId as number];
      const count = mapping.laneCount;

      const writtenStateSlots = new Map<StateSlotId, StateSlotValue>();

      if (count > 0) {
        const instanceIdStr = String(mapping.instanceId);
        const tempBuffer = materializeValueExpr(
          veId,
          program.valueExprs,
          makeInstanceId(instanceIdStr),
          count,
          state,
          program,
          undefined,
          STEPPED_MATERIALIZE_SCRATCH,
          pureFnContext,
        );
        const baseSlot = step.stateSlot as number;
        const srcStride = payloadStride(exprNode.type.payload);
        const copyStride = Math.min(srcStride, mapping.stride);
        const src = tempBuffer as Float32Array;
        const writtenValues: number[] = [];
        for (let lane = 0; lane < count; lane++) {
          const dstLaneBase = baseSlot + lane * mapping.stride;
          const srcLaneBase = lane * srcStride;
          for (let c = 0; c < copyStride; c++) {
            const value = src[srcLaneBase + c] ?? 0;
            const normalized = applyStateWritePolicy(mapping, value);
            state.stateWrite![dstLaneBase + c] = normalized;
            writtenValues.push(normalized);
          }
          for (let c = copyStride; c < mapping.stride; c++) {
            const value = mapping.initial[c] ?? 0;
            const normalized = applyStateWritePolicy(mapping, value);
            state.stateWrite![dstLaneBase + c] = normalized;
            writtenValues.push(normalized);
          }
        }

        writtenStateSlots.set(step.stateSlot, {
          kind: 'field',
          values: writtenValues,
          stateId: (() => {
            if (!mapping?.stateId) throw new Error(`State slot ${step.stateSlot} has no mapping — incomplete compiler metadata`);
            return mapping.stateId;
          })(),
          laneCount: count,
        });
      }

      yield buildSnapshot(stepIdx, step, 'phase2', totalSteps, program, state, tAbsMs, new Map(), prevValues, writtenStateSlots);
    }
  }
  commitStateWriteBank(state);

  // --- POST-FRAME: Finalize continuity ---
  finalizeContinuityFrame(state);

  // [LAW:one-source-of-truth] RenderFrame output uses canonical runtime field.
  state.lastRenderFrame = frame;

  yield buildSnapshot(-1, null, 'post-frame', totalSteps, program, state, tAbsMs, new Map(), prevValues);

  STEPPED_MATERIALIZE_SCRATCH.reset();

  // Return the frame result
  if (program.outputs.length > 0) {
    const outputSpec = program.outputs[0];
    if (outputSpec.kind !== 'renderFrame') {
      throw new Error(`Unsupported output kind: ${(outputSpec as { kind?: string }).kind}`);
    }
    return frame;
  }
  return frame;
}
