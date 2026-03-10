/**
 * Generator-based Stepped Frame Executor
 *
 * Mirrors the structure of executeFrame() in ScheduleExecutor.ts but yields
 * a StepSnapshot after each schedule step, enabling step-through debugging.
 */

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ScheduleIR } from '../compiler/backend/schedule-program';
import type { Step, StateMapping, StableStateId, InstanceDecl } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import { EMPTY_LEGACY_RENDER_FRAME, type LegacyRenderFrame } from '../render/types';
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
import { payloadStride } from '../core/canonical-types';
import { valueSlot } from '../compiler/ir/Indices';
import type { ValueExprId, ValueSlot, StateSlotId, InstanceId } from '../compiler/ir/Indices';
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
} from './ExprAddressTable';
import type { StepSnapshot, SlotValue, StateSlotValue, ExecutionPhase } from './StepDebugTypes';
import { readEventSlotValue, detectAnomalies } from './ValueInspector';

const STEPPED_MATERIALIZE_SCRATCH = createMaterializeScratch();
const steppedStateSlotMappingCache = new WeakMap<ScheduleIR, ReadonlyMap<number, StateMapping>>();
const NO_DOMAIN_CHANGE = {
  changed: false,
  mapping: null,
} as const;

interface SnapshotBuildInput {
  readonly stepIndex: number;
  readonly step: Step | null;
  readonly phase: ExecutionPhase;
  readonly totalSteps: number;
  readonly program: CompiledProgramIR;
  readonly state: RuntimeState;
  readonly tMs: number;
  readonly writtenSlots: Map<ValueSlot, SlotValue>;
  readonly previousFrameValues: ReadonlyMap<ValueSlot, number> | null;
  readonly writtenStateSlots?: Map<StateSlotId, StateSlotValue>;
}

interface SnapshotStepBinding {
  readonly blockId: StepSnapshot['blockId'];
  readonly blockName: StepSnapshot['blockName'];
  readonly portId: StepSnapshot['portId'];
}

interface SteppedContext {
  readonly program: CompiledProgramIR;
  readonly state: RuntimeState;
  readonly arena: RenderBufferArena;
  readonly tAbsMs: number;
  readonly totalSteps: number;
  readonly schedule: ScheduleIR;
  readonly instances: ReadonlyMap<InstanceId, InstanceDecl>;
  readonly steps: readonly Step[];
  readonly valueExprs: readonly CompiledProgramIR['valueExprs']['nodes'][number][];
  readonly slotLookupMap: ReadonlyMap<ValueSlot, SlotLookup>;
  readonly slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>;
  readonly stateSlotToMapping: ReadonlyMap<number, StateMapping>;
  readonly pureFnContext: PureFnExecutionContext;
  readonly previousFrameValues: ReadonlyMap<ValueSlot, number> | null;
}

interface Phase1StepResult {
  readonly shouldYield: boolean;
  readonly writtenSlots: Map<ValueSlot, SlotValue>;
}

function createWrittenSlots(): Map<ValueSlot, SlotValue> {
  return new Map<ValueSlot, SlotValue>();
}

function createWrittenStateSlots(): Map<StateSlotId, StateSlotValue> {
  return new Map<StateSlotId, StateSlotValue>();
}

function resolveStateSlotIndex(slot: StateSlotId): number {
  return slot as number;
}

function resolveStride(mapping: StateMapping | undefined): number {
  return mapping?.stride ?? 1;
}

function resolveFieldCopyStride(srcStride: number, mapping: StateMapping): number {
  return Math.min(srcStride, mapping.stride);
}

function hasRenderFrameOutput(program: CompiledProgramIR): boolean {
  return program.outputs[0]?.kind === 'renderFrame';
}

function getSteppedStateSlotToMapping(schedule: ScheduleIR): ReadonlyMap<number, StateMapping> {
  const cached = steppedStateSlotMappingCache.get(schedule);
  if (cached) return cached;
  const byStateSlot = new Map<number, StateMapping>();
  for (const mapping of schedule.stateMappings) {
    byStateSlot.set(mapping.slotStart, mapping);
  }
  steppedStateSlotMappingCache.set(schedule, byStateSlot);
  return byStateSlot;
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

function resolveSlotOffset(slotLookupMap: ReadonlyMap<ValueSlot, SlotLookup>, slot: ValueSlot): SlotLookup {
  const lookup = slotLookupMap.get(slot);
  if (!lookup) throw new Error(`Slot ${slot} not found in canonical slot lookup`);
  return lookup;
}

function findStepBinding<T>(entries: ReadonlyMap<unknown, T> | undefined, stepIndex: number): T | null {
  if (!entries) return null;
  for (const [sid, value] of entries) {
    if (String(sid) === String(stepIndex)) {
      return value;
    }
  }
  return null;
}

function resolveSnapshotStepBinding(
  program: CompiledProgramIR,
  stepIndex: number,
  step: Step | null,
): SnapshotStepBinding {
  if (!step || stepIndex < 0) {
    return {
      blockId: null,
      blockName: null,
      portId: null,
    };
  }
  const debugIndex = program.debugIndex;
  const blockId = findStepBinding(debugIndex.stepToBlock, stepIndex);
  const blockName = blockId === null
    ? null
    : debugIndex.blockDisplayNames?.get(blockId) ?? debugIndex.blockMap.get(blockId) ?? null;
  return {
    blockId,
    blockName,
    portId: findStepBinding(debugIndex.stepToPort, stepIndex),
  };
}

function buildSnapshot(input: SnapshotBuildInput): StepSnapshot {
  const binding = resolveSnapshotStepBinding(input.program, input.stepIndex, input.step);
  const anomalies = detectAnomalies(input.writtenSlots, input.program.debugIndex);
  return {
    stepIndex: input.stepIndex,
    step: input.step,
    phase: input.phase,
    totalSteps: input.totalSteps,
    blockId: binding.blockId,
    blockName: binding.blockName,
    portId: binding.portId,
    frameId: input.state.cache.frameId,
    tMs: input.tMs,
    writtenSlots: input.writtenSlots,
    writtenStateSlots: input.writtenStateSlots ?? createWrittenStateSlots(),
    anomalies,
    previousFrameValues: input.previousFrameValues,
  };
}

function createSteppedContext(
  program: CompiledProgramIR,
  state: RuntimeState,
  arena: RenderBufferArena,
  tAbsMs: number,
  previousFrameValues?: ReadonlyMap<ValueSlot, number> | null,
): SteppedContext {
  const schedule = program.schedule as ScheduleIR;
  const addressTable = getExprAddressTable(program);
  return {
    program,
    state,
    arena,
    tAbsMs,
    totalSteps: schedule.steps.length,
    schedule,
    instances: schedule.instances,
    steps: schedule.steps,
    valueExprs: program.valueExprs.nodes,
    slotLookupMap: addressTable.slotLookup,
    slotToArena: addressTable.slotToArena,
    stateSlotToMapping: getSteppedStateSlotToMapping(schedule),
    pureFnContext: { kernelRegistry: program.kernelRegistry },
    previousFrameValues: previousFrameValues ?? null,
  };
}

function initializeSteppedFrame(context: SteppedContext): void {
  context.state.cache.frameId++;
  resetFrameVolatileShapeBank(context.state);
  context.state.externalChannels.commit();
  context.state.time = resolveTime(context.tAbsMs, context.schedule.timeModel, context.state.timeState);
  context.state.eventScalars.fill(0);
  context.state.events.forEach((payloads) => { payloads.length = 0; });
  // [LAW:one-source-of-truth] Scalar expr addresses come from ExprAddressTable only.
  context.state.cache.scalarExprToArenaAddress = getExprAddressTable(context.program).scalarExprToArenaAddress;
}

function createMaterializedSlotValue(
  context: SteppedContext,
  veId: ValueExprId,
  stepTarget: ValueSlot,
  stepInstanceId: InstanceId,
): SlotValue {
  const instanceDecl = context.instances.get(stepInstanceId);
  const count = instanceDecl
    ? resolveInstanceLaneCount(instanceDecl, context.program, context.state, context.pureFnContext)
    : 0;
  const arenaDesc = context.slotToArena.get(stepTarget);
  if (!arenaDesc || arenaDesc.offset < 0 || arenaDesc.length <= 0) {
    throw new Error(`materialize: missing arena descriptor for slot ${stepTarget}`);
  }
  if (context.state.arena.length < arenaDesc.offset + arenaDesc.length) {
    throw new Error(
      `materialize: arena too small for slot ${stepTarget} (need ${arenaDesc.offset + arenaDesc.length}, have ${context.state.arena.length})`,
    );
  }
  const buffer = materializeValueExpr(
    veId,
    context.program.valueExprs,
    stepInstanceId,
    count,
    context.state,
    context.program,
    undefined,
    STEPPED_MATERIALIZE_SCRATCH,
    context.pureFnContext,
  );
  arenaEncodeFromAoS(context.state.arena, arenaDesc, buffer);
  context.state.tap?.recordFieldValue?.(stepTarget, buffer);
  const valueType = context.valueExprs[veId].type;
  if (stepInstanceId === SCALAR_INSTANCE_ID && buffer.length === 1) {
    return { kind: 'scalar', value: buffer[0], type: valueType };
  }
  return { kind: 'buffer', buffer, count: buffer.length, type: valueType };
}

function applyPhase1ContinuityMap(
  context: SteppedContext,
  step: Extract<Step, { kind: 'continuityMapBuild' }>,
): void {
  const instance = context.instances.get(step.instanceId as InstanceId);
  if (!instance) return;
  const count = resolveInstanceLaneCount(instance, context.program, context.state, context.pureFnContext);
  if (count === 0) return;
  const seed = instance.elementIdSeed ?? 0;
  const previousDomain = context.state.continuity.prevDomains.get(step.instanceId);
  const identityMode = instance.identityMode === 'stable' ? 'stable' : 'none';
  if (!shouldRebuildDomainInstance(previousDomain, count, identityMode, seed)) {
    recordDomainTransition(context.state.continuity, step.instanceId, NO_DOMAIN_CHANGE);
    return;
  }
  const newDomain = identityMode === 'stable'
    ? createStableDomainInstance(count, seed)
    : createUnstableDomainInstance(count);
  const change = detectDomainChange(step.instanceId, newDomain, context.state.continuity.prevDomains);
  // [LAW:single-enforcer] Continuity transition ownership is enforced once at record boundary.
  recordDomainTransition(context.state.continuity, step.instanceId, change);
  context.state.continuity.prevDomains.set(step.instanceId, newDomain);
}

function applyPhase1Continuity(
  context: SteppedContext,
  step: Extract<Step, { kind: 'continuityApply' }>,
): void {
  const outputDesc = context.slotToArena.get(step.outputSlot);
  if (!outputDesc || outputDesc.offset < 0 || outputDesc.length <= 0) {
    throw new Error(`Continuity: missing arena descriptor for output slot ${step.outputSlot}`);
  }
  const baseBuffer = resolveNumericBuffer(context.slotToArena, context.state, step.baseSlot);
  const outputBuffer = step.baseSlot === step.outputSlot
    ? baseBuffer
    : ensureOutputBuffer(context.slotToArena, context.state, step.outputSlot, baseBuffer.length);
  applyContinuity(step, context.state, (slot: ValueSlot) => {
    if (slot === step.baseSlot) return baseBuffer;
    if (slot === step.outputSlot) return outputBuffer;
    return resolveNumericBuffer(context.slotToArena, context.state, slot);
  });
  arenaEncodeFromAoS(context.state.arena, outputDesc, outputBuffer);
}

function runPhase1Step(context: SteppedContext, step: Step): Phase1StepResult {
  const writtenSlots = createWrittenSlots();
  switch (step.kind) {
    case 'eventDispatch': {
      const fired = evaluateValueExprEvent(step.expr, context.program.valueExprs, context.state, context.program, context.pureFnContext);
      if (fired) {
        context.state.eventScalars[step.target] = 1;
      }
      writtenSlots.set(valueSlot(step.target), readEventSlotValue(context.state, step.target));
      return { shouldYield: true, writtenSlots };
    }

    case 'materialize': {
      const value = createMaterializedSlotValue(context, step.field, step.target, step.instanceId);
      writtenSlots.set(step.target, value);
      return { shouldYield: true, writtenSlots };
    }

    case 'render': {
      // [LAW:one-way-deps] Canonical render execution is GPU-owned.
      return { shouldYield: true, writtenSlots };
    }

    case 'stateWrite':
    case 'fieldStateWrite': {
      return { shouldYield: false, writtenSlots };
    }

    case 'continuityMapBuild': {
      applyPhase1ContinuityMap(context, step);
      return { shouldYield: true, writtenSlots };
    }

    case 'continuityApply': {
      applyPhase1Continuity(context, step);
      return { shouldYield: true, writtenSlots };
    }

    default: {
      const _exhaustive: never = step;
      throw new Error(`Unknown step kind: ${(_exhaustive as Step).kind}`);
    }
  }
}

function* runPhase1(context: SteppedContext): Generator<StepSnapshot, void, void> {
  for (let stepIdx = 0; stepIdx < context.steps.length; stepIdx++) {
    const step = context.steps[stepIdx];
    const result = runPhase1Step(context, step);
    if (!result.shouldYield) continue;
    yield buildSnapshot({
      stepIndex: stepIdx,
      step,
      phase: 'phase1',
      totalSteps: context.totalSteps,
      program: context.program,
      state: context.state,
      tMs: context.tAbsMs,
      writtenSlots: result.writtenSlots,
      previousFrameValues: context.previousFrameValues,
    });
  }
}

function createScalarStateWriteSnapshot(
  context: SteppedContext,
  step: Extract<Step, { kind: 'stateWrite' }>,
): Map<StateSlotId, StateSlotValue> {
  const stateSlot = resolveStateSlotIndex(step.stateSlot);
  const mapping = context.stateSlotToMapping.get(stateSlot);
  const stride = resolveStride(mapping);
  const values = materializeValueExpr(
    step.value,
    context.program.valueExprs,
    SCALAR_INSTANCE_ID,
    1,
    context.state,
    context.program,
    undefined,
    STEPPED_MATERIALIZE_SCRATCH,
    context.pureFnContext,
  );
  const baseSlot = stateSlot;
  for (let c = 0; c < stride; c++) {
    const fallback = mapping?.initial[c] ?? 0;
    context.state.stateWrite![baseSlot + c] = applyStateWritePolicy(mapping, values[c] ?? fallback);
  }
  const stateId = mapping?.stateId;
  if (!stateId) {
    throw new Error(`State slot ${step.stateSlot} has no mapping - incomplete compiler metadata`);
  }
  const written = createWrittenStateSlots();
  written.set(step.stateSlot, {
    kind: 'scalar',
    value: context.state.stateWrite![stateSlot] ?? 0,
    stateId,
  });
  return written;
}

interface FieldStateWriteValuesInput {
  readonly mapping: StateMapping;
  readonly stepStateSlot: number;
  readonly src: Float32Array;
  readonly srcStride: number;
  readonly copyStride: number;
  readonly stateWrite: Float32Array;
}

function writeFieldStateValues(input: FieldStateWriteValuesInput): number[] {
  const writtenValues: number[] = [];
  const { mapping, stepStateSlot, src, srcStride, copyStride, stateWrite } = input;
  for (let lane = 0; lane < mapping.laneCount; lane++) {
    const dstLaneBase = stepStateSlot + lane * mapping.stride;
    const srcLaneBase = lane * srcStride;
    for (let c = 0; c < copyStride; c++) {
      const normalized = applyStateWritePolicy(mapping, src[srcLaneBase + c] ?? 0);
      stateWrite[dstLaneBase + c] = normalized;
      writtenValues.push(normalized);
    }
    for (let c = copyStride; c < mapping.stride; c++) {
      const normalized = applyStateWritePolicy(mapping, mapping.initial[c] ?? 0);
      stateWrite[dstLaneBase + c] = normalized;
      writtenValues.push(normalized);
    }
  }
  return writtenValues;
}

function createFieldStateWriteSnapshot(
  context: SteppedContext,
  step: Extract<Step, { kind: 'fieldStateWrite' }>,
): Map<StateSlotId, StateSlotValue> {
  const stateSlot = resolveStateSlotIndex(step.stateSlot);
  const mapping = context.stateSlotToMapping.get(stateSlot);
  if (!mapping || mapping.instanceId === undefined) {
    throw new Error(`fieldStateWrite: missing field state mapping for slot ${step.stateSlot}`);
  }
  const written = createWrittenStateSlots();
  if (mapping.laneCount === 0) return written;
  const tempBuffer = materializeValueExpr(
    step.value,
    context.program.valueExprs,
    mapping.instanceId,
    mapping.laneCount,
    context.state,
    context.program,
    undefined,
    STEPPED_MATERIALIZE_SCRATCH,
    context.pureFnContext,
  );
  const exprNode = context.valueExprs[step.value];
  const srcStride = payloadStride(exprNode.type.payload);
  const copyStride = resolveFieldCopyStride(srcStride, mapping);
  const writtenValues = writeFieldStateValues({
    mapping,
    stepStateSlot: stateSlot,
    src: tempBuffer,
    srcStride,
    copyStride,
    stateWrite: context.state.stateWrite!,
  });
  if (!mapping.stateId) {
    throw new Error(`State slot ${step.stateSlot} has no mapping - incomplete compiler metadata`);
  }
  written.set(step.stateSlot, {
    kind: 'field',
    values: writtenValues,
    stateId: mapping.stateId as StableStateId,
    laneCount: mapping.laneCount,
  });
  return written;
}

function* runPhase2(context: SteppedContext): Generator<StepSnapshot, void, void> {
  prepareStateWriteBank(context.state);
  for (let stepIdx = 0; stepIdx < context.steps.length; stepIdx++) {
    const step = context.steps[stepIdx];
    let writtenStateSlots: Map<StateSlotId, StateSlotValue> | null = null;
    if (step.kind === 'stateWrite') {
      writtenStateSlots = createScalarStateWriteSnapshot(context, step);
    }
    if (step.kind === 'fieldStateWrite') {
      writtenStateSlots = createFieldStateWriteSnapshot(context, step);
    }
    if (!writtenStateSlots) continue;
    yield buildSnapshot({
      stepIndex: stepIdx,
      step,
      phase: 'phase2',
      totalSteps: context.totalSteps,
      program: context.program,
      state: context.state,
      tMs: context.tAbsMs,
      writtenSlots: createWrittenSlots(),
      previousFrameValues: context.previousFrameValues,
      writtenStateSlots,
    });
  }
  commitStateWriteBank(context.state);
}

function validateFrameOutput(program: CompiledProgramIR, frame: LegacyRenderFrame): LegacyRenderFrame {
  const outputSpec = program.outputs[0];
  if (!outputSpec) return frame;
  if (!hasRenderFrameOutput(program)) {
    throw new Error(`Unsupported output kind: ${(outputSpec as { kind?: string }).kind}`);
  }
  return frame;
}

function createPhaseMarkerSnapshot(
  context: SteppedContext,
  phase: Extract<ExecutionPhase, 'pre-frame' | 'phase-boundary' | 'post-frame'>,
): StepSnapshot {
  return buildSnapshot({
    stepIndex: -1,
    step: null,
    phase,
    totalSteps: context.totalSteps,
    program: context.program,
    state: context.state,
    tMs: context.tAbsMs,
    writtenSlots: createWrittenSlots(),
    previousFrameValues: context.previousFrameValues,
  });
}

function createSteppedFrameSentinel(): LegacyRenderFrame {
  return EMPTY_LEGACY_RENDER_FRAME;
}

/**
 * Generator-based frame executor that yields StepSnapshot at each step.
 */
export function* executeFrameStepped(
  program: CompiledProgramIR,
  state: RuntimeState,
  arena: RenderBufferArena,
  tAbsMs: number,
  previousFrameValues?: ReadonlyMap<ValueSlot, number> | null,
): Generator<StepSnapshot, LegacyRenderFrame, void> {
  STEPPED_MATERIALIZE_SCRATCH.reset();
  const context = createSteppedContext(program, state, arena, tAbsMs, previousFrameValues);
  initializeSteppedFrame(context);

  yield createPhaseMarkerSnapshot(context, 'pre-frame');

  yield* runPhase1(context);

  const frame = createSteppedFrameSentinel();
  yield createPhaseMarkerSnapshot(context, 'phase-boundary');

  yield* runPhase2(context);
  finalizeContinuityFrame(state);
  // [LAW:one-source-of-truth] RenderFrame output uses canonical runtime field.
  state.lastLegacyRenderFrame = frame;

  yield createPhaseMarkerSnapshot(context, 'post-frame');

  STEPPED_MATERIALIZE_SCRATCH.reset();
  return validateFrameOutput(program, frame);
}
