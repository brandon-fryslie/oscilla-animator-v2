/**
 * IR Builder
 *
 * Provides a clean API for emitting IR nodes during compilation.
 * Handles ID allocation and expression deduplication.
 */

import type { SignalType } from '../../core/canonical-types';
import {
  domainId as makeDomainId,
  valueSlot as makeValueSlot,
  sigExprId as makeSigExprId,
  fieldExprId as makeFieldExprId,
  eventExprId as makeEventExprId,
  type DomainId,
  type EventExprId,
  type FieldExprId,
  type SigExprId,
  type ValueSlot,
} from './Indices';
import type {
  DomainDef,
  EventExpr,
  FieldExpr,
  IRProgram,
  OpCode,
  PureFn,
  SigExpr,
  Step,
  TimeModel,
} from './types';

export class IRBuilder {
  private signals = new Map<SigExprId, SigExpr>();
  private fields = new Map<FieldExprId, FieldExpr>();
  private events = new Map<EventExprId, EventExpr>();
  private domains = new Map<DomainId, DomainDef>();
  private steps: Step[] = [];

  private nextSigId = 0;
  private nextFieldId = 0;
  private nextEventId = 0;
  private nextDomainId = 0;
  private nextSlotId = 0;

  private timeModel: TimeModel = { kind: 'infinite' };

  // ===========================================================================
  // Time Model
  // ===========================================================================

  setTimeModel(model: TimeModel): void {
    this.timeModel = model;
  }

  // ===========================================================================
  // Slot Allocation
  // ===========================================================================

  allocSlot(): ValueSlot {
    return makeValueSlot(this.nextSlotId++);
  }

  // ===========================================================================
  // Signal Expressions
  // ===========================================================================

  sigConst(value: number | string | boolean, type: SignalType): SigExprId {
    const id = makeSigExprId(this.nextSigId++);
    this.signals.set(id, { kind: 'const', value, type });
    return id;
  }

  sigSlot(slot: ValueSlot, type: SignalType): SigExprId {
    const id = makeSigExprId(this.nextSigId++);
    this.signals.set(id, { kind: 'slot', slot, type });
    return id;
  }

  sigTime(
    which: 't' | 'dt' | 'phase' | 'pulse' | 'energy',
    type: SignalType
  ): SigExprId {
    const id = makeSigExprId(this.nextSigId++);
    this.signals.set(id, { kind: 'time', which, type });
    return id;
  }

  sigExternal(
    which: 'mouseX' | 'mouseY' | 'mouseOver',
    type: SignalType
  ): SigExprId {
    const id = makeSigExprId(this.nextSigId++);
    this.signals.set(id, { kind: 'external', which, type });
    return id;
  }

  sigMap(input: SigExprId, fn: PureFn, type: SignalType): SigExprId {
    const id = makeSigExprId(this.nextSigId++);
    this.signals.set(id, { kind: 'map', input, fn, type });
    return id;
  }

  sigZip(inputs: readonly SigExprId[], fn: PureFn, type: SignalType): SigExprId {
    const id = makeSigExprId(this.nextSigId++);
    this.signals.set(id, { kind: 'zip', inputs, fn, type });
    return id;
  }

  // Convenience: binary op
  sigBinOp(a: SigExprId, b: SigExprId, op: OpCode, type: SignalType): SigExprId {
    return this.sigZip([a, b], { kind: 'opcode', opcode: op }, type);
  }

  // Convenience: unary op
  sigUnaryOp(input: SigExprId, op: OpCode, type: SignalType): SigExprId {
    return this.sigMap(input, { kind: 'opcode', opcode: op }, type);
  }

  // ===========================================================================
  // Field Expressions
  // ===========================================================================

  fieldConst(value: number | string, type: SignalType): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'const', value, type });
    return id;
  }

  fieldSource(
    domain: DomainId,
    sourceId: 'pos0' | 'idRand' | 'index' | 'normalizedIndex',
    type: SignalType
  ): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'source', domain, sourceId, type });
    return id;
  }

  fieldBroadcast(signal: SigExprId, type: SignalType): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'broadcast', signal, type });
    return id;
  }

  fieldMap(input: FieldExprId, fn: PureFn, type: SignalType): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'map', input, fn, type });
    return id;
  }

  fieldZip(
    inputs: readonly FieldExprId[],
    fn: PureFn,
    type: SignalType
  ): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'zip', inputs, fn, type });
    return id;
  }

  fieldZipSig(
    field: FieldExprId,
    signals: readonly SigExprId[],
    fn: PureFn,
    type: SignalType
  ): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'zipSig', field, signals, fn, type });
    return id;
  }

  fieldMapIndexed(
    domain: DomainId,
    fn: PureFn,
    type: SignalType,
    signals?: readonly SigExprId[]
  ): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'mapIndexed', domain, fn, type, signals });
    return id;
  }

  // ===========================================================================
  // Event Expressions
  // ===========================================================================

  eventPulse(): EventExprId {
    const id = makeEventExprId(this.nextEventId++);
    this.events.set(id, { kind: 'pulse', source: 'timeRoot' });
    return id;
  }

  eventWrap(signal: SigExprId): EventExprId {
    const id = makeEventExprId(this.nextEventId++);
    this.events.set(id, { kind: 'wrap', signal });
    return id;
  }

  eventCombine(
    events: readonly EventExprId[],
    mode: 'any' | 'all'
  ): EventExprId {
    const id = makeEventExprId(this.nextEventId++);
    this.events.set(id, { kind: 'combine', events, mode });
    return id;
  }

  // ===========================================================================
  // Domains
  // ===========================================================================

  domainGrid(rows: number, cols: number): DomainId {
    const id = makeDomainId(`domain_${this.nextDomainId++}`);
    const count = rows * cols;
    const elementIds = Array.from({ length: count }, (_, i) =>
      this.seededId(rows * 10000 + cols + i)
    );
    this.domains.set(id, {
      id,
      kind: 'grid',
      count,
      elementIds,
      params: { rows, cols },
    });
    return id;
  }

  domainN(n: number, seed: number = 0): DomainId {
    const id = makeDomainId(`domain_${this.nextDomainId++}`);
    const elementIds = Array.from({ length: n }, (_, i) =>
      this.seededId(seed * 100000 + n + i)
    );
    this.domains.set(id, {
      id,
      kind: 'n',
      count: n,
      elementIds,
      params: { n, seed },
    });
    return id;
  }

  private seededId(seed: number): string {
    // Simple deterministic hash to 8-char alphanumeric
    let h = seed;
    h = ((h >> 16) ^ h) * 0x45d9f3b;
    h = ((h >> 16) ^ h) * 0x45d9f3b;
    h = (h >> 16) ^ h;
    return Math.abs(h).toString(36).slice(0, 8).padStart(8, '0');
  }

  // ===========================================================================
  // Steps
  // ===========================================================================

  stepEvalSig(expr: SigExprId, target: ValueSlot): void {
    this.steps.push({ kind: 'evalSig', expr, target });
  }

  stepMaterialize(
    field: FieldExprId,
    domain: DomainId,
    target: ValueSlot
  ): void {
    this.steps.push({ kind: 'materialize', field, domain, target });
  }

  stepRender(
    domain: DomainId,
    position: FieldExprId,
    color: FieldExprId,
    size?: SigExprId | FieldExprId
  ): void {
    this.steps.push({ kind: 'render', domain, position, color, size });
  }

  // ===========================================================================
  // Build
  // ===========================================================================

  build(): IRProgram {
    return {
      timeModel: this.timeModel,
      signals: new Map(this.signals),
      fields: new Map(this.fields),
      events: new Map(this.events),
      domains: new Map(this.domains),
      steps: [...this.steps],
      slotCount: this.nextSlotId,
    };
  }
}
