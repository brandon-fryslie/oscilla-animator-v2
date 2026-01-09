/**
 * Canonical Types
 *
 * Single canonical type representation used by editor + compiler + IR.
 * This is the authoritative truth - not the TS type checker.
 */
export type World = "signal" | "field" | "event" | "config";
/**
 * Domain = value-level shape.
 * Keep this small and stable. Everything else compiles down to these.
 */
export type Domain = "float" | "bool" | "vec2" | "vec3" | "color" | "trigger" | "domain2d" | "path2d" | "unknown";
/**
 * Type is the single canonical type representation.
 * All "bundle arity" questions belong here, not in ad-hoc logic.
 */
export interface Type {
    readonly world: World;
    readonly domain: Domain;
    /**
     * Only valid when world === "field".
     * DomainRef is "how many elements / iteration domain".
     * Could be explicit slot-handle types later; keep opaque for now.
     */
    readonly fieldDomain?: FieldDomainRef;
    /**
     * A few flags that are genuinely useful in compilation decisions.
     * Keep minimal. Prefer constraints/typeclasses for semantics.
     */
    readonly flags?: {
        readonly busEligible?: boolean;
    };
}
export type FieldDomainRef = {
    kind: "bySlot";
    slot: number;
} | {
    kind: "fixedCount";
    n: number;
} | {
    kind: "unknown";
};
/**
 * Construct a Type with validation.
 */
export declare function t(world: World, domain: Domain, fieldDomain?: FieldDomainRef): Type;
export declare function isFieldType(ty: Type): boolean;
export declare function eqType(a: Type, b: Type): boolean;
/**
 * Format a type for display/debugging.
 */
export declare function fmtType(ty: Type): string;
/**
 * Get the arity (number of scalar components) for a domain.
 */
export declare function getDomainArity(domain: Domain): number;
/**
 * Get total arity for a Type.
 */
export declare function getTypeArity(ty: Type): number;
export declare function sigType(domain: Domain): Type;
export declare function fieldType(domain: Domain, fieldDomain?: FieldDomainRef): Type;
export declare function eventType(domain?: Domain): Type;
export declare function configType(domain: Domain): Type;
