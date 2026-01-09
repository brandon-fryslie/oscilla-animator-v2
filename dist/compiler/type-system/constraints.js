/**
 * Type Variables + Constraints
 *
 * This is the "real" system: typevars, typeclasses, and constraints.
 */
// =============================================================================
// Ty Constructors
// =============================================================================
/**
 * Create a concrete Ty from a Type.
 */
export function concrete(ty) {
    return { kind: "concrete", ty };
}
/**
 * Create a variable Ty from a TypeVar.
 */
export function tyVar(v) {
    return { kind: "var", v };
}
// =============================================================================
// Constraint Constructors
// =============================================================================
export function eq(a, b) {
    return { kind: "Eq", a, b };
}
export function hasWorld(a, world) {
    return { kind: "HasWorld", a, world };
}
export function hasDomain(a, domain) {
    return { kind: "HasDomain", a, domain };
}
export function inDomains(a, domains) {
    return { kind: "InDomains", a, domains };
}
export function inWorlds(a, worlds) {
    return { kind: "InWorlds", a, worlds };
}
export function typeclass(a, cls) {
    return { kind: "Typeclass", a, cls };
}
export function sameWorld(a, b) {
    return { kind: "SameWorld", a, b };
}
export function sameDomain(a, b) {
    return { kind: "SameDomain", a, b };
}
export function promote(out, a, b, rule) {
    return { kind: "Promote", out, a, b, rule };
}
