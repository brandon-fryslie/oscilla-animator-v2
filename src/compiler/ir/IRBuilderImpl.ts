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
  DomainId,
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
  domainId,
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
  LayoutSpec,
  Step,
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
  private stateSlots: { initialValue: number }[] = [];

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
    // Note: Using slot as SlotId - needs type alignment
    this.sigExprs.push({ kind: 'slot', slot: slot as any, type });
    return id;
  }

  sigTime(which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'pulse' | 'progress', type: SignalType): SigExprId {
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

  fieldSource(
    domain: DomainId,
    sourceId: 'pos0' | 'idRand' | 'index' | 'normalizedIndex',
    type: SignalType
  ): FieldExprId {
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'source', domain, sourceId, type });
    return id;
  }

  /**
   * Create a field from an intrinsic property (NEW).
   */
  fieldIntrinsic(instanceId: InstanceId, intrinsic: string, type: SignalType): FieldExprId {
    const id = fieldExprId(this.fieldExprs.length);
    // Store as a new-style FieldExprSource with instanceId and intrinsic
    // For now, we'll add these as extra properties that coexist with old ones
    this.fieldExprs.push({
      kind: 'source',
      domain: domainId('deprecated'), // Placeholder for old field
      sourceId: 'index', // Placeholder for old field
      instanceId: instanceId as any, // NEW field
      intrinsic: intrinsic as any, // NEW field
      type,
    } as any);
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

  /**
   * Create a layout field expression (Stage 3: Field operation for positions).
   * Applies a layout specification to compute positions for field elements.
   */
  fieldLayout(
    input: FieldExprId,
    layoutSpec: LayoutSpec,
    instanceId: InstanceId,
    type: SignalType
  ): FieldExprId {
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({
      kind: 'layout',
      input,
      layoutSpec,
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
    const domain = this.inferFieldDomain(input);
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'map', input, fn, type, domain });
    return id;
  }

  fieldZip(inputs: readonly FieldExprId[], fn: PureFn, type: SignalType): FieldExprId {
    const domain = this.inferZipDomain(inputs);
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'zip', inputs, fn, type, domain });
    return id;
  }

  fieldZipSig(
    field: FieldExprId,
    signals: readonly SigExprId[],
    fn: PureFn,
    type: SignalType
  ): FieldExprId {
    const domain = this.inferFieldDomain(field);
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'zipSig', field, signals, fn, type, domain });
    return id;
  }

  /**
   * Map over domain indices with optional signal inputs.
   * This creates a field from scratch, so domain must be explicit.
   */
  fieldMapIndexed(
    domain: DomainId,
    fn: PureFn,
    type: SignalType,
    signals?: readonly SigExprId[]
  ): FieldExprId {
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'mapIndexed', domain, fn, type, signals });
    return id;
  }

  /**
   * Legacy alias for fieldSource with sourceId='index'.
   * Kept for backward compatibility with existing blocks.
   */
  fieldIndex(domain: DomainId, type: SignalType): FieldExprId {
    return this.fieldSource(domain, 'index', type);
  }

  // =========================================================================
  // Domain Inference
  // =========================================================================

  /**
   * Infer domain from a field expression (public for render sink validation).
   * Returns the domain ID if the field is bound to a specific domain,
   * or undefined if the field has no inherent domain (e.g., broadcast, const).
   */
  inferFieldDomain(fieldId: FieldExprId): DomainId | undefined {
    const expr = this.fieldExprs[fieldId as number];
    if (!expr) return undefined;

    switch (expr.kind) {
      case 'source':
        return expr.domain;
      case 'mapIndexed':
        return expr.domain;
      case 'map':
        return (expr as any).domain ?? this.inferFieldDomain(expr.input);
      case 'zip':
        return (expr as any).domain ?? this.inferZipDomain(expr.inputs);
      case 'zipSig':
        return (expr as any).domain ?? this.inferFieldDomain(expr.field);
      case 'broadcast':
      case 'const':
        return undefined; // No inherent domain
      case 'array':
      case 'layout':
        return undefined; // These use instance-based model
    }
  }

  /**
   * Infer domain from zip inputs, throwing an error if they differ.
   * Returns the unified domain, or undefined if all inputs are domain-free.
   */
  private inferZipDomain(inputs: readonly FieldExprId[]): DomainId | undefined {
    const domains: DomainId[] = [];
    for (const id of inputs) {
      const d = this.inferFieldDomain(id);
      if (d !== undefined) {
        domains.push(d);
      }
    }

    if (domains.length === 0) return undefined;

    const first = domains[0];
    for (let i = 1; i < domains.length; i++) {
      if (domains[i] !== first) {
        throw new Error(
          `Domain mismatch in fieldZip: '${first}' vs '${domains[i]}'. ` +
          `All field inputs must share the same domain.`
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
   */
  createInstance(
    domainType: DomainTypeId,
    count: number,
    layout: LayoutSpec,
    lifecycle: 'static' | 'dynamic' | 'pooled' = 'static'
  ): InstanceId {
    const id = instanceId(`instance_${this.instances.size}`);
    this.instances.set(id, {
      id: id as string,
      domainType: domainType as string,
      count,
      layout,
      lifecycle,
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

  allocStateSlot(initialValue: number = 0): StateSlotId {
    const id = stateSlotId(this.stateSlotCounter++);
    this.stateSlots.push({ initialValue });
    return id;
  }

  sigStateRead(stateSlot: StateSlotId, type: SignalType): SigExprId {
    const id = sigExprId(this.sigExprs.length);
    this.sigExprs.push({ kind: 'stateRead', stateSlot, type });
    return id;
  }

  stepStateWrite(stateSlot: StateSlotId, value: SigExprId): void {
    this.steps.push({ kind: 'stateWrite', stateSlot, value });
  }

  stepEvalSig(expr: SigExprId, target: ValueSlot): void {
    this.steps.push({ kind: 'evalSig', expr, target });
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

  getStateSlots(): readonly { initialValue: number }[] {
    return this.stateSlots;
  }

  getStateSlotCount(): number {
    return this.stateSlotCounter;
  }

  getSteps(): readonly Step[] {
    return this.steps;
  }

  // =========================================================================
  // Missing Interface Methods (Stubs)
  // =========================================================================

  getTimepointMarkers(): { start: number; end: number } | null {
    // TODO: Implement timepoint markers
    return null;
  }

  getSchedule(): TimeModelIR {
    if (!this.timeModel) {
      throw new Error('Time model not set');
    }
    return this.timeModel;
  }

  declareState(_id: StateId, _type: SignalType, _initialValue?: unknown): void {
    // TODO: Implement state declaration
  }

  readState(_id: StateId, type: SignalType): SigExprId {
    // TODO: Implement state reading
    // For now, return a dummy const
    return this.sigConst(0, type);
  }

  writeState(_id: StateId, _value: SigExprId): void {
    // TODO: Implement state writing
  }
}

/**
 * Create a new IRBuilder instance.
 */
export function createIRBuilder(): IRBuilder {
  return new IRBuilderImpl();
}
