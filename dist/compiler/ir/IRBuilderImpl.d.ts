/**
 * IRBuilder Implementation
 *
 * Concrete implementation of the IRBuilder interface.
 */
import type { SignalType } from '../../core/canonical-types';
import type { IRBuilder } from './IRBuilder';
import type { SigExprId, FieldExprId, EventExprId, ValueSlot, DomainId, StateId } from './Indices';
import type { TimeModelIR } from './schedule';
import type { PureFn, OpCode, SigExpr, FieldExpr, EventExpr, DomainDef } from './types';
export declare class IRBuilderImpl implements IRBuilder {
    private sigExprs;
    private fieldExprs;
    private eventExprs;
    private domains;
    private slotCounter;
    private stateCounter;
    private constCounter;
    private timeModel;
    private currentBlockId;
    private sigSlots;
    private fieldSlots;
    private eventSlots;
    sigConst(value: number | string | boolean, type: SignalType): SigExprId;
    sigSlot(slot: ValueSlot, type: SignalType): SigExprId;
    sigTime(which: 't' | 'dt' | 'phase' | 'pulse' | 'energy', type: SignalType): SigExprId;
    sigExternal(which: 'mouseX' | 'mouseY' | 'mouseOver', type: SignalType): SigExprId;
    sigMap(input: SigExprId, fn: PureFn, type: SignalType): SigExprId;
    sigZip(inputs: readonly SigExprId[], fn: PureFn, type: SignalType): SigExprId;
    sigCombine(inputs: readonly number[], mode: 'sum' | 'average' | 'max' | 'min' | 'last', type: SignalType): number;
    fieldConst(value: number | string, type: SignalType): FieldExprId;
    fieldSource(domain: DomainId, sourceId: 'pos0' | 'idRand' | 'index' | 'normalizedIndex', type: SignalType): FieldExprId;
    fieldBroadcast(signal: SigExprId, type: SignalType): FieldExprId;
    fieldMap(input: FieldExprId, fn: PureFn, type: SignalType): FieldExprId;
    fieldZip(inputs: readonly FieldExprId[], fn: PureFn, type: SignalType): FieldExprId;
    fieldZipSig(field: FieldExprId, signals: readonly SigExprId[], fn: PureFn, type: SignalType): FieldExprId;
    fieldCombine(inputs: readonly number[], mode: 'sum' | 'average' | 'max' | 'min' | 'last' | 'product', type: SignalType): number;
    eventPulse(source: 'timeRoot'): EventExprId;
    eventWrap(signal: SigExprId): EventExprId;
    eventCombine(events: readonly EventExprId[], mode: 'any' | 'all' | 'merge' | 'last', _type?: SignalType): EventExprId;
    createDomain(kind: 'grid' | 'n' | 'path', count: number, params?: Record<string, unknown>): DomainId;
    allocSlot(): ValueSlot;
    allocValueSlot(_type: SignalType, _label?: string): ValueSlot;
    getSlotCount(): number;
    registerSigSlot(sigId: number, slot: ValueSlot): void;
    registerFieldSlot(fieldId: number, slot: ValueSlot): void;
    registerEventSlot(eventId: EventExprId, slot: ValueSlot): void;
    allocState(_initialValue: unknown): StateId;
    setCurrentBlockId(blockId: string | undefined): void;
    allocConstId(_value: number): number;
    setTimeModel(model: TimeModelIR): void;
    getTimeModel(): TimeModelIR | undefined;
    opcode(op: OpCode): PureFn;
    expr(expression: string): PureFn;
    kernel(name: string): PureFn;
    getSigExprs(): readonly SigExpr[];
    getFieldExprs(): readonly FieldExpr[];
    getEventExprs(): readonly EventExpr[];
    getDomains(): ReadonlyMap<DomainId, DomainDef>;
    getSigSlots(): ReadonlyMap<number, ValueSlot>;
    getFieldSlots(): ReadonlyMap<number, ValueSlot>;
    getEventSlots(): ReadonlyMap<EventExprId, ValueSlot>;
}
/**
 * Create a new IRBuilder instance.
 */
export declare function createIRBuilder(): IRBuilder;
