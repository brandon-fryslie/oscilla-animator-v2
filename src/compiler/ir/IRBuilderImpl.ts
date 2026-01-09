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
} from './Indices';
import {
  sigExprId,
  fieldExprId,
  eventExprId,
  valueSlot,
  domainId,
  stateId,
} from './Indices';
import type { TimeModelIR } from './schedule';
import type {
  PureFn,
  OpCode,
  SigExpr,
  FieldExpr,
  EventExpr,
  DomainDef,
} from './types';

// =============================================================================
// IRBuilderImpl
// =============================================================================

export class IRBuilderImpl implements IRBuilder {
  private sigExprs: SigExpr[] = [];
  private fieldExprs: FieldExpr[] = [];
  private eventExprs: EventExpr[] = [];
  private domains: Map<DomainId, DomainDef> = new Map();
  private slotCounter = 0;
  private stateCounter = 0;
  private constCounter = 0;
  private timeModel: TimeModelIR | undefined;
  private currentBlockId: string | undefined;

  // Slot registrations for debug/validation
  private sigSlots = new Map<number, ValueSlot>();
  private fieldSlots = new Map<number, ValueSlot>();
  private eventSlots = new Map<EventExprId, ValueSlot>();

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

  // =========================================================================
  // Signal Combine
  // =========================================================================

  sigCombine(
    inputs: readonly number[],
    mode: 'sum' | 'average' | 'max' | 'min' | 'last',
    type: SignalType
  ): number {
    // For combining signals, we use zip with appropriate combine function
    const sigInputs = inputs.map(i => i as SigExprId);
    const fn: PureFn = { kind: 'kernel', name: `combine_${mode}` };
    const id = sigExprId(this.sigExprs.length);
    this.sigExprs.push({ kind: 'zip', inputs: sigInputs, fn, type });
    return id;
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

  fieldBroadcast(signal: SigExprId, type: SignalType): FieldExprId {
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'broadcast', signal, type });
    return id;
  }

  fieldMap(input: FieldExprId, fn: PureFn, type: SignalType): FieldExprId {
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'map', input, fn, type });
    return id;
  }

  fieldZip(inputs: readonly FieldExprId[], fn: PureFn, type: SignalType): FieldExprId {
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'zip', inputs, fn, type });
    return id;
  }

  fieldZipSig(
    field: FieldExprId,
    signals: readonly SigExprId[],
    fn: PureFn,
    type: SignalType
  ): FieldExprId {
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'zipSig', field, signals, fn, type });
    return id;
  }

  // =========================================================================
  // Field Combine
  // =========================================================================

  fieldCombine(
    inputs: readonly number[],
    mode: 'sum' | 'average' | 'max' | 'min' | 'last' | 'product',
    type: SignalType
  ): number {
    // For combining fields, we use zip with appropriate combine function
    const fieldInputs = inputs.map(i => i as FieldExprId);
    const fn: PureFn = { kind: 'kernel', name: `combine_${mode}` };
    const id = fieldExprId(this.fieldExprs.length);
    this.fieldExprs.push({ kind: 'zip', inputs: fieldInputs, fn, type });
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

  // =========================================================================
  // Domains
  // =========================================================================

  createDomain(
    kind: 'grid' | 'n' | 'path',
    count: number,
    params: Record<string, unknown> = {}
  ): DomainId {
    const id = domainId(`domain_${this.domains.size}`);
    const elementIds = Array.from({ length: count }, (_, i) => `${id}_${i}`);
    this.domains.set(id, { id, kind, count, elementIds, params });
    return id;
  }

  // =========================================================================
  // Slots
  // =========================================================================

  allocSlot(): ValueSlot {
    return valueSlot(this.slotCounter++);
  }

  allocValueSlot(_type: SignalType, _label?: string): ValueSlot {
    return valueSlot(this.slotCounter++);
  }

  getSlotCount(): number {
    return this.slotCounter;
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

  getDomains(): ReadonlyMap<DomainId, DomainDef> {
    return this.domains;
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
}

/**
 * Create a new IRBuilder instance.
 */
export function createIRBuilder(): IRBuilder {
  return new IRBuilderImpl();
}
