/**
 * Lower Types - Types for block lowering pass
 *
 * These types represent the intermediate results of lowering blocks
 * to IR expressions.
 */
import type { TypeDesc } from '../../core/types';
import type { SigExprId, FieldExprId, ValueSlot, DomainId, StateId } from './Indices';
import type { BlockIndex } from '../../graph/normalize';
import type { IRBuilder } from './IRBuilder';
/**
 * Packed value reference - represents a signal, field, event, domain, or scalar.
 * Used throughout the compiler pipeline for tracking IR expressions.
 */
export type ValueRefPacked = {
    readonly k: 'sig';
    readonly id: number;
    readonly slot: ValueSlot;
} | {
    readonly k: 'field';
    readonly id: number;
    readonly slot: ValueSlot;
} | {
    readonly k: 'event';
    readonly id: number;
    readonly slot: ValueSlot;
} | {
    readonly k: 'domain';
    readonly id: DomainId;
} | {
    readonly k: 'scalar';
    readonly value: unknown;
};
/**
 * Port declaration for IR block types.
 */
export interface IRPortDecl {
    readonly portId: string;
    readonly type: TypeDesc;
}
/**
 * Lower result - output of a block's lower function.
 */
export interface LowerResult {
    /** Map of port ID to ValueRef (required, replaces outputs array) */
    readonly outputsById: Record<string, ValueRefPacked>;
}
/**
 * Lower context - provided to block lower functions.
 */
export interface LowerCtx {
    readonly blockIdx: BlockIndex;
    readonly blockType: string;
    readonly instanceId: string;
    readonly label?: string;
    readonly inTypes: readonly TypeDesc[];
    readonly outTypes: readonly TypeDesc[];
    readonly b: IRBuilder;
    readonly seedConstId: number;
}
/**
 * Lower args - arguments to a block's lower function.
 */
export interface LowerArgs {
    readonly ctx: LowerCtx;
    readonly inputs: readonly ValueRefPacked[];
    readonly inputsById: Record<string, ValueRefPacked>;
    readonly config?: Readonly<Record<string, unknown>>;
}
/**
 * Block type declaration for IR lowering.
 */
export interface BlockTypeDecl {
    readonly type: string;
    readonly inputs: readonly IRPortDecl[];
    readonly outputs: readonly IRPortDecl[];
    readonly lower: (args: LowerArgs) => LowerResult;
    readonly tags?: {
        readonly irPortContract?: 'strict' | 'relaxed';
    };
}
/**
 * Register a block type for IR lowering.
 */
export declare function registerBlockType(decl: BlockTypeDecl): void;
/**
 * Get a block type declaration by type name.
 */
export declare function getBlockType(type: string): BlockTypeDecl | undefined;
/**
 * Check if a block type is registered.
 */
export declare function hasBlockType(type: string): boolean;
/**
 * Get all registered block type names.
 */
export declare function getAllBlockTypes(): string[];
/**
 * Lowered output - result of lowering a block output.
 */
export type LoweredOutput = LoweredSignal | LoweredField | LoweredScalar | LoweredDomain;
export interface LoweredSignal {
    readonly kind: 'signal';
    readonly sigId: SigExprId;
    readonly type: TypeDesc;
}
export interface LoweredField {
    readonly kind: 'field';
    readonly fieldId: FieldExprId;
    readonly type: TypeDesc;
}
export interface LoweredScalar {
    readonly kind: 'scalar';
    readonly value: unknown;
    readonly type: TypeDesc;
}
export interface LoweredDomain {
    readonly kind: 'domain';
    readonly domainId: DomainId;
    readonly count: number;
}
/**
 * Lowered input - resolved input value for a block.
 */
export type LoweredInput = LoweredSignalInput | LoweredFieldInput | LoweredScalarInput | LoweredDomainInput | LoweredUnconnectedInput;
export interface LoweredSignalInput {
    readonly kind: 'signal';
    readonly sigId: SigExprId;
    readonly type: TypeDesc;
    readonly slot?: ValueSlot;
}
export interface LoweredFieldInput {
    readonly kind: 'field';
    readonly fieldId: FieldExprId;
    readonly type: TypeDesc;
}
export interface LoweredScalarInput {
    readonly kind: 'scalar';
    readonly value: unknown;
    readonly type: TypeDesc;
}
export interface LoweredDomainInput {
    readonly kind: 'domain';
    readonly domainId: DomainId;
    readonly count: number;
}
export interface LoweredUnconnectedInput {
    readonly kind: 'unconnected';
    readonly defaultValue?: unknown;
    readonly type: TypeDesc;
}
/**
 * Result of lowering a single block.
 */
export interface LoweredBlock {
    readonly blockId: string;
    readonly blockType: string;
    readonly outputs: ReadonlyMap<string, LoweredOutput>;
    readonly stateReads?: readonly StateId[];
    readonly stateWrites?: readonly StateId[];
}
/**
 * Context for block lowering (legacy interface).
 */
export interface LowerContext {
    readonly builder: IRBuilder;
    readonly resolvedInputs: ReadonlyMap<string, LoweredInput>;
    readonly params: Readonly<Record<string, unknown>>;
}
/**
 * Block lowering function - transforms a block into IR expressions.
 */
export type BlockLowerFn = (ctx: LowerContext) => LoweredBlock;
/**
 * Complete lowered IR - result of the lowering pass.
 */
export interface LoweredIR {
    readonly blocks: ReadonlyMap<string, LoweredBlock>;
    readonly outputs: ReadonlyMap<string, ReadonlyMap<string, LoweredOutput>>;
    readonly domains: ReadonlyMap<DomainId, {
        count: number;
    }>;
}
