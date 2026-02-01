/**
 * IRBuilder Implementation
 *
 * Concrete implementation of the IRBuilder interface.
 * Stores ALL expressions in a single valueExprs: ValueExpr[] table.
 */

import type { CanonicalType, ConstValue } from '../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, CAMERA_PROJECTION, canonicalType, unitScalar, canonicalEvent, constValueMatchesPayload, requireInst } from '../../core/canonical-types';
import type { TopologyId } from '../../shapes/types';
import type { IRBuilder } from './IRBuilder';
import type {
  ValueExprId,
  EventSlotId,
  ValueSlot,
  StateSlotId,
  InstanceId,
  DomainTypeId,
} from './Indices';
import {
  valueExprId,
  eventSlotId,
  valueSlot,
  stateSlotId,
  instanceId,
} from './Indices';
import type { TimeModelIR } from './schedule';
import type {
  PureFn,
  OpCode,
  InstanceDecl,
  Step,
  IntrinsicPropertyName,
  PlacementFieldName,
  BasisKind,
  ContinuityPolicy,
  StableStateId,
  StateMapping,
  EvalStrategy,
  EvalTarget,
} from './types';
import type { CameraDeclIR } from './program';
import type { ValueExpr } from './value-expr';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Derive evaluation strategy from CanonicalType.
 * Used by legacy stepEvalSig compat shim.
 */
function deriveStrategyFromType(type: CanonicalType): EvalStrategy {
  const temp = requireInst(type.extent.temporality, 'temporality');
  const card = requireInst(type.extent.cardinality, 'cardinality');

  const isDiscrete = temp.kind === 'discrete';
  const isMany = card.kind === 'many';

  if (isDiscrete) {
    return isMany ? 3 /* EvalStrategy.DiscreteField */ : 2 /* EvalStrategy.DiscreteScalar */;
  }
  return isMany ? 1 /* EvalStrategy.ContinuousField */ : 0 /* EvalStrategy.ContinuousScalar */;
}

// =============================================================================
// IRBuilderImpl
// =============================================================================

export class IRBuilderImpl implements IRBuilder {
  /** Single unified expression table — the ONE source of truth */
  private valueExprs: ValueExpr[] = [];
  private instances: Map<InstanceId, InstanceDecl> = new Map();
  private slotCounter = 0;
  private stateSlotCounter = 0;
  private constCounter = 0;
  private timeModel: TimeModelIR | undefined;
  private currentBlockId: string | undefined;

  // Hash-consing cache for expression deduplication (I13)
  private exprCache = new Map<string, ValueExprId>();

  // Slot registrations for debug/validation
  private sigSlots = new Map<number, ValueSlot>();
  private fieldSlots = new Map<number, ValueSlot>();
  private eventSlots = new Map<ValueExprId, EventSlotId>();
  private eventSlotCounter = 0;

  // Slot type tracking for slotMeta generation
  private slotTypes = new Map<ValueSlot, CanonicalType>();

  // State slot tracking
  private stateMappings: StateMapping[] = [];

  // Step tracking for schedule generation
  private steps: Step[] = [];

  // Render globals tracking (Camera system)
  private renderGlobals: CameraDeclIR[] = [];

  constructor() {
    // Reserve system slots at fixed positions (compiler-runtime contract)
    // Slot 0: time.palette (color, stride=4)
    this.reserveSystemSlot(0, canonicalType(COLOR));
  }

  private reserveSystemSlot(slotId: number, type: CanonicalType): void {
    const slot = slotId as ValueSlot;
    this.slotTypes.set(slot, type);
    if (this.slotCounter <= slotId) {
      this.slotCounter = slotId + 1;
    }
  }

  // =========================================================================
  // Internal: push expression and return ID
  // =========================================================================

  private pushExpr(expr: ValueExpr): ValueExprId {
    const hash = JSON.stringify(expr);
    const existing = this.exprCache.get(hash);
    if (existing !== undefined) return existing;
    const id = valueExprId(this.valueExprs.length);
    this.valueExprs.push(expr);
    this.exprCache.set(hash, id);
    return id;
  }

  // =========================================================================
  // Canonical Value Expression Methods
  // =========================================================================

  constant(value: ConstValue, type: CanonicalType): ValueExprId {
    if (!constValueMatchesPayload(type.payload, value)) {
      throw new Error(`ConstValue kind "${value.kind}" does not match payload kind "${type.payload.kind}"`);
    }
    // NOTE: Zero-cardinality for constants is deferred until the cardinality solver
    // supports zero as a "universal donor" compatible with any other cardinality.
    // Until then, constants keep the caller-provided type to avoid solver conflicts.
    // See bead oscilla-animator-v2-73lv for tracking.
    return this.pushExpr({ kind: 'const', value, type });
  }

  slotRead(slot: ValueSlot, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'slotRead', slot, type });
  }

  time(which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy', type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'time', which, type });
  }

  external(channel: string, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'external', channel, type });
  }

  kernelMap(input: ValueExprId, fn: PureFn, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'kernel', kernelKind: 'map', input, fn, type });
  }

  kernelZip(inputs: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'kernel', kernelKind: 'zip', inputs, fn, type });
  }

  kernelZipSig(field: ValueExprId, signals: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'kernel', kernelKind: 'zipSig', field, signals, fn, type });
  }

  broadcast(signal: ValueExprId, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'kernel', kernelKind: 'broadcast', signal, type });
  }

  reduce(field: ValueExprId, op: 'min' | 'max' | 'sum' | 'avg', type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'kernel', kernelKind: 'reduce', field, op, type });
  }

  intrinsic(intrinsic: IntrinsicPropertyName, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'intrinsic', intrinsicKind: 'property', intrinsic, type });
  }

  placement(field: PlacementFieldName, basisKind: BasisKind, type: CanonicalType): ValueExprId {
    if (!field) throw new Error('placement: field is required');
    if (!basisKind) throw new Error('placement: basisKind is required');
    if (!type) throw new Error('placement: type is required');
    return this.pushExpr({ kind: 'intrinsic', intrinsicKind: 'placement', field, basisKind, type });
  }

  stateRead(stateSlot: StateSlotId, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'state', stateSlot, type });
  }

  eventRead(eventExpr: ValueExprId): ValueExprId {
    // eventRead bridges event→signal: reads event state as float 0/1
    // The eventExpr must be an event expression; we look up its EventSlotId
    const slot = this.eventSlots.get(eventExpr);
    if (slot === undefined) {
      // Auto-allocate event slot if not yet allocated
      const autoSlot = eventSlotId(this.eventSlotCounter++);
      this.eventSlots.set(eventExpr, autoSlot);
      return this.pushExpr({ kind: 'eventRead', eventSlot: autoSlot, type: canonicalType(FLOAT, unitScalar()) });
    }
    return this.pushExpr({ kind: 'eventRead', eventSlot: slot, type: canonicalType(FLOAT, unitScalar()) });
  }

  pathDerivative(input: ValueExprId, op: 'tangent' | 'arcLength', type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'kernel', kernelKind: 'pathDerivative', field: input, op, type });
  }

  shapeRef(
    topologyId: TopologyId,
    paramArgs: readonly ValueExprId[],
    type: CanonicalType,
    controlPointField?: ValueExprId
  ): ValueExprId {
    return this.pushExpr({ kind: 'shapeRef', topologyId, paramArgs, type, controlPointField });
  }

  combine(
    inputs: readonly ValueExprId[],
    mode: 'sum' | 'average' | 'max' | 'min' | 'last' | 'product',
    type: CanonicalType
  ): ValueExprId {
    const fn: PureFn = { kind: 'kernel', name: `combine_${mode}` };
    return this.pushExpr({ kind: 'kernel', kernelKind: 'zip', inputs, fn, type });
  }

  // =========================================================================
  // Event Expression Methods
  // =========================================================================

  eventPulse(_source: 'InfiniteTimeRoot'): ValueExprId {
    return this.pushExpr({ kind: 'event', eventKind: 'pulse', source: 'timeRoot', type: canonicalEvent() });
  }

  eventWrap(signal: ValueExprId): ValueExprId {
    return this.pushExpr({ kind: 'event', eventKind: 'wrap', input: signal, type: canonicalEvent() });
  }

  eventCombine(
    events: readonly ValueExprId[],
    mode: 'any' | 'all' | 'merge' | 'last',
    _type?: CanonicalType
  ): ValueExprId {
    const underlyingMode = mode === 'merge' || mode === 'last' ? 'any' : mode;
    return this.pushExpr({
      kind: 'event', eventKind: 'combine',
      inputs: events, mode: underlyingMode as 'any' | 'all',
      type: canonicalEvent(),
    });
  }

  eventNever(): ValueExprId {
    return this.pushExpr({ kind: 'event', eventKind: 'never', type: canonicalEvent() });
  }

  // =========================================================================
  // Instances
  // =========================================================================

  createInstance(
    domainType: DomainTypeId,
    count: number,
    lifecycle: 'static' | 'dynamic' | 'pooled' = 'static',
    identityMode: 'stable' | 'none' = 'stable',
    elementIdSeed?: number
  ): InstanceId {
    const id = instanceId(`instance_${this.instances.size}`);
    this.instances.set(id, { id, domainType, count, lifecycle, identityMode, elementIdSeed });
    return id;
  }

  getInstances(): ReadonlyMap<InstanceId, InstanceDecl> {
    return this.instances;
  }

  // =========================================================================
  // Slots
  // =========================================================================

  allocSlot(stride: number = 1): ValueSlot {
    if (stride < 1 || !Number.isInteger(stride)) {
      throw new Error(`allocSlot: stride must be a positive integer, got ${stride}`);
    }
    const baseSlot = valueSlot(this.slotCounter);
    this.slotCounter += stride;
    return baseSlot;
  }

  allocTypedSlot(type: CanonicalType, _label?: string): ValueSlot {
    let stride: number;
    switch (type.payload.kind) {
      case 'float': case 'int': case 'bool': case 'cameraProjection': stride = 1; break;
      case 'vec2': stride = 2; break;
      case 'vec3': stride = 3; break;
      case 'color': stride = 4; break;
      default: stride = 1;
    }
    const slot = this.allocSlot(stride);
    this.slotTypes.set(slot, type);
    return slot;
  }

  registerSlotType(slot: ValueSlot, type: CanonicalType): void {
    this.slotTypes.set(slot, type);
  }

  getSlotCount(): number { return this.slotCounter; }

  getSlotTypes(): ReadonlyMap<ValueSlot, CanonicalType> { return this.slotTypes; }

  getSlotMetaInputs(): ReadonlyMap<ValueSlot, { readonly type: CanonicalType; readonly stride: number }> {
    const result = new Map<ValueSlot, { readonly type: CanonicalType; readonly stride: number }>();
    for (const [slot, type] of this.slotTypes) {
      let stride: number;
      switch (type.payload.kind) {
        case 'float': case 'int': case 'bool': case 'cameraProjection': stride = 1; break;
        case 'vec2': stride = 2; break;
        case 'vec3': stride = 3; break;
        case 'color': stride = 4; break;
        default: stride = 1;
      }
      result.set(slot, { type, stride });
    }
    return result;
  }

  // =========================================================================
  // State Slots
  // =========================================================================

  allocStateSlot(
    stableId: StableStateId,
    options?: { initialValue?: number; stride?: number; instanceId?: InstanceId; laneCount?: number }
  ): StateSlotId {
    const initialValue = options?.initialValue ?? 0;
    const stride = options?.stride ?? 1;
    const initial = Array(stride).fill(initialValue);
    const slotIndex = this.stateSlotCounter;

    if (options?.instanceId !== undefined) {
      const laneCount = options.laneCount;
      if (laneCount === undefined) throw new Error('allocStateSlot: laneCount required when instanceId is provided');
      this.stateMappings.push({
        kind: 'field', stateId: stableId, instanceId: options.instanceId,
        slotStart: slotIndex, laneCount, stride, initial,
      });
      this.stateSlotCounter += laneCount * stride;
    } else {
      this.stateMappings.push({
        kind: 'scalar', stateId: stableId, slotIndex, stride, initial,
      });
      this.stateSlotCounter += stride;
    }
    return stateSlotId(slotIndex);
  }

  // =========================================================================
  // Steps
  // =========================================================================

  stepStateWrite(stateSlot: StateSlotId, value: ValueExprId): void {
    this.steps.push({ kind: 'stateWrite', stateSlot, value });
  }

  stepFieldStateWrite(stateSlot: StateSlotId, value: ValueExprId): void {
    this.steps.push({ kind: 'fieldStateWrite', stateSlot, value });
  }

  /**
   * New unified step method (Sprint 3).
   * Replaces stepEvalSig and stepEvalEvent with strategy-based dispatch.
   */
  stepEvalValue(expr: ValueExprId, target: EvalTarget, strategy: EvalStrategy): void {
    this.steps.push({ kind: 'evalValue', expr, target, strategy });
  }

  /**
   * Legacy compat shim for stepEvalSig.
   * Derives strategy from expr type and forwards to stepEvalValue.
   * Used by test-blocks.ts.
   */
  stepEvalSig(expr: ValueExprId, target: ValueSlot): void {
    const exprNode = this.valueExprs[expr as number];
    if (!exprNode) throw new Error(`stepEvalSig: expr ${expr} not found`);
    const strategy = deriveStrategyFromType(exprNode.type);
    this.stepEvalValue(expr, { storage: 'value', slot: target }, strategy);
  }

  stepSlotWriteStrided(slotBase: ValueSlot, inputs: readonly ValueExprId[]): void {
    if (inputs.length === 0) throw new Error('stepSlotWriteStrided: inputs array must not be empty');
    this.steps.push({ kind: 'slotWriteStrided', slotBase, inputs });
  }

  stepMaterialize(field: ValueExprId, instanceId: InstanceId, target: ValueSlot): void {
    this.steps.push({ kind: 'materialize', field, instanceId, target });
  }

  stepContinuityMapBuild(instanceId: InstanceId): void {
    this.steps.push({ kind: 'continuityMapBuild', instanceId, outputMapping: `mapping_${instanceId}` });
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
    this.steps.push({ kind: 'continuityApply', targetKey, instanceId, policy, baseSlot, outputSlot, semantic, stride });
  }

  // =========================================================================
  // Slot Registration
  // =========================================================================

  registerSigSlot(sigId: number, slot: ValueSlot): void {
    this.sigSlots.set(sigId, slot);
  }

  registerFieldSlot(fieldId: number, slot: ValueSlot): void {
    this.fieldSlots.set(fieldId, slot);
  }

  allocEventSlot(eventId: ValueExprId): EventSlotId {
    const slot = eventSlotId(this.eventSlotCounter++);
    this.eventSlots.set(eventId, slot);
    return slot;
  }

  // =========================================================================
  // Render Globals
  // =========================================================================

  addRenderGlobal(decl: CameraDeclIR): void { this.renderGlobals.push(decl); }
  getRenderGlobals(): readonly CameraDeclIR[] { return this.renderGlobals; }

  // =========================================================================
  // Utility
  // =========================================================================

  opcode(op: OpCode): PureFn { return { kind: 'opcode', opcode: op }; }
  expr(expression: string): PureFn { return { kind: 'expr', expr: expression }; }
  kernel(name: string): PureFn { return { kind: 'kernel', name }; }

  setCurrentBlockId(blockId: string | undefined): void { this.currentBlockId = blockId; }
  allocConstId(_value: number): number { return this.constCounter++; }
  setTimeModel(model: TimeModelIR): void { this.timeModel = model; }
  getTimeModel(): TimeModelIR | undefined { return this.timeModel; }

  // =========================================================================
  // Build Results
  // =========================================================================

  getValueExpr(id: ValueExprId): ValueExpr | undefined {
    return this.valueExprs[id as number];
  }

  getValueExprs(): readonly ValueExpr[] {
    return this.valueExprs;
  }

  getSigSlots(): ReadonlyMap<number, ValueSlot> { return this.sigSlots; }
  getFieldSlots(): ReadonlyMap<number, ValueSlot> { return this.fieldSlots; }
  getEventSlots(): ReadonlyMap<ValueExprId, EventSlotId> { return this.eventSlots; }
  getEventSlotCount(): number { return this.eventSlotCounter; }
  getStateMappings(): readonly StateMapping[] { return this.stateMappings; }
  getStateSlotCount(): number { return this.stateSlotCounter; }
  getSteps(): readonly Step[] { return this.steps; }

  getSchedule(): TimeModelIR {
    if (!this.timeModel) throw new Error('Time model not set');
    return this.timeModel;
  }

  // Legacy state helper
  allocState(_initialValue: unknown): string & { readonly __brand: 'StateId' } {
    return `state_${this.constCounter++}` as string & { readonly __brand: 'StateId' };
  }
}

/**
 * Create a new IRBuilder instance.
 */
export function createIRBuilder(): IRBuilder {
  return new IRBuilderImpl();
}
