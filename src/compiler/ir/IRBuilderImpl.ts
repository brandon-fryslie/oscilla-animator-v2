/**
 * IRBuilder Implementation
 *
 * Implements the IRBuilder interface for constructing IR expressions.
 * All methods return ValueExprId — the ONE index type for the unified valueExprs table.
 */

import type { CanonicalType, ConstValue } from '../../core/canonical-types';
import type {
  ValueExprId,
  EventSlotId,
  ValueSlot,
  StateSlotId,
  InstanceId,
  DomainTypeId,
} from './Indices';
import type { TopologyId } from '../../shapes/types';
import type { TimeModelIR } from './schedule';
import type {
  PureFn,
  InstanceDecl,
  Step,
  IntrinsicPropertyName,
  PlacementFieldName,
  BasisKind,
  ContinuityPolicy,
  StableStateId,
  StateMapping,
} from './types';
import { OpCode, EvalStrategy } from './types';
import type { CameraDeclIR } from './program';
import type { ValueExpr } from './value-expr';
import type { IRBuilder } from './IRBuilder';
import { valueExprId } from './Indices';
import { canonicalType, FLOAT, unitScalar } from '../../core/canonical-types';

export class IRBuilderImpl implements IRBuilder {
  private valueExprs: ValueExpr[] = [];
  private steps: Step[] = [];
  private stateMappings: StateMapping[] = [];
  private slotCounter = 0;
  private stateSlotCounter = 0;
  private eventSlotCounter = 0;
  private instanceCounter = 0;
  private instances = new Map<InstanceId, InstanceDecl>();
  private sigSlots = new Map<number, ValueSlot>();
  private fieldSlots = new Map<number, ValueSlot>();
  private eventSlots = new Map<ValueExprId, EventSlotId>();
  private slotMeta = new Map<ValueSlot, { type: CanonicalType; stride: number }>();
  private schedule: TimeModelIR = { kind: 'infinite', periodAMs: 10000, periodBMs: 10000 };
  private renderGlobals: CameraDeclIR[] = [];

  // ===========================================================================
  // Value Expression Construction
  // ===========================================================================

  constant(value: ConstValue, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'const', type, value });
  }

  slotRead(slot: ValueSlot, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'slotRead', type, slot });
  }

  time(which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy', type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'time', type, which });
  }

  external(channel: string, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'external', type, channel });
  }

  kernelMap(input: ValueExprId, fn: PureFn, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'kernel', type, kernelKind: 'map', input, fn });
  }

  kernelZip(inputs: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'kernel', type, kernelKind: 'zip', inputs, fn });
  }

  kernelZipSig(field: ValueExprId, signals: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'kernel', type, kernelKind: 'zipSig', field, signals, fn });
  }

  broadcast(signal: ValueExprId, type: CanonicalType, signalComponents?: readonly ValueExprId[]): ValueExprId {
    return this.pushExpr({ kind: 'kernel', type, kernelKind: 'broadcast', signal, signalComponents });
  }

  reduce(field: ValueExprId, op: 'min' | 'max' | 'sum' | 'avg', type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'kernel', type, kernelKind: 'reduce', field, op });
  }

  intrinsic(intrinsic: IntrinsicPropertyName, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'intrinsic', type, intrinsicKind: 'property', intrinsic });
  }

  placement(field: PlacementFieldName, basisKind: BasisKind, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'intrinsic', type, intrinsicKind: 'placement', field, basisKind });
  }

  stateRead(stateSlot: StateSlotId, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'state', type, stateSlot });
  }

  eventRead(eventExpr: ValueExprId): ValueExprId {
    // Look up or allocate event slot
    let slot = this.eventSlots.get(eventExpr);
    if (!slot) {
      // Auto-allocate event slot if not yet allocated
      const autoSlot = eventSlotId(this.eventSlotCounter++);
      this.eventSlots.set(eventExpr, autoSlot);
      return this.pushExpr({ kind: 'eventRead', eventSlot: autoSlot, type: canonicalType(FLOAT, unitScalar()) });
    }
    return this.pushExpr({ kind: 'eventRead', eventSlot: slot, type: canonicalType(FLOAT, unitScalar()) });
  }

  pathDerivative(input: ValueExprId, op: 'tangent' | 'arcLength', topologyId: TopologyId, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'kernel', kernelKind: 'pathDerivative', field: input, op, topologyId, type });
  }

  shapeRef(
    topologyId: TopologyId,
    paramArgs: readonly ValueExprId[],
    type: CanonicalType,
    controlPointField?: ValueExprId
  ): ValueExprId {
    return this.pushExpr({ kind: 'shapeRef', type, topologyId, paramArgs, controlPointField });
  }

  combine(
    inputs: readonly ValueExprId[],
    mode: 'sum' | 'average' | 'max' | 'min' | 'last' | 'product',
    type: CanonicalType
  ): ValueExprId {
    // Map combine modes to zip functions
    const fnMap: Record<typeof mode, PureFn> = {
      sum: { kind: 'opcode', opcode: OpCode.Add },
      average: { kind: 'kernel', name: 'average' },
      max: { kind: 'kernel', name: 'max' },
      min: { kind: 'kernel', name: 'min' },
      last: { kind: 'kernel', name: 'last' },
      product: { kind: 'opcode', opcode: OpCode.Mul },
    };
    return this.pushExpr({ kind: 'kernel', type, kernelKind: 'zip', inputs, fn: fnMap[mode] });
  }

  // ===========================================================================
  // Structural Operations
  // ===========================================================================

  extract(input: ValueExprId, componentIndex: number, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'extract', type, input, componentIndex });
  }

  construct(components: readonly ValueExprId[], type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'construct', type, components });
  }

  hslToRgb(input: ValueExprId, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'hslToRgb', type, input });
  }

  // ===========================================================================
  // Event Operations
  // ===========================================================================

  eventPulse(source: 'InfiniteTimeRoot'): ValueExprId {
    // Event type: discrete temporality, bool payload, none unit
    const type = canonicalType(FLOAT /* placeholder */, unitScalar()); // TODO: fix to proper event type
    return this.pushExpr({ kind: 'event', type, eventKind: 'pulse', source: 'timeRoot' });
  }

  eventWrap(signal: ValueExprId): ValueExprId {
    const type = canonicalType(FLOAT, unitScalar()); // TODO: proper event type
    return this.pushExpr({ kind: 'event', type, eventKind: 'wrap', input: signal });
  }

  eventCombine(events: readonly ValueExprId[], mode: 'any' | 'all' | 'merge' | 'last', type?: CanonicalType): ValueExprId {
    const actualType = type ?? canonicalType(FLOAT, unitScalar()); // TODO: proper event type
    const normalizedMode = mode === 'merge' || mode === 'last' ? 'any' : mode;
    return this.pushExpr({ kind: 'event', type: actualType, eventKind: 'combine', inputs: events, mode: normalizedMode });
  }

  eventNever(): ValueExprId {
    const type = canonicalType(FLOAT, unitScalar()); // TODO: proper event type
    return this.pushExpr({ kind: 'event', type, eventKind: 'never' });
  }

  // ===========================================================================
  // Slot Management
  // ===========================================================================

  allocTypedSlot(type: CanonicalType, label?: string): ValueSlot {
    const slot = this.slotCounter++ as ValueSlot;
    const stride = 1; // TODO: derive from type
    this.slotMeta.set(slot, { type, stride });
    return slot;
  }

  registerSlotType(slot: ValueSlot, type: CanonicalType): void {
    const stride = 1; // TODO: derive from type
    this.slotMeta.set(slot, { type, stride });
  }

  registerSigSlot(sigId: ValueExprId, slot: ValueSlot): void {
    this.sigSlots.set(sigId, slot);
  }

  registerFieldSlot(fieldId: ValueExprId, slot: ValueSlot): void {
    this.fieldSlots.set(fieldId, slot);
  }

  allocEventSlot(eventId: ValueExprId): EventSlotId {
    const slot = eventSlotId(this.eventSlotCounter++);
    this.eventSlots.set(eventId, slot);
    return slot;
  }

  allocSlot(stride?: number): ValueSlot {
    const slot = this.slotCounter++ as ValueSlot;
    if (stride !== undefined) {
      // TODO: store stride metadata
    }
    return slot;
  }

  // ===========================================================================
  // Steps
  // ===========================================================================

  stepSlotWriteStrided(slotBase: ValueSlot, inputs: readonly ValueExprId[]): void {
    this.steps.push({ kind: 'slotWriteStrided', slotBase, inputs });
  }

  stepStateWrite(stateSlot: StateSlotId, value: ValueExprId): void {
    this.steps.push({ kind: 'stateWrite', stateSlot, value });
  }

  stepFieldStateWrite(stateSlot: StateSlotId, value: ValueExprId): void {
    this.steps.push({ kind: 'fieldStateWrite', stateSlot, value });
  }

  stepEvalSig(expr: ValueExprId, target: ValueSlot): void {
    this.steps.push({
      kind: 'evalValue',
      expr,
      target: { storage: 'value', slot: target },
      strategy: EvalStrategy.ContinuousScalar
    });
  }

  stepMaterialize(field: ValueExprId, instanceId: InstanceId, target: ValueSlot): void {
    this.steps.push({ kind: 'materialize', field, instanceId, target });
  }

  stepContinuityMapBuild(instanceId: InstanceId): void {
    this.steps.push({
      kind: 'continuityMapBuild',
      instanceId,
      outputMapping: `continuity-map-${instanceId}`
    });
  }

  stepContinuityApply(
    targetKey: string,
    instanceId: InstanceId,
    policy: ContinuityPolicy,
    baseSlot: ValueSlot,
    outputSlot: ValueSlot,
    semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom',
    stride: number
  ): void {
    this.steps.push({
      kind: 'continuityApply',
      targetKey,
      instanceId,
      policy,
      baseSlot,
      outputSlot,
      semantic,
      stride,
    });
  }

  // ===========================================================================
  // State Slots
  // ===========================================================================

  allocStateSlot(
    stableId: StableStateId,
    options?: {
      initialValue?: number;
      stride?: number;
      instanceId?: InstanceId;
      laneCount?: number;
    }
  ): StateSlotId {
    const slot = stateSlotId(this.stateSlotCounter++);
    const stride = options?.stride ?? 1;
    const initialValue = options?.initialValue ?? 0;
    const initial = Array.from({ length: stride }, () => initialValue);

    if (options?.instanceId !== undefined && options?.laneCount !== undefined) {
      // Field state mapping
      this.stateMappings.push({
        kind: 'field',
        stateId: stableId,
        instanceId: options.instanceId,
        slotStart: slot,
        laneCount: options.laneCount,
        stride,
        initial,
      });
    } else {
      // Scalar state mapping
      this.stateMappings.push({
        kind: 'scalar',
        stateId: stableId,
        slotIndex: slot,
        stride,
        initial,
      });
    }
    return slot;
  }

  // ===========================================================================
  // Render Globals
  // ===========================================================================

  addRenderGlobal(decl: CameraDeclIR): void {
    this.renderGlobals.push(decl);
  }

  getRenderGlobals(): readonly CameraDeclIR[] {
    return this.renderGlobals;
  }

  // ===========================================================================
  // Utility
  // ===========================================================================

  kernel(name: string): PureFn {
    return { kind: 'kernel', name };
  }

  opcode(op: OpCode): PureFn {
    return { kind: 'opcode', opcode: op };
  }

  expr(expression: string): PureFn {
    return { kind: 'expr', expr: expression };
  }

  createInstance(
    domainType: DomainTypeId,
    count: number,
    lifecycle?: 'static' | 'dynamic' | 'pooled'
  ): InstanceId {
    const id = `inst-${this.instanceCounter++}` as InstanceId;
    this.instances.set(id, {
      id,
      domainType,
      count,
      lifecycle: lifecycle ?? 'static',
      identityMode: 'stable',
    });
    return id;
  }

  getInstances(): ReadonlyMap<InstanceId, InstanceDecl> {
    return this.instances;
  }

  getSchedule(): TimeModelIR {
    return this.schedule;
  }

  // ===========================================================================
  // Build Results
  // ===========================================================================

  getSteps(): readonly Step[] {
    return this.steps;
  }

  getStateMappings(): readonly StateMapping[] {
    return this.stateMappings;
  }

  getStateSlotCount(): number {
    return this.stateSlotCounter;
  }

  getSlotCount(): number {
    return this.slotCounter;
  }

  getSlotMetaInputs(): ReadonlyMap<ValueSlot, { readonly type: CanonicalType; readonly stride: number }> {
    return this.slotMeta;
  }

  getValueExpr(id: ValueExprId): ValueExpr | undefined {
    return this.valueExprs[id];
  }

  getValueExprs(): readonly ValueExpr[] {
    return this.valueExprs;
  }

  getSigSlots(): ReadonlyMap<number, ValueSlot> {
    return this.sigSlots;
  }

  getEventSlots(): ReadonlyMap<ValueExprId, EventSlotId> {
    return this.eventSlots;
  }

  getEventSlotCount(): number {
    return this.eventSlotCounter;
  }

  // ===========================================================================
  // Internal Helpers
  // ===========================================================================

  private pushExpr(expr: ValueExpr): ValueExprId {
    const id = valueExprId(this.valueExprs.length);
    this.valueExprs.push(expr);
    return id;
  }

  setTimeModel(schedule: TimeModelIR): void {
    this.schedule = schedule;
  }

  setCurrentBlockId(_blockId: string): void {
    // This is used for debug/error context during lowering.
    // The implementation is currently a no-op as we don't track this state.
    // If needed in the future, we can store it and attach it to error messages.
  }
}

/**
 * Create a new IR builder instance.
 */
export function createIRBuilder(): IRBuilder {
  return new IRBuilderImpl();
}

// Helper function (imported from Indices or defined here)
function eventSlotId(n: number): EventSlotId {
  return n as EventSlotId;
}

function stateSlotId(n: number): StateSlotId {
  return n as StateSlotId;
}
