/**
 * Block Registry
 *
 * ONE pattern for all blocks. No exceptions.
 *
 * Each block:
 * 1. Declares its inputs and outputs with types
 * 2. Provides a lower() function that emits IR
 * 3. Returns outputs keyed by portId
 */
import type { DomainId, EventExprId, FieldExprId, PortId, SigExprId } from '../../types';
import type { SignalType, DomainRef } from '../../core/canonical-types';
import { type PayloadType } from '../../core/canonical-types';
import type { IRBuilder } from '../ir';
/**
 * A reference to a value in the IR.
 * This is what gets passed between blocks during lowering.
 */
export type ValueRef = {
    kind: 'sig';
    id: SigExprId;
    type: SignalType;
} | {
    kind: 'field';
    id: FieldExprId;
    type: SignalType;
} | {
    kind: 'event';
    id: EventExprId;
} | {
    kind: 'domain';
    id: DomainId;
} | {
    kind: 'scalar';
    value: number | string | boolean;
    type: SignalType;
};
export interface PortDef {
    readonly portId: PortId;
    readonly type: SignalType | DomainRef;
    readonly optional?: boolean;
    readonly defaultValue?: unknown;
}
export interface LowerContext {
    /** IR builder for emitting nodes */
    readonly b: IRBuilder;
    /** Block configuration (from block.params) */
    readonly config: Readonly<Record<string, unknown>>;
    /** Resolved inputs by port ID */
    readonly inputsById: Readonly<Record<string, ValueRef | undefined>>;
}
/**
 * Block lowering function.
 * Takes context with inputs, returns outputs by port ID.
 */
export type BlockLower = (ctx: LowerContext) => Readonly<Record<string, ValueRef>>;
export interface BlockDef {
    readonly type: string;
    readonly inputs: readonly PortDef[];
    readonly outputs: readonly PortDef[];
    readonly lower: BlockLower;
}
export declare function registerBlock(def: BlockDef): void;
export declare function getBlock(type: string): BlockDef | undefined;
export declare function getAllBlocks(): readonly BlockDef[];
export declare function portId(s: string): PortId;
/**
 * Create a Signal SignalType (one + continuous).
 */
export declare function sigType(payload: PayloadType): SignalType;
/**
 * Create a Field SignalType (many(domain) + continuous).
 * Note: This creates a default field type. Actual domain will be unified at compile time.
 */
export declare function fieldType(payload: PayloadType): SignalType;
/**
 * Create a Static/Scalar SignalType (zero + continuous).
 */
export declare function scalarType(payload: PayloadType): SignalType;
/**
 * Create an Event SignalType.
 * Note: Events use discrete temporality.
 */
export declare function eventType(payload?: PayloadType): SignalType;
/**
 * Create a DomainRef for domain output ports.
 */
export declare function domainType(id?: string): DomainRef;
type SigRef = {
    kind: 'sig';
    id: SigExprId;
    type: SignalType;
};
type FieldRef = {
    kind: 'field';
    id: FieldExprId;
    type: SignalType;
};
type DomainRefValue = {
    kind: 'domain';
    id: DomainId;
};
/** Extract required signal input - throws if missing or wrong type */
export declare function sig(inputs: Record<string, ValueRef | undefined>, port: string): SigRef;
/** Extract required field input - throws if missing or wrong type */
export declare function field(inputs: Record<string, ValueRef | undefined>, port: string): FieldRef;
/** Extract required domain input - throws if missing or wrong type */
export declare function domain(inputs: Record<string, ValueRef | undefined>, port: string): DomainRefValue;
/** Extract signal OR field input (for polymorphic ports) */
export declare function sigOrField(inputs: Record<string, ValueRef | undefined>, port: string): SigRef | FieldRef;
export {};
