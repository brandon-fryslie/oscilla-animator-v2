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
import type { Step, InstanceDecl, DomainInstance, StepRender, StateMapping, StableStateId } from '../compiler/ir/types';
import type { IrInstanceId as InstanceId } from '../types';
import { instanceId as makeInstanceId } from '../core/ids';
import type { RuntimeState } from './RuntimeState';
import type { RenderFrameIR } from '../render/types';
import type { RenderBufferArena } from '../render/RenderBufferArena';
import { BufferPool } from './BufferPool';
import { resolveTime } from './timeResolution';
import { writeShape2D } from './RuntimeState';
import { detectDomainChange } from './ContinuityMapping';
import { applyContinuity, finalizeContinuityFrame } from './ContinuityApply';
import { createStableDomainInstance, createUnstableDomainInstance } from './DomainIdentity';
import { assembleRenderFrame, type AssemblerContext } from './RenderAssembler';
import { resolveCameraFromGlobals } from './CameraResolver';
import { requireManyInstance } from '../core/canonical-types';
import type { ValueSlot, StateSlotId } from '../compiler/ir/Indices';
import { SYSTEM_PALETTE_SLOT } from '../compiler/ir/Indices';
import { evaluateValueExprScalar, evaluateConstructScalar } from './ValueExprSignalEvaluator';
import { evaluateValueExprEvent } from './ValueExprEventEvaluator';
import { materializeValueExpr } from './ValueExprMaterializer';
import { arenaSlice, type ArenaSlotDescriptor } from './ArenaValueStore';
import {
  type SlotLookup,
  getExprAddressTable,
  assertF64Stride,
} from './ExprAddressTable';
import type { StepSnapshot, SlotValue, StateSlotValue, ExecutionPhase } from './StepDebugTypes';
import { readSlotValue, readEventSlotValue, detectAnomalies } from './ValueInspector';

// Separate pool for stepped execution (avoid interference with production pool)
const STEPPED_MATERIALIZER_POOL = new BufferPool();

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

function writeArenaScalar(slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>, state: RuntimeState, lookup: SlotLookup, value: number): void {
  if (lookup.storage !== 'f64') {
    throw new Error(`writeArenaScalar: expected f64-class storage for slot ${lookup.slot}, got ${lookup.storage}`);
  }
  if (lookup.stride !== 1) {
    throw new Error(`writeArenaScalar: expected stride=1 for slot ${lookup.slot}, got stride=${lookup.stride}`);
  }
  const arenaDesc = resolveArenaDescriptor(slotToArena, lookup);
  state.arena[arenaDesc.offset] = value;
}

function writeArenaStrided(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  state: RuntimeState,
  lookup: SlotLookup,
  src: ArrayLike<number>,
  stride: number,
): void {
  if (lookup.storage !== 'f64') {
    throw new Error(`writeArenaStrided: expected f64-class storage for slot ${lookup.slot}, got ${lookup.storage}`);
  }
  if (lookup.stride !== stride) {
    throw new Error(`writeArenaStrided: expected stride=${stride} for slot ${lookup.slot}, got ${lookup.stride}`);
  }
  const arenaDesc = resolveArenaDescriptor(slotToArena, lookup);
  const o = arenaDesc.offset;
  for (let i = 0; i < stride; i++) {
    state.arena[o + i] = src[i] as number;
  }
}

function readCanonicalNumeric(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  state: RuntimeState,
  lookup: SlotLookup,
  component: number = 0,
): number {
  const arenaDesc = resolveArenaDescriptor(slotToArena, lookup);
  return state.arena[arenaDesc.offset + component];
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
  return arenaSlice(state.arena, arenaDesc);
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
  return arenaSlice(state.arena, arenaDesc);
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
  const schedule = program.schedule as ScheduleIR;
  const timeModel = schedule.timeModel;
  const instances = schedule.instances;
  const steps = schedule.steps;
  const totalSteps = steps.length;

  const prevValues = previousFrameValues ?? null;

  // [LAW:one-source-of-truth] Single address table for all slot/expr/field queries.
  // slotToArena replaces all direct program.arenaLayout[slot] accesses in this file.
  const addressTable = getExprAddressTable(program);
  const { slotLookup: slotLookupMap, fieldExprToSlot, slotToArena } = addressTable;

  const resolveSlotOffset = (slot: ValueSlot): SlotLookup => {
    const lookup = slotLookupMap.get(slot);
    if (!lookup) throw new Error(`Slot ${slot} not found in slotMeta`);
    return lookup;
  };

  // Build slot-to-meta index for value reading
  const slotToMeta = new Map<ValueSlot, (typeof program.slotMeta)[number]>();
  for (const meta of program.slotMeta) {
    slotToMeta.set(meta.slot, meta);
  }

  // Build reverse lookup from state slot index to StateMapping for debug labeling
  const stateSlotToMapping = new Map<number, StateMapping>();
  for (const mapping of schedule.stateMappings) {
    if (mapping.kind === 'scalar') {
      stateSlotToMapping.set(mapping.slotIndex, mapping);
    } else {
      stateSlotToMapping.set(mapping.slotStart, mapping);
    }
  }

  // --- PRE-FRAME SETUP ---
  state.cache.frameId++;
  state.externalChannels.commit();
  const time = resolveTime(tAbsMs, timeModel, state.timeState);
  state.time = time;
  state.eventScalars.fill(0);
  state.events.forEach((payloads) => { payloads.length = 0; });

  // System-reserved time outputs
  const TIME_PALETTE_SLOT = SYSTEM_PALETTE_SLOT;
  if (!(time.palette instanceof Float32Array) || time.palette.length !== 4) {
    throw new Error('time.palette must be Float32Array(4) in RGBA [0..1]');
  }
  const palette = assertF64Stride(slotLookupMap, TIME_PALETTE_SLOT, 4, 'time.palette slot');
  writeArenaStrided(slotToArena, state, palette, time.palette, 4);

  // Yield pre-frame snapshot
  yield buildSnapshot(-1, null, 'pre-frame', totalSteps, program, state, tAbsMs, new Map(), prevValues);

  // [LAW:one-source-of-truth] Populate scalarExprToArenaOffset before Phase 1 so extract
  // reads multi-component signals from arena using canonical ExprAddressTable offsets.
  state.cache.scalarExprToArenaOffset = addressTable.scalarExprToArenaOffset;

  // --- PHASE 1: Execute all non-stateWrite steps ---
  const valueExprs = program.valueExprs.nodes;
  const renderSteps: StepRender[] = [];

  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const step = steps[stepIdx];
    const writtenSlots = new Map<ValueSlot, SlotValue>();

    switch (step.kind) {
      case 'evalValue': {
        const strategy = step.strategy;

        if (strategy === 0 || strategy === 1) {
          if (step.target.storage !== 'value') {
            throw new Error(`evalValue: ContinuousScalar/Field requires value storage, got ${step.target.storage}`);
          }

          const targetSlot = step.target.slot;
          const lookup = resolveSlotOffset(targetSlot);
          const { storage, offset, slot, stride } = lookup;

          if (storage === 'shape2d') {
            const veId = step.expr;
            const exprNode = valueExprs[veId as number];
            if (exprNode.kind === 'shapeRef') {
              writeShape2D(state.values.shape2d, offset, {
                topologyId: exprNode.topologyId,
                pointsFieldSlot:
                  (exprNode.kind === 'shapeRef' && exprNode.controlPointField != null
                    ? (() => {
                        const cpSlot = fieldExprToSlot.get(exprNode.controlPointField as number);
                        if (cpSlot === undefined) throw new Error(`Control point field ${exprNode.controlPointField} not in fieldExprToSlot — compiler bug`);
                        return cpSlot;
                      })()
                    : 0),
                pointsCount: 0,
                styleRef: 0,
                flags: 0,
              });
            }
            // Capture written shape
            const meta = slotToMeta.get(targetSlot);
            if (meta) {
              writtenSlots.set(targetSlot, readSlotValue(state, lookup, meta, slotToArena));
            }
          } else if (storage === 'f64') {
            const exprNode = valueExprs[step.expr as number];

            if (stride > 1 && exprNode?.kind === 'construct') {
              const arenaDesc = resolveArenaDescriptor(slotToArena, lookup);
              const written = evaluateConstructScalar(exprNode, valueExprs, state, state.arena, arenaDesc.offset);
              if (written !== stride) {
                throw new Error(`evalValue: construct wrote ${written} components but slot stride is ${stride}`);
              }
              for (let i = 0; i < stride; i++) {
                state.tap?.recordSlotValue?.((slot + i) as ValueSlot, readCanonicalNumeric(slotToArena, state, lookup, i));
              }
              state.cache.values[step.expr as number] = readCanonicalNumeric(slotToArena, state, lookup, 0);
              state.cache.stamps[step.expr as number] = state.cache.frameId;

              // Capture written slot
              const meta = slotToMeta.get(targetSlot);
              if (meta) {
                writtenSlots.set(targetSlot, readSlotValue(state, lookup, meta, slotToArena));
              }
            } else if (stride === 1) {
              const value = evaluateValueExprScalar(step.expr as any, program.valueExprs.nodes, state);
              writeArenaScalar(slotToArena, state, lookup, value);
              state.tap?.recordSlotValue?.(slot, value);
              state.cache.values[step.expr as number] = value;
              state.cache.stamps[step.expr as number] = state.cache.frameId;

              // Capture written scalar
              const meta = slotToMeta.get(targetSlot);
              if (meta) {
                writtenSlots.set(targetSlot, { kind: 'scalar', value, type: meta.type });
              }
            } else {
              throw new Error(
                `evalValue: stride=${stride} slot ${slot} requires construct expression, got ${exprNode?.kind ?? 'unknown'}`
              );
            }
          } else {
            throw new Error(`evalValue: unsupported storage type '${storage}' for slot ${slot} expr ${step.expr} strategy ${strategy}`);
          }
        } else if (strategy === 2 || strategy === 3) {
          if (step.target.storage !== 'event') {
            throw new Error(`evalValue: DiscreteScalar/Field requires event storage, got ${step.target.storage}`);
          }

          const fired = evaluateValueExprEvent(step.expr as any, program.valueExprs, state, program);
          if (fired) {
            state.eventScalars[step.target.slot as number] = 1;
          }

          // Capture event value
          writtenSlots.set(
            step.target.slot as unknown as ValueSlot,
            readEventSlotValue(state, step.target.slot as number),
          );
        } else {
          throw new Error(`evalValue: unknown strategy ${strategy}`);
        }
        break;
      }

      case 'materialize': {
        const veId = step.field;
        const instanceDecl = instances.get(step.instanceId);
        const count = instanceDecl && typeof instanceDecl.count === 'number' ? instanceDecl.count : 0;
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
        const arenaTarget = arenaSlice(state.arena, arenaDesc);
        const buffer = materializeValueExpr(
          veId, program.valueExprs, step.instanceId, count, state, program, STEPPED_MATERIALIZER_POOL, arenaTarget,
        );

        state.tap?.recordFieldValue?.(step.target, buffer);

        // Capture materialized buffer (materializeValueExpr returns Float32Array)
        writtenSlots.set(step.target, {
          kind: 'buffer', buffer, count: buffer.length, type: valueExprs[veId as number].type,
        });
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
        const count = typeof instance.count === 'number' ? instance.count : 0;
        if (count === 0) break;
        let newDomain: DomainInstance;
        if (instance.identityMode === 'stable') {
          newDomain = createStableDomainInstance(count, instance.elementIdSeed ?? 0);
        } else {
          newDomain = createUnstableDomainInstance(count);
        }
        const { changed, mapping } = detectDomainChange(instanceId, newDomain, state.continuity.prevDomains);
        if (changed) {
          if (mapping) {
            state.continuity.mappings.set(instanceId, mapping);
          } else {
            state.continuity.mappings.delete(instanceId);
          }
          state.continuity.domainChangeThisFrame = true;
        }
        state.continuity.prevDomains.set(instanceId, newDomain);
        break;
      }

      case 'continuityApply': {
        const { policy, baseSlot, outputSlot } = step;
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
    instances: instances as ReadonlyMap<string, InstanceDecl>,
    state,
    resolvedCamera,
    arena,
    scalarExprToArenaOffset: state.cache.scalarExprToArenaOffset!,
    slotToArena: addressTable.slotToArena,
  };
  const frame = assembleRenderFrame(renderSteps, assemblerContext);

  yield buildSnapshot(-1, null, 'phase-boundary', totalSteps, program, state, tAbsMs, new Map(), prevValues);

  // --- PHASE 2: State writes ---
  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const step = steps[stepIdx];

    if (step.kind === 'stateWrite') {
      const value = evaluateValueExprScalar(step.value as any, program.valueExprs.nodes, state);
      state.state[step.stateSlot as number] = value;

      const writtenStateSlots = new Map<StateSlotId, StateSlotValue>();
      const mapping = stateSlotToMapping.get(step.stateSlot as number);
      writtenStateSlots.set(step.stateSlot, {
        kind: 'scalar',
        value,
        stateId: (() => {
          if (!mapping?.stateId) throw new Error(`State slot ${step.stateSlot} has no mapping — incomplete compiler metadata`);
          return mapping.stateId;
        })(),
      });

      yield buildSnapshot(stepIdx, step, 'phase2', totalSteps, program, state, tAbsMs, new Map(), prevValues, writtenStateSlots);
    }

    if (step.kind === 'fieldStateWrite') {
      const veId = step.value as any;
      const exprNode = valueExprs[veId as number];
      const instanceRef = requireManyInstance(exprNode.type);
      const instanceDecl = instances.get(instanceRef.instanceId);
      const count = instanceDecl && typeof instanceDecl.count === 'number' ? instanceDecl.count : 0;

      const writtenStateSlots = new Map<StateSlotId, StateSlotValue>();

      if (count > 0) {
        const instanceIdStr = String(instanceRef.instanceId);
        const tempBuffer = materializeValueExpr(
          veId, program.valueExprs, makeInstanceId(instanceIdStr), count, state, program, STEPPED_MATERIALIZER_POOL,
        );
        const baseSlot = step.stateSlot as number;
        const src = tempBuffer as Float32Array;
        const writtenValues: number[] = [];
        for (let i = 0; i < count && i < src.length; i++) {
          state.state[baseSlot + i] = src[i];
          writtenValues.push(src[i]);
        }

        const mapping = stateSlotToMapping.get(baseSlot);
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

  // --- POST-FRAME: Finalize continuity ---
  finalizeContinuityFrame(state);

  // Store frame in output slot
  if (program.outputs.length > 0) {
    const outputSpec = program.outputs[0];
    const { storage, slot } = resolveSlotOffset(outputSpec.slot);
    if (storage === 'object') {
      state.values.objects.set(slot, frame);
    } else {
      throw new Error(`Output slot expects object storage, got ${storage}`);
    }
  }

  yield buildSnapshot(-1, null, 'post-frame', totalSteps, program, state, tAbsMs, new Map(), prevValues);

  // Return the frame result
  if (program.outputs.length > 0) {
    const outputSpec = program.outputs[0];
    const { slot } = resolveSlotOffset(outputSpec.slot);
    const outputFrame = state.values.objects.get(slot);
    if (!outputFrame) throw new Error('Output frame not found in slot');
    return outputFrame as RenderFrameIR;
  }
  return frame;
}
