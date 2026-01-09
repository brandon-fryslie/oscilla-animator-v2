/**
 * IR Builder
 *
 * Provides a clean API for emitting IR nodes during compilation.
 * Handles ID allocation and expression deduplication.
 */
import type { SignalType } from '../../core/canonical-types';
import { type DomainId, type EventExprId, type FieldExprId, type SigExprId, type ValueSlot } from './Indices';
import type { CompiledProgramIR } from './program';
import type { DomainDef, FieldExpr, OpCode, PureFn, SigExpr, TimeModel } from './types';
export declare class IRBuilder {
    private signals;
    private fields;
    private events;
    private domains;
    private steps;
    private nextSigId;
    private nextFieldId;
    private nextEventId;
    private nextDomainId;
    private nextSlotId;
    private timeModel;
    private slotTypes;
    setTimeModel(model: TimeModel): void;
    allocSlot(): ValueSlot;
    /** Allocate a typed value slot (tracking type for slotMeta) */
    allocTypedSlot(type: SignalType, _label?: string): ValueSlot;
    sigConst(value: number | string | boolean, type: SignalType): SigExprId;
    sigSlot(slot: ValueSlot, type: SignalType): SigExprId;
    sigTime(which: 't' | 'dt' | 'phase' | 'pulse' | 'energy', type: SignalType): SigExprId;
    sigExternal(which: 'mouseX' | 'mouseY' | 'mouseOver', type: SignalType): SigExprId;
    sigMap(input: SigExprId, fn: PureFn, type: SignalType): SigExprId;
    sigZip(inputs: readonly SigExprId[], fn: PureFn, type: SignalType): SigExprId;
    sigBinOp(a: SigExprId, b: SigExprId, op: OpCode, type: SignalType): SigExprId;
    sigUnaryOp(input: SigExprId, op: OpCode, type: SignalType): SigExprId;
    fieldConst(value: number | string, type: SignalType): FieldExprId;
    fieldSource(domain: DomainId, sourceId: 'pos0' | 'idRand' | 'index' | 'normalizedIndex', type: SignalType): FieldExprId;
    fieldBroadcast(signal: SigExprId, type: SignalType): FieldExprId;
    fieldMap(input: FieldExprId, fn: PureFn, type: SignalType): FieldExprId;
    fieldZip(inputs: readonly FieldExprId[], fn: PureFn, type: SignalType): FieldExprId;
    fieldZipSig(field: FieldExprId, signals: readonly SigExprId[], fn: PureFn, type: SignalType): FieldExprId;
    fieldMapIndexed(domain: DomainId, fn: PureFn, type: SignalType, signals?: readonly SigExprId[]): FieldExprId;
    eventPulse(): EventExprId;
    eventWrap(signal: SigExprId): EventExprId;
    eventCombine(events: readonly EventExprId[], mode: 'any' | 'all'): EventExprId;
    domainGrid(rows: number, cols: number): DomainId;
    domainN(n: number, seed?: number): DomainId;
    private seededId;
    stepEvalSig(expr: SigExprId, target: ValueSlot): void;
    stepMaterialize(field: FieldExprId, domain: DomainId, target: ValueSlot): void;
    stepRender(domain: DomainId, position: FieldExprId, color: FieldExprId, size?: SigExprId | FieldExprId): void;
    build(): CompiledProgramIR;
    /** Get domains map (for runtime that still needs it) */
    getDomains(): ReadonlyMap<DomainId, DomainDef>;
    /** Get signals map (for runtime that still needs it) */
    getSignals(): ReadonlyMap<SigExprId, SigExpr>;
    /** Get fields map (for runtime that still needs it) */
    getFields(): ReadonlyMap<FieldExprId, FieldExpr>;
    /** Get slot count (for runtime state initialization) */
    getSlotCount(): number;
}
