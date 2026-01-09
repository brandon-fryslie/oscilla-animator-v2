/**
 * Canonical Types
 *
 * Single canonical type representation used by editor + compiler + IR.
 * This is the authoritative truth - not the TS type checker.
 */
/**
 * Construct a Type with validation.
 */
export function t(world, domain, fieldDomain) {
    if (world === "field" && !fieldDomain) {
        // compiler may temporarily construct unknown fieldDomain; make it explicit
        return { world, domain, fieldDomain: { kind: "unknown" } };
    }
    if (world !== "field" && fieldDomain) {
        throw new Error(`Type: fieldDomain only allowed for world=field`);
    }
    return { world, domain, fieldDomain };
}
export function isFieldType(ty) {
    return ty.world === "field";
}
export function eqType(a, b) {
    return a.world === b.world && a.domain === b.domain;
}
/**
 * Format a type for display/debugging.
 */
export function fmtType(ty) {
    return `${ty.world}<${ty.domain}>`;
}
// =============================================================================
// Type Utilities for compatibility with existing codebase
// =============================================================================
/**
 * Get the arity (number of scalar components) for a domain.
 */
export function getDomainArity(domain) {
    switch (domain) {
        case "float":
        case "bool":
        case "trigger":
            return 1;
        case "vec2":
        case "domain2d":
            return 2;
        case "vec3":
            return 3;
        case "color":
            return 4; // RGBA
        case "path2d":
        case "unknown":
            return 1; // Placeholder
    }
}
/**
 * Get total arity for a Type.
 */
export function getTypeArity(ty) {
    return getDomainArity(ty.domain);
}
// =============================================================================
// Convenience constructors
// =============================================================================
export function sigType(domain) {
    return t("signal", domain);
}
export function fieldType(domain, fieldDomain) {
    return t("field", domain, fieldDomain);
}
export function eventType(domain = "trigger") {
    return t("event", domain);
}
export function configType(domain) {
    return t("config", domain);
}
