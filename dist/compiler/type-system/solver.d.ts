/**
 * Solver (Unification + Constraint Checking + Promotion)
 *
 * This is a working skeleton: it can unify types, enforce typeclasses,
 * and apply promotion rules to pick concrete worlds/domains.
 */
import type { Type } from "./types";
import type { Ty, TypeVar, TypeVarId, Constraint, TypeError } from "./constraints";
type Subst = Map<TypeVarId, Type>;
export interface SolveResult {
    readonly subst: Subst;
    readonly errors: TypeError[];
}
export declare class TypeContext {
    private nextVarId;
    freshVar(name?: string): TypeVar;
}
export declare function solve(constraints: readonly Constraint[]): SolveResult;
export declare function finalizeType(subst: Subst, x: Ty): Type | null;
/**
 * Get the substitution as a readonly map.
 */
export declare function getSubstitution(result: SolveResult): ReadonlyMap<TypeVarId, Type>;
export {};
