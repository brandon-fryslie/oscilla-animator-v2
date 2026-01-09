/**
 * The "One True" Pipeline: infer -> solve -> finalize -> lower
 *
 * This module provides the entry point for compiling block instances
 * from generic signatures to concrete, monomorphized types.
 */
import type { BlockSig, BlockInstanceTypes } from "./blockSig";
import type { Constraint, TypeError } from "./constraints";
import type { Type } from "./types";
export interface PortBinding {
    readonly port: string;
    readonly inferredTy?: Type;
}
export interface InferResult {
    readonly instanceTypes: BlockInstanceTypes | null;
    readonly errors: TypeError[];
    readonly rawConstraints: readonly Constraint[];
}
export declare function inferBlockInstance(sig: BlockSig, bindings: readonly PortBinding[]): InferResult;
/**
 * Compile a block instance with full error context.
 */
export interface CompileBlockResult {
    readonly ok: boolean;
    readonly instanceTypes?: BlockInstanceTypes;
    readonly errors: TypeError[];
    readonly rawConstraints: readonly Constraint[];
}
export declare function compileBlockInstance(sig: BlockSig, bindings: readonly PortBinding[], nodeId?: string): CompileBlockResult;
