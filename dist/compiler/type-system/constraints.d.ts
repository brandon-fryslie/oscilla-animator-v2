/**
 * Type Variables + Constraints
 *
 * This is the "real" system: typevars, typeclasses, and constraints.
 */
import type { Type, World, Domain } from "./types";
export type TypeVarId = number;
export interface TypeVar {
    readonly id: TypeVarId;
    readonly name?: string;
}
/**
 * Ty represents either a concrete type or a type variable.
 */
export type Ty = {
    kind: "concrete";
    ty: Type;
} | {
    kind: "var";
    v: TypeVar;
};
/**
 * Constraints are solved to fully concrete Types by finalize().
 */
export type Constraint = {
    kind: "Eq";
    a: Ty;
    b: Ty;
} | {
    kind: "HasWorld";
    a: Ty;
    world: World;
} | {
    kind: "HasDomain";
    a: Ty;
    domain: Domain;
} | {
    kind: "InDomains";
    a: Ty;
    domains: readonly Domain[];
} | {
    kind: "InWorlds";
    a: Ty;
    worlds: readonly World[];
} | {
    kind: "Typeclass";
    a: Ty;
    cls: TypeclassName;
} | {
    kind: "SameWorld";
    a: Ty;
    b: Ty;
} | {
    kind: "SameDomain";
    a: Ty;
    b: Ty;
} | {
    kind: "Promote";
    out: Ty;
    a: Ty;
    b: Ty;
    rule: PromoteRule;
};
/**
 * Typeclasses are where your "category/algebra" semantics live.
 */
export type TypeclassName = "Numeric" | "Comparable" | "Mixable" | "Combineable" | "Mappable" | "ZipWithable";
export type PromoteRule = "SignalField" | "SameWorld" | "EventNone";
export interface TypeError {
    readonly message: string;
    readonly detail?: Record<string, unknown>;
    readonly blame?: {
        readonly nodeId?: string;
        readonly port?: string;
        readonly edgeId?: string;
    };
}
/**
 * Create a concrete Ty from a Type.
 */
export declare function concrete(ty: Type): Ty;
/**
 * Create a variable Ty from a TypeVar.
 */
export declare function tyVar(v: TypeVar): Ty;
export declare function eq(a: Ty, b: Ty): Constraint;
export declare function hasWorld(a: Ty, world: World): Constraint;
export declare function hasDomain(a: Ty, domain: Domain): Constraint;
export declare function inDomains(a: Ty, domains: readonly Domain[]): Constraint;
export declare function inWorlds(a: Ty, worlds: readonly World[]): Constraint;
export declare function typeclass(a: Ty, cls: TypeclassName): Constraint;
export declare function sameWorld(a: Ty, b: Ty): Constraint;
export declare function sameDomain(a: Ty, b: Ty): Constraint;
export declare function promote(out: Ty, a: Ty, b: Ty, rule: PromoteRule): Constraint;
