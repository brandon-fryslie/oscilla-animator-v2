/**
 * Schedule Executor - Core Frame Execution Loop
 *
 * Executes the IR program schedule step-by-step to produce a frame.
 * Simplified for v2 - pure IR path, no legacy complexity.
 */

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ScheduleIR } from '../compiler/backend/schedule-program';
import type { Step, InstanceDecl } from '../compiler/ir/types';
import type { IrInstanceId as InstanceId } from '../types';
import { instanceId as makeInstanceId } from '../core/ids';
import type { RuntimeState } from './RuntimeState';
import { EMPTY_RENDER_FRAME, type RenderFrameIR } from '../render/types';
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
} from './executor-init';
import { detectDomainChange, recordDomainTransition } from './ContinuityMapping';
import { applyContinuity, finalizeContinuityFrame } from './ContinuityApply';
import {
  createStableDomainInstance,
  createUnstableDomainInstance,
  shouldRebuildDomainInstance,
} from './DomainIdentity';
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

type StateSlotMapping = ScheduleIR['stateMappings'][number];
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

interface RuntimeWriteAssertionInput {
  readonly slotLookupMap: ReadonlyMap<ValueSlot, SlotLookup>;
  readonly instances: ReadonlyMap<InstanceId, InstanceDecl>;
  readonly state: RuntimeState;
  readonly stepKind: Step['kind'];
  readonly slot: ValueSlot;
  readonly observedKind: RuntimeWriteKind;
  readonly observedLaneCount: number;
}

function assertRuntimeSlotWrite(input: RuntimeWriteAssertionInput): void {
  const lookup = resolveSlotOffsetFromMap(input.slotLookupMap, input.slot);
  const expectedKind = deriveRuntimeValueKind(lookup.type);
  if (expectedKind === 'event') {
    throw new Error(
      `Internal error: non-event step ${input.stepKind} attempted to write to event-typed slot ${input.slot} ` +
      `(discrete temporality slots must only be written by eventDispatch; observed write kind: ${input.observedKind})`,
    );
  }
  if (expectedKind !== input.observedKind) {
    throw new Error(
      `Cardinality write assertion failed at ${input.stepKind} slot ${input.slot}: ` +
      `expected ${expectedKind}, actual ${input.observedKind}`,
    );
  }
  if (lookup.arena.laneCount !== input.observedLaneCount) {
    throw new Error(
      `Cardinality write assertion failed at ${input.stepKind} slot ${input.slot}: ` +
      `expected laneCount ${lookup.arena.laneCount}, actual ${input.observedLaneCount}`,
    );
  }
  const expectedLaneCount = deriveExpectedLaneCount(lookup, input.instances, input.state);
  if (expectedLaneCount !== null && expectedLaneCount !== input.observedLaneCount) {
    throw new Error(
      `Cardinality write assertion failed at ${input.stepKind} slot ${input.slot}: ` +
      `expected cardinality lanes ${expectedLaneCount}, actual ${input.observedLaneCount}`,
    );
  }
}

interface ExecuteFrameContext {
  readonly program: CompiledProgramIR;
  readonly state: RuntimeState;
  readonly arena: RenderBufferArena;
  readonly tAbsMs: number;
  readonly schedule: ScheduleIR;
  readonly instances: ReadonlyMap<InstanceId, InstanceDecl>;
  readonly steps: readonly Step[];
  readonly stateSlotToMapping: ReadonlyMap<number, StateSlotMapping>;
  readonly slotLookupMap: ReadonlyMap<ValueSlot, SlotLookup>;
  readonly slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>;
  readonly pureFnContext: PureFnExecutionContext;
  readonly assertCardinalitySlotWrites: boolean;
  readonly valueExprs: readonly CompiledProgramIR['valueExprs']['nodes'][number][];
  eventDispatchSeen: boolean;
  continuityMapSeen: boolean;
}

function createExecuteFrameContext(
  program: CompiledProgramIR,
  state: RuntimeState,
  arena: RenderBufferArena,
  tAbsMs: number,
  options?: ExecuteFrameOptions,
): ExecuteFrameContext {
  MATERIALIZE_SCRATCH.reset();
  const schedule = program.schedule as ScheduleIR;
  const instances = schedule.instances;
  const steps = schedule.steps;
  const stateSlotToMapping = getStateSlotToMapping(schedule);
  const addressTable = getExprAddressTable(program);
  const { slotLookup: slotLookupMap, slotToArena } = addressTable;
  const pureFnContext: PureFnExecutionContext = { kernelRegistry: program.kernelRegistry };
  const assertCardinalitySlotWrites = options?.assertCardinalitySlotWrites === true;
  return {
    program,
    state,
    arena,
    tAbsMs,
    schedule,
    instances,
    steps,
    stateSlotToMapping,
    slotLookupMap,
    slotToArena,
    pureFnContext,
    assertCardinalitySlotWrites,
    valueExprs: program.valueExprs.nodes,
    eventDispatchSeen: false,
    continuityMapSeen: false,
  };
}

function initializeFrame(context: ExecuteFrameContext): void {
  const { program, schedule, state, tAbsMs } = context;
  state.cache.frameId++;
  beginRuntimeFrameSemantics(state);
  resetFrameVolatileShapeBank(state);
  enterRuntimeFrameSegment(state, 'preframe-external-input');
  state.externalChannels.commit();
  enterRuntimeFrameSegment(state, 'preframe-time-resolve');
  const time = resolveTime(tAbsMs, schedule.timeModel, state.timeState);
  state.time = time;
  enterRuntimeFrameSegment(state, 'preframe-event-reset');
  state.eventScalars.fill(0);
  state.events.forEach(_clearEventPayloads);
  // [LAW:one-source-of-truth] Populate canonical scalar arena addresses before Phase 1.
  state.cache.scalarExprToArenaAddress = getExprAddressTable(program).scalarExprToArenaAddress;
}

function resolvePhase1ValueSegment(context: ExecuteFrameContext): RuntimeFrameSegment {
  if (context.eventDispatchSeen) return 'phase1-value-post-event';
  if (context.continuityMapSeen) return 'phase1-value-after-map';
  return 'phase1-value-pre-event';
}

function assertSlotWriteIfEnabled(context: ExecuteFrameContext, input: Omit<RuntimeWriteAssertionInput, 'slotLookupMap' | 'instances' | 'state'>): void {
  if (!context.assertCardinalitySlotWrites) return;
  assertRuntimeSlotWrite({
    ...input,
    slotLookupMap: context.slotLookupMap,
    instances: context.instances,
    state: context.state,
  });
}

function materializeStepBuffer(context: ExecuteFrameContext, step: Extract<Step, { kind: 'materialize' }>): Float32Array {
  const instanceDecl = context.instances.get(step.instanceId);
  const count = instanceDecl
    ? resolveInstanceLaneCount(instanceDecl, context.program, context.state, context.pureFnContext)
    : 0;
  const arenaDesc = context.slotToArena.get(step.target);
  if (!arenaDesc || arenaDesc.offset < 0 || arenaDesc.length <= 0) {
    throw new Error('materialize: missing arena descriptor for slot ' + step.target);
  }
  if (context.state.arena.length < arenaDesc.offset + arenaDesc.length) {
    throw new Error(
      'materialize: arena too small for slot ' + step.target + ' (need ' + (arenaDesc.offset + arenaDesc.length) + ', have ' + context.state.arena.length + ')',
    );
  }
  const buffer = materializeValueExpr(
    step.field,
    context.program.valueExprs,
    step.instanceId,
    count,
    context.state,
    context.program,
    undefined,
    MATERIALIZE_SCRATCH,
    context.pureFnContext,
  );
  arenaEncodeFromAoS(context.state.arena, arenaDesc, buffer);
  context.state.tap?.recordFieldValue?.(step.target, buffer);
  assertSlotWriteIfEnabled(context, {
    stepKind: step.kind,
    slot: step.target,
    observedKind: 'field',
    observedLaneCount: count,
  });
  return buffer;
}

function handleContinuityMapBuild(context: ExecuteFrameContext, step: Extract<Step, { kind: 'continuityMapBuild' }>): void {
  const instance = context.instances.get(step.instanceId as InstanceId);
  if (!instance) return;
  const count = resolveInstanceLaneCount(instance, context.program, context.state, context.pureFnContext);
  if (count === 0) return;
  const seed = instance.elementIdSeed ?? 0;
  const previousDomain = context.state.continuity.prevDomains.get(step.instanceId);
  const identityMode = instance.identityMode === 'stable' ? 'stable' : 'none';
  if (!shouldRebuildDomainInstance(previousDomain, count, identityMode, seed)) {
    // [LAW:dataflow-not-control-flow] Continuity transition recording runs every frame.
    recordDomainTransition(context.state.continuity, step.instanceId, NO_DOMAIN_CHANGE);
    return;
  }
  const newDomain = identityMode === 'stable'
    ? createStableDomainInstance(count, seed)
    : createUnstableDomainInstance(count);
  const change = detectDomainChange(step.instanceId, newDomain, context.state.continuity.prevDomains);
  // [LAW:single-enforcer] Continuity ownership is enforced at one transition boundary.
  recordDomainTransition(context.state.continuity, step.instanceId, change);
  context.state.continuity.prevDomains.set(step.instanceId, newDomain);
}

function resolveContinuityOutputDescriptor(
  context: ExecuteFrameContext,
  outputSlot: ValueSlot,
): ArenaSlotDescriptor {
  const outputDesc = context.slotToArena.get(outputSlot);
  if (!outputDesc || outputDesc.offset < 0 || outputDesc.length <= 0) {
    throw new Error('Continuity: missing arena descriptor for output slot ' + outputSlot);
  }
  return outputDesc;
}

function applyContinuityStep(context: ExecuteFrameContext, step: Extract<Step, { kind: 'continuityApply' }>): void {
  const outputDesc = resolveContinuityOutputDescriptor(context, step.outputSlot);
  const baseBuffer = resolveNumericBuffer(context.slotToArena, context.state, step.baseSlot);
  const outputBuffer = step.baseSlot === step.outputSlot
    ? baseBuffer
    : ensureOutputBuffer(context.slotToArena, context.state, step.outputSlot, baseBuffer.length);
  _continuityResolverContext.baseSlot = step.baseSlot;
  _continuityResolverContext.outputSlot = step.outputSlot;
  _continuityResolverContext.baseBuffer = baseBuffer;
  _continuityResolverContext.outputBuffer = outputBuffer;
  _continuityResolverContext.slotToArena = context.slotToArena;
  _continuityResolverContext.state = context.state;
  try {
    applyContinuity(step, context.state, resolveContinuityBuffer);
  } finally {
    clearContinuityResolverContext();
  }
  arenaEncodeFromAoS(context.state.arena, outputDesc, outputBuffer);
  context.state.tap?.recordFieldValue?.(step.outputSlot, outputBuffer);
  const observedLaneCount = step.stride > 0 ? Math.floor(baseBuffer.length / step.stride) : 0;
  assertSlotWriteIfEnabled(context, {
    stepKind: step.kind,
    slot: step.outputSlot,
    observedKind: 'field',
    observedLaneCount,
  });
}

function executePhase1Step(context: ExecuteFrameContext, step: Step): void {
  switch (step.kind) {
    case 'eventDispatch': {
      enterRuntimeFrameSegment(context.state, 'phase1-event-dispatch');
      context.eventDispatchSeen = true;
      const fired = evaluateValueExprEvent(step.expr as any, context.program.valueExprs, context.state, context.program, context.pureFnContext);
      if (fired) context.state.eventScalars[step.target as number] = 1;
      return;
    }
    case 'materialize': {
      enterRuntimeFrameSegment(context.state, resolvePhase1ValueSegment(context));
      materializeStepBuffer(context, step);
      return;
    }
    case 'render': {
      // [LAW:one-way-deps] Render-step ownership is GPU-side.
      enterRuntimeFrameSegment(context.state, 'phase1-render-collect');
      return;
    }
    case 'stateWrite':
    case 'fieldStateWrite':
      return;
    case 'continuityMapBuild': {
      enterRuntimeFrameSegment(context.state, 'phase1-continuity-map');
      context.continuityMapSeen = true;
      handleContinuityMapBuild(context, step);
      return;
    }
    case 'continuityApply': {
      enterRuntimeFrameSegment(context.state, 'phase1-continuity-apply');
      applyContinuityStep(context, step);
      return;
    }
    default: {
      const _exhaustive: never = step;
      throw new Error('Unknown step kind: ' + (_exhaustive as Step).kind);
    }
  }
}

function runPhase1(context: ExecuteFrameContext): void {
  for (const step of context.steps) {
    executePhase1Step(context, step);
  }
}

function recordTrackedFieldValue(context: ExecuteFrameContext, slot: ValueSlot): void {
  const arenaDesc = context.slotToArena.get(slot);
  if (!arenaDesc || arenaDesc.offset < 0 || arenaDesc.length <= 0) {
    // [LAW:one-source-of-truth] Debug reads resolve from canonical arena descriptors only.
    throw new Error('debug tracked slot missing arena descriptor for slot ' + slot);
  }
  if (context.state.arena.length < arenaDesc.offset + arenaDesc.length) {
    throw new Error(
      'debug tracked slot arena too small for slot ' + slot + ' (need ' + (arenaDesc.offset + arenaDesc.length) + ', have ' + context.state.arena.length + ')',
    );
  }
  context.state.tap?.recordFieldValue?.(slot, arenaDecodeToAoS(context.state.arena, arenaDesc));
}

function runDebugFieldMaterialization(context: ExecuteFrameContext): void {
  const trackedSlots = context.state.tap?.getTrackedFieldSlots?.();
  if (!trackedSlots || trackedSlots.size === 0) return;
  enterRuntimeFrameSegment(context.state, 'phase1-debug-materialize');
  for (const slot of trackedSlots) {
    recordTrackedFieldValue(context, slot);
  }
}

function applyStateWriteStep(context: ExecuteFrameContext, step: Extract<Step, { kind: 'stateWrite' }>): void {
  const mapping = context.stateSlotToMapping.get(step.stateSlot as number);
  const stride = mapping?.stride ?? 1;
  const values = materializeValueExpr(
    step.value as any,
    context.program.valueExprs,
    SCALAR_INSTANCE_ID,
    1,
    context.state,
    context.program,
    undefined,
    MATERIALIZE_SCRATCH,
    context.pureFnContext,
  );
  const baseSlot = step.stateSlot as number;
  for (let c = 0; c < stride; c++) {
    const fallback = mapping?.initial[c] ?? 0;
    context.state.stateWrite![baseSlot + c] = applyStateWritePolicy(mapping, values[c] ?? fallback);
  }
}

function applyFieldStateWriteStep(context: ExecuteFrameContext, step: Extract<Step, { kind: 'fieldStateWrite' }>): void {
  const mapping = context.stateSlotToMapping.get(step.stateSlot as number);
  if (!mapping || mapping.instanceId === undefined) {
    throw new Error('fieldStateWrite: missing field state mapping for slot ' + step.stateSlot);
  }
  const count = mapping.laneCount;
  if (count === 0) return;
  const tempBuffer = materializeValueExpr(
    step.value as any,
    context.program.valueExprs,
    makeInstanceId(String(mapping.instanceId)),
    count,
    context.state,
    context.program,
    undefined,
    MATERIALIZE_SCRATCH,
    context.pureFnContext,
  );
  const exprNode = context.valueExprs[step.value as number];
  const srcStride = payloadStride(exprNode.type.payload);
  const copyStride = Math.min(srcStride, mapping.stride);
  const src = tempBuffer as Float32Array;
  for (let lane = 0; lane < count; lane++) {
    const dstLaneBase = (step.stateSlot as number) + lane * mapping.stride;
    const srcLaneBase = lane * srcStride;
    for (let c = 0; c < copyStride; c++) {
      context.state.stateWrite![dstLaneBase + c] = applyStateWritePolicy(mapping, src[srcLaneBase + c] ?? 0);
    }
    for (let c = copyStride; c < mapping.stride; c++) {
      context.state.stateWrite![dstLaneBase + c] = applyStateWritePolicy(mapping, mapping.initial[c] ?? 0);
    }
  }
}

function runPhase2(context: ExecuteFrameContext): void {
  enterRuntimeFrameSegment(context.state, 'phase2-state-write');
  // [LAW:dataflow-not-control-flow] Phase 2 always prepares write storage first.
  prepareStateWriteBank(context.state);
  for (const step of context.steps) {
    if (step.kind === 'stateWrite') {
      applyStateWriteStep(context, step);
      continue;
    }
    if (step.kind === 'fieldStateWrite') {
      applyFieldStateWriteStep(context, step);
    }
  }
  commitStateWriteBank(context.state);
}

function finalizeFrame(context: ExecuteFrameContext, frame: RenderFrameIR): RenderFrameIR {
  MATERIALIZE_SCRATCH.reset();
  enterRuntimeFrameSegment(context.state, 'continuity-finalize');
  finalizeContinuityFrame(context.state);
  enterRuntimeFrameSegment(context.state, 'frame-output');
  context.state.lastRenderFrame = frame;
  const outputSpec = context.program.outputs[0];
  if (!outputSpec) return frame;
  if (outputSpec.kind !== 'renderFrame') {
    throw new Error('Unsupported output kind: ' + (outputSpec as { kind?: string }).kind);
  }
  return frame;
}

/**
 * Execute one frame of the program.
 *
 * @returns Canonical compute-only sentinel frame (`EMPTY_RENDER_FRAME`).
 * Draw-ready payloads are emitted to runtime banks (arena, shape bank, sink table).
 */
export function executeFrame(
  program: CompiledProgramIR,
  state: RuntimeState,
  arena: RenderBufferArena,
  tAbsMs: number,
  options?: ExecuteFrameOptions,
): RenderFrameIR {
  const context = createExecuteFrameContext(program, state, arena, tAbsMs, options);
  // [LAW:one-source-of-truth] Canonical runtime flow initializes once, then runs fixed phase order.
  initializeFrame(context);
  runPhase1(context);
  runDebugFieldMaterialization(context);
  // [LAW:one-way-deps] CPU frame assembly remains removed from canonical runtime.
  enterRuntimeFrameSegment(context.state, 'render-assembly');
  runPhase2(context);
  return finalizeFrame(context, EMPTY_RENDER_FRAME);
}
