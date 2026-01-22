/**
 * IRBuilder Implementation
 *
 * Concrete implementation of the IRBuilder interface.
 */

import type { SignalType } from '../../core/canonical-types';
import type { IRBuilder } from './IRBuilder';
import type {
  SigExprId,
  FieldExprId,
  EventExprId,
  ValueSlot,
  StateId,
  StateSlotId,
  InstanceId,
  DomainTypeId,
} from './Indices';
import {
  sigExprId,
  fieldExprId,
  eventExprId,
  valueSlot,
  stateId,
  stateSlotId,
  instanceId,
} from './Indices';
import type { TimeModelIR } from './schedule';
import type {
  PureFn,
  OpCode,
  SigExpr,
  FieldExpr,
  EventExpr,
  InstanceDecl,
  Step,
  IntrinsicPropertyName,
  ContinuityPolicy,
  StableStateId,
  StateMapping,
} from './types';

// =============================================================================
// IRBuilderImpl
// =============================================================================

export class IRBuilderImpl implements IRBuilder {
  private sigExprs: SigExpr[] = [];
  private fieldExprs: FieldExpr[] = [];
  private eventExprs: EventExpr[] = [];
  private instances: Map<InstanceId, InstanceDecl> = new Map(); // NEW
  private slotCounter = 0;
  private stateCounter = 0;
  private stateSlotCounter = 0;
  private constCounter = 0;
  private timeModel: TimeModelIR | undefined;
  private currentBlockId: string | undefined;

  // Slot registrations for debug/validation
  private sigSlots = new Map<number, ValueSlot>();
  private fieldSlots = new Map<number, ValueSlot>();
  private eventSlots = new Map<EventExprId, ValueSlot>();

  // State slot tracking for persistent cross-frame storage
  // OLD: private stateSlots: { initialValue: number }[] = [];
  // NEW: Store state mappings with stable IDs
  private stateMappings: StateMapping[] = [];

  // Step tracking for schedule generation
  private steps: Step[] = [];

  // Slot type tracking for slotMeta generation
  private slotTypes = new Map<ValueSlot, SignalType>();

  // =========================================================================
  // Signal Expressions
  // =========================================================================

  sigConst(value: number | string | boolean, type: SignalType): SigExprId {
    const id = sigExprId(this.sigExprs.length);
    this.sigExprs.push({ kind: 'const', value, type });
    return id;
  }

  sigSlot(slot: ValueSlot, type: SignalType): SigExprId {
    const id = sigExprId(this.sigExprs.length);
    this.sigExprs.push({ kind: 'slot', slot, type });
    return id;
  }

  sigTime(which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'pulse' | 'progress' | 'palette' | 'energy', type: SignalType): SigExprId {
    const id = sigExprId(this.sigExprs.length);
    this.sigExprs.push({ kind: 'time', which, type });
    return id;
  }

  sigExternal(which: 'mouseX' | 'mouseY' | 'mouseOver', type: SignalType): SigExprId {
    const id = sigExprId(this.sigExprs.length);
    this.sigExprs.push({ kind: 'external', which, type });
    return id;
  }

  sigMap(input: SigExprId, fn: PureFn, type: SignalType): SigExprId {
    const id = sigExprId(this.sigExprs.length);
    this.sigExprs.push({ kind: 'map', input, fn, type });
    return id;
  }

  sigZip(inputs: readonly SigExprId[], fn: PureFn, type: SignalType): SigExprId {
    const id = sigExprId(this.sigExprs.length);
    this.sigExprs.push({ kind: 'zip', inputs, fn, type });
    return id;
  }
  sigShapeRef(topologyId: string, paramSignals: readonly SigExprId[], type: SignalType, controlPointField?: FieldExprId): SigExprId {
    const id = sigExprId(this.sigExprs.length);
    this.sigExprs.push({ kind: 'shapeRef', topologyId, paramSignals, controlPointField, type });
    return id;
  }

  /**
   * Binary operation helper - creates a sig expression that zips two inputs with an opcode.
   */
  sigBinOp(a: SigExprId, b: SigExprId, opcode: OpCode, type: SignalType): SigExprId {
    return this.sigZip([a, b], { kind: 'opcode', opcode }, type);
  }

  /**
   * Unary operation helper - creates a sig expression that maps a single input with an opcode.
   */
  sigUnaryOp(input: SigExprId, opcode: OpCode, type: SignalType): SigExprId {
    return this.sigMap(input, { kind: 'opcode', opcode }, type);
  }

  // =========================================================================
  // Signal Combine
  // =========================================================================

  sigCombine(
    inputs: readonly SigExprId[],
    mode: 'sum' | 'average' | 'max' | 'min' | 'last',
    type: SignalType
  ): SigExprId {
    // For combining signals, we use zip with appropriate combine function
    // inputs are already SigExprId[]
    const fn: PureFn = { kind: 'kernel', name: `combine_${mode}` };
    const id = sigExprId(this.sigExprs.length);
    this.sigExprs.push({ kind: 'zip', inputs, fn, type });
    return id;
  }

  // =========================================================================
  // Signal Expression Lookup
  // =========================================================================

  /**
   * Look up the SigExpr for a given SigExprId.
   * Used by blocks that need to introspect expression structure.
   */
  getSigExpr(id: SigExprId): SigExpr | undefined {
    return this.sigExprs[id as number];
  }

  /**
   * Look up the type for a signal expression.
   */
  getSigExprType(id: SigExprId): SignalType | undefined {
    const expr = this.sigExprs[id as number];
    return expr?.type;
  }

  /**
   * Resolve a SigExprId to its slot, if it exists.
   * Returns undefined if the signal is not a slot reference.
   */
  resolveSigSlot(id: SigExprId): ValueSlot | undefined {
    const expr = this.sigExprs[id as number];
    if (expr?.kind === 'slot') {
      return expr.slot as unknown as ValueSlot;
    }
    return undefined;
  }

  // =========================================================================
  // Field Expressions
  // =========================================================================

  fieldConst(value: number | string, type: SignalType): FieldExprId {
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'const', value, type });
    return id;
  }

  /**
   * Create a field from an intrinsic property.
   * Uses proper FieldExprIntrinsic type - no 'as any' casts needed.
   */
  fieldIntrinsic(instanceId: InstanceId, intrinsic: IntrinsicPropertyName, type: SignalType): FieldExprId {
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({
      kind: 'intrinsic',
      instanceId,
      intrinsic,
      type,
    });
    return id;
  }

  /**
   * Create an array field expression (Stage 2: Signal<T> → Field<T>).
   * Represents the elements of an array instance.
   */
  fieldArray(instanceId: InstanceId, type: SignalType): FieldExprId {
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({
      kind: 'array',
      instanceId,
      type,
    });
    return id;
  }

  fieldBroadcast(signal: SigExprId, type: SignalType): FieldExprId {
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'broadcast', signal, type });
    return id;
  }

  fieldMap(input: FieldExprId, fn: PureFn, type: SignalType): FieldExprId {
    const instanceId = this.inferFieldInstance(input);
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'map', input, fn, type, instanceId });
    return id;
  }

  fieldZip(inputs: readonly FieldExprId[], fn: PureFn, type: SignalType): FieldExprId {
    const instanceId = this.inferZipInstance(inputs);
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'zip', inputs, fn, type, instanceId });
    return id;
  }

  fieldZipSig(
    field: FieldExprId,
    signals: readonly SigExprId[],
    fn: PureFn,
    type: SignalType
  ): FieldExprId {
    const instanceId = this.inferFieldInstance(field);
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'zipSig', field, signals, fn, type, instanceId });
    return id;
  }

  // =========================================================================
  // Instance Inference
  // =========================================================================

  /**
   * Infer the instance a field expression operates over.
   * Returns the InstanceId if the field is bound to a specific instance,
   * or undefined if the field is instance-agnostic (const, broadcast).
   *
   * Instance binding:
   * - intrinsic, array, stateRead → return their instanceId (bound to instance)
   * - map, zipSig → propagate from input
   * - zip → unify from inputs (must all be same instance)
   * - const, broadcast → undefined (instance-agnostic)
   */
  inferFieldInstance(fieldId: FieldExprId): InstanceId | undefined {
    const expr = this.fieldExprs[fieldId as number];
    if (!expr) return undefined;

    switch (expr.kind) {
      case 'intrinsic':
      case 'array':
      case 'stateRead':
        return expr.instanceId; // These ARE bound to an instance
      case 'map':
        return expr.instanceId ?? this.inferFieldInstance(expr.input);
      case 'zip':
        return expr.instanceId ?? this.inferZipInstance(expr.inputs);
      case 'zipSig':
        return expr.instanceId ?? this.inferFieldInstance(expr.field);
      case 'broadcast':
      case 'const':
        return undefined; // Truly instance-agnostic
    }
  }

  /**
   * Infer instance from zip inputs, throwing an error if they differ.
   * Returns the unified instance, or undefined if all inputs are instance-agnostic.
   */
  private inferZipInstance(inputs: readonly FieldExprId[]): InstanceId | undefined {
    const instances: InstanceId[] = [];
    for (const id of inputs) {
      const inst = this.inferFieldInstance(id);
      if (inst !== undefined) {
        instances.push(inst);
      }
    }

    if (instances.length === 0) return undefined;

    const first = instances[0];
    for (let i = 1; i < instances.length; i++) {
      if (instances[i] !== first) {
        throw new Error(
          `Instance mismatch in fieldZip: '${first}' vs '${instances[i]}'. ` +
          `All field inputs must share the same instance.`
        );
      }
    }
    return first;
  }

  // =========================================================================
  // Field Combine
  // =========================================================================

  fieldCombine(
    inputs: readonly FieldExprId[],
    mode: 'sum' | 'average' | 'max' | 'min' | 'last' | 'product',
    type: SignalType
  ): FieldExprId {
    // For combining fields, we use zip with appropriate combine function
    // inputs are already FieldExprId[]
    const fn: PureFn = { kind: 'kernel', name: `combine_${mode}` };
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'zip', inputs, fn, type });
    return id;
  }

  // =========================================================================
  // Event Expressions
  // =========================================================================

  eventPulse(source: 'timeRoot'): EventExprId {
    const id = eventExprId(this.eventExprs.length);
    this.eventExprs.push({ kind: 'pulse', source });
    return id;
  }

  eventWrap(signal: SigExprId): EventExprId {
    const id = eventExprId(this.eventExprs.length);
    this.eventExprs.push({ kind: 'wrap', signal });
    return id;
  }

  eventCombine(
    events: readonly EventExprId[],
    mode: 'any' | 'all' | 'merge' | 'last',
    _type?: SignalType
  ): EventExprId {
    const id = eventExprId(this.eventExprs.length);
    // Map 'merge' and 'last' to underlying event combine modes
    const underlyingMode = mode === 'merge' || mode === 'last' ? 'any' : mode;
    this.eventExprs.push({ kind: 'combine', events, mode: underlyingMode as 'any' | 'all' });
    return id;
  }

  /**
   * Create a "never fires" event.
   * Used as a default when an event input is optional and not connected.
   */
  eventNever(): EventExprId {
    const id = eventExprId(this.eventExprs.length);
    this.eventExprs.push({ kind: 'never' });
    return id;
  }

  // =========================================================================
  // Domains (OLD - Will be removed in Sprint 8)
  // =========================================================================


  /**
   * Create a grid domain with rows x cols elements.
   */

  /**
   * Create an N-element domain with optional seed for deterministic IDs.
   */



  // =========================================================================
  // Instances (NEW)
  // =========================================================================

  /**
   * Create an instance (NEW).
   * Layout is now handled entirely through field kernels (circleLayout, lineLayout, gridLayout).
   */
  createInstance(
    domainType: DomainTypeId,
    count: number,
    lifecycle: 'static' | 'dynamic' | 'pooled' = 'static',
    identityMode: 'stable' | 'none' = 'stable',
    elementIdSeed?: number
  ): InstanceId {
    const id = instanceId(`instance_${this.instances.size}`);
    this.instances.set(id, {
      id: id as string,
      domainType: domainType as string,
      count,
      lifecycle,
      identityMode,
      elementIdSeed,
    });
    return id;
  }

  /**
   * Get all instances (NEW).
   */
  getInstances(): ReadonlyMap<InstanceId, InstanceDecl> {
    return this.instances;
  }

  /**
   * Generate a deterministic 8-char alphanumeric ID from a seed.
   */
  private seededId(seed: number): string {
    let h = seed;
    h = ((h >> 16) ^ h) * 0x45d9f3b;
    h = ((h >> 16) ^ h) * 0x45d9f3b;
    h = (h >> 16) ^ h;
    return Math.abs(h).toString(36).slice(0, 8).padStart(8, '0');
  }

  // =========================================================================
  // Slots
  // =========================================================================

  allocSlot(): ValueSlot {
    return valueSlot(this.slotCounter++);
  }

  /**
   * Allocate a typed value slot (tracking type for slotMeta generation).
   */
  allocTypedSlot(type: SignalType, _label?: string): ValueSlot {
    const slot = valueSlot(this.slotCounter++);
    this.slotTypes.set(slot, type);
    return slot;
  }

  /**
   * Allocate a value slot with type (alias for allocTypedSlot for interface compatibility).
   */
  allocValueSlot(type: SignalType, label?: string): ValueSlot {
    return this.allocTypedSlot(type, label);
  }

  getSlotCount(): number {
    return this.slotCounter;
  }

  /**
   * Get slot type information for slotMeta generation.
   */
  getSlotTypes(): ReadonlyMap<ValueSlot, SignalType> {
    return this.slotTypes;
  }

  // =========================================================================
  // State Slots (Persistent Cross-Frame Storage)
  // =========================================================================

  allocStateSlot(
    stableId: StableStateId,
    options?: {
      initialValue?: number;
      stride?: number;
      instanceId?: InstanceId;
      laneCount?: number;
    }
  ): StateSlotId {
    const initialValue = options?.initialValue ?? 0;
    const stride = options?.stride ?? 1;
    const initial = Array(stride).fill(initialValue);

    const slotIndex = this.stateSlotCounter;

    if (options?.instanceId !== undefined) {
      // Field state (many cardinality)
      const laneCount = options.laneCount;
      if (laneCount === undefined) {
        throw new Error('allocStateSlot: laneCount required when instanceId is provided');
      }
      this.stateMappings.push({
        kind: 'field',
        stateId: stableId,
        instanceId: options.instanceId as string,
        slotStart: slotIndex,
        laneCount,
        stride,
        initial,
      });
      // Reserve slots for all lanes
      this.stateSlotCounter += laneCount * stride;
    } else {
      // Scalar state (signal cardinality)
      this.stateMappings.push({
        kind: 'scalar',
        stateId: stableId,
        slotIndex,
        stride,
        initial,
      });
      this.stateSlotCounter += stride;
    }

    return stateSlotId(slotIndex);
  }

  sigStateRead(stateSlot: StateSlotId, type: SignalType): SigExprId {
    const id = sigExprId(this.sigExprs.length);
    this.sigExprs.push({ kind: 'stateRead', stateSlot, type });
    return id;
  }

  stepStateWrite(stateSlot: StateSlotId, value: SigExprId): void {
    this.steps.push({ kind: 'stateWrite', stateSlot, value });
  }

  fieldStateRead(stateSlot: StateSlotId, instanceId: InstanceId, type: SignalType): FieldExprId {
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'stateRead', stateSlot, instanceId, type });
    return id;
  }

  stepFieldStateWrite(stateSlot: StateSlotId, value: FieldExprId): void {
    this.steps.push({ kind: 'fieldStateWrite', stateSlot, value });
  }

  stepEvalSig(expr: SigExprId, target: ValueSlot): void {
    this.steps.push({ kind: 'evalSig', expr, target });
  }

  stepMaterialize(field: FieldExprId, instanceId: InstanceId, target: ValueSlot): void {
    this.steps.push({ kind: 'materialize', field, instanceId, target });
  }

  stepContinuityMapBuild(instanceId: InstanceId): void {
    // outputMapping key is derived from instanceId for consistency
    this.steps.push({ kind: 'continuityMapBuild', instanceId, outputMapping: `mapping_${instanceId}` });
  }

  stepContinuityApply(
    targetKey: string,
    instanceId: InstanceId,
    policy: ContinuityPolicy,
    baseSlot: ValueSlot,
    outputSlot: ValueSlot,
    semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom'
  ): void {
    this.steps.push({
      kind: 'continuityApply',
      targetKey,
      instanceId,
      policy,
      baseSlot,
      outputSlot,
      semantic,
    });
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

  registerEventSlot(eventId: EventExprId, slot: ValueSlot): void {
    this.eventSlots.set(eventId, slot);
  }

  // =========================================================================
  // State
  // =========================================================================

  allocState(_initialValue: unknown): StateId {
    return stateId(`state_${this.stateCounter++}`);
  }

  // =========================================================================
  // Debug Tracking
  // =========================================================================

  setCurrentBlockId(blockId: string | undefined): void {
    this.currentBlockId = blockId;
  }

  allocConstId(_value: number): number {
    return this.constCounter++;
  }

  // =========================================================================
  // Time Model
  // =========================================================================

  setTimeModel(model: TimeModelIR): void {
    this.timeModel = model;
  }

  getTimeModel(): TimeModelIR | undefined {
    return this.timeModel;
  }

  // =========================================================================
  // Pure Functions
  // =========================================================================

  opcode(op: OpCode): PureFn {
    return { kind: 'opcode', opcode: op };
  }

  expr(expression: string): PureFn {
    return { kind: 'expr', expr: expression };
  }

  kernel(name: string): PureFn {
    return { kind: 'kernel', name };
  }

  // =========================================================================
  // Build Result
  // =========================================================================

  getSigExprs(): readonly SigExpr[] {
    return this.sigExprs;
  }

  getFieldExprs(): readonly FieldExpr[] {
    return this.fieldExprs;
  }

  getEventExprs(): readonly EventExpr[] {
    return this.eventExprs;
  }

  getSigSlots(): ReadonlyMap<number, ValueSlot> {
    return this.sigSlots;
  }

  getFieldSlots(): ReadonlyMap<number, ValueSlot> {
    return this.fieldSlots;
  }

  getEventSlots(): ReadonlyMap<EventExprId, ValueSlot> {
    return this.eventSlots;
  }

  /**
   * Get state mappings with stable IDs for hot-swap migration.
   */
  getStateMappings(): readonly StateMapping[] {
    return this.stateMappings;
  }

  /**
   * Get legacy state slots format (for backwards compatibility).
   * @deprecated Use getStateMappings() instead
   */
  getStateSlots(): readonly { initialValue: number }[] {
    // Convert new format back to old format for backwards compatibility
    const slots: { initialValue: number }[] = [];
    for (const mapping of this.stateMappings) {
      if (mapping.kind === 'scalar') {
        for (let i = 0; i < mapping.stride; i++) {
          slots.push({ initialValue: mapping.initial[i] });
        }
      } else {
        // Field state: expand all lanes
        for (let lane = 0; lane < mapping.laneCount; lane++) {
          for (let i = 0; i < mapping.stride; i++) {
            slots.push({ initialValue: mapping.initial[i] });
          }
        }
      }
    }
    return slots;
  }

  getStateSlotCount(): number {
    return this.stateSlotCounter;
  }

  getSteps(): readonly Step[] {
    return this.steps;
  }

  getSchedule(): TimeModelIR {
    if (!this.timeModel) {
      throw new Error('Time model not set');
    }
    return this.timeModel;
  }
}

/**
 * Create a new IRBuilder instance.
 */
export function createIRBuilder(): IRBuilder {
  return new IRBuilderImpl();
}
