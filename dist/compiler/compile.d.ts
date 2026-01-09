/**
 * Main Compiler Entry Point
 *
 * Compiles a Patch into an IRProgram through a series of passes:
 * 1. Normalize - Dense indices, canonical ordering
 * 2. TypeCheck - Validate connections
 * 3. TimeResolve - Find TimeRoot, extract TimeModel
 * 4. DepGraph - Build dependency graph
 * 5. Validate - Check for cycles
 * 6. Lower - Lower blocks to IR
 * 7. Link - Resolve connections
 */
import type { Patch } from '../graph';
import type { IRProgram } from './ir';
export interface CompileError {
    readonly kind: string;
    readonly message: string;
    readonly blockId?: string;
    readonly portId?: string;
}
export interface CompileResult {
    readonly kind: 'ok';
    readonly program: IRProgram;
}
export interface CompileFailure {
    readonly kind: 'error';
    readonly errors: readonly CompileError[];
}
export declare function compile(patch: Patch): CompileResult | CompileFailure;
