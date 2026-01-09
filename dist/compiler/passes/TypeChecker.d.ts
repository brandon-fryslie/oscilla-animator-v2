/**
 * Type Checker Pass - SINGLE ENFORCER for type compatibility
 *
 * Validates all connections are type-compatible before lowering.
 * Catches type mismatches at compile time instead of runtime.
 *
 * Adheres to architectural law: SINGLE ENFORCER
 */
import type { NormalizedPatch } from '../../graph/normalize';
/**
 * Compile error type for type checking
 */
export interface TypeCheckError {
    kind: 'TypeMismatch' | 'UnknownPort' | 'MissingRequiredInput';
    message: string;
    blockId: string;
    portId?: string;
}
/**
 * Check all edge connections for type compatibility
 *
 * @param patch - Normalized patch with blocks and edges
 * @returns Array of type check errors (empty if valid)
 */
export declare function checkTypes(patch: NormalizedPatch): TypeCheckError[];
