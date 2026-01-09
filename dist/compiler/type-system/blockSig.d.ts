/**
 * Generic Block Spec + Constraint Emission
 *
 * This is how you define "polymorphic blocks" without runtime polymorphism:
 * each block emits constraints, then gets monomorphized.
 */
import type { Type } from "./types";
import type { TypeContext } from "./solver";
import type { Ty, Constraint } from "./constraints";
export type PortName = string;
export interface BlockTypeEnv {
    readonly tc: TypeContext;
    /** nodeId for blame; optional but useful */
    readonly nodeId?: string;
}
export interface BlockSig {
    readonly name: string;
    /** Ports are typed by Ty (var or concrete) plus constraints. */
    buildTypes(env: BlockTypeEnv): {
        readonly inputs: Record<PortName, Ty>;
        readonly outputs: Record<PortName, Ty>;
        readonly constraints: readonly Constraint[];
    };
}
/**
 * A concrete, post-solve instantiation of a BlockSig for lowering.
 * Every port is now a concrete Type, no vars.
 */
export interface BlockInstanceTypes {
    readonly inputs: Record<PortName, Type>;
    readonly outputs: Record<PortName, Type>;
}
/**
 * Registry of block signatures by name.
 */
export declare class BlockSigRegistry {
    private readonly sigs;
    register(sig: BlockSig): void;
    get(name: string): BlockSig | undefined;
    has(name: string): boolean;
    all(): IterableIterator<BlockSig>;
}
/**
 * Global block signature registry.
 */
export declare const blockSigRegistry: BlockSigRegistry;
