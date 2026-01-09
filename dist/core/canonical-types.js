/**
 * Canonical Type System for Oscilla v2.5
 *
 * This module implements the 5-axis type system as specified in:
 * design-docs/spec/CANONICAL-ARCHITECTURE-oscilla-v2.5-20260109-160000.md
 *
 * The type system separates concerns into:
 * - PayloadType: What the value is made of (float, vec2, color, etc.)
 * - Extent: Where/when/about-what a value exists (5 independent axes)
 * - SignalType: Complete type contract (payload + extent)
 *
 * Key design principles:
 * - No optional fields - use discriminated unions (AxisTag pattern)
 * - Runtime erasure - all type info resolved at compile time
 * - Single source of truth - this is the authoritative type system
 */
/**
 * Create a default axis tag.
 */
export function axisDefault() {
    return { kind: 'default' };
}
/**
 * Create an instantiated axis tag.
 */
export function axisInstantiated(value) {
    return { kind: 'instantiated', value };
}
/**
 * Check if an axis tag is instantiated.
 */
export function isInstantiated(tag) {
    return tag.kind === 'instantiated';
}
/**
 * Get the value from an axis tag, or return the default if not instantiated.
 */
export function getAxisValue(tag, defaultValue) {
    return tag.kind === 'instantiated' ? tag.value : defaultValue;
}
/**
 * Create a domain reference.
 */
export function domainRef(id) {
    return { kind: 'domain', id };
}
/**
 * Create a zero cardinality (compile-time constant).
 */
export function cardinalityZero() {
    return { kind: 'zero' };
}
/**
 * Create a one cardinality (single lane).
 */
export function cardinalityOne() {
    return { kind: 'one' };
}
/**
 * Create a many cardinality (N lanes aligned by domain).
 */
export function cardinalityMany(domain) {
    return { kind: 'many', domain };
}
/**
 * Create a continuous temporality.
 */
export function temporalityContinuous() {
    return { kind: 'continuous' };
}
/**
 * Create a discrete temporality (events).
 */
export function temporalityDiscrete() {
    return { kind: 'discrete' };
}
/**
 * Create a referent reference.
 */
export function referentRef(id) {
    return { kind: 'referent', id };
}
/**
 * Create an unbound binding.
 */
export function bindingUnbound() {
    return { kind: 'unbound' };
}
/**
 * Create a weak binding.
 */
export function bindingWeak(referent) {
    return { kind: 'weak', referent };
}
/**
 * Create a strong binding.
 */
export function bindingStrong(referent) {
    return { kind: 'strong', referent };
}
/**
 * Create an identity binding.
 */
export function bindingIdentity(referent) {
    return { kind: 'identity', referent };
}
/**
 * Create an extent with all default axes.
 */
export function extentDefault() {
    return {
        cardinality: axisDefault(),
        temporality: axisDefault(),
        binding: axisDefault(),
        perspective: axisDefault(),
        branch: axisDefault(),
    };
}
/**
 * Create an extent with specified axes (rest default).
 */
export function extent(overrides) {
    return {
        cardinality: overrides.cardinality ?? axisDefault(),
        temporality: overrides.temporality ?? axisDefault(),
        binding: overrides.binding ?? axisDefault(),
        perspective: overrides.perspective ?? axisDefault(),
        branch: overrides.branch ?? axisDefault(),
    };
}
/**
 * Create a SignalType with specified payload and extent.
 */
export function signalType(payload, extentOverrides) {
    return {
        payload,
        extent: extentOverrides ? extent(extentOverrides) : extentDefault(),
    };
}
// =============================================================================
// V0 Canonical Defaults
// =============================================================================
/**
 * V0 canonical default values for each axis.
 *
 * These are used when resolving AxisTag.default during compilation.
 */
export const DEFAULTS_V0 = {
    cardinality: cardinalityOne(),
    temporality: temporalityContinuous(),
    binding: bindingUnbound(),
    perspective: 'global',
    branch: 'main',
};
/**
 * V0 evaluation frame defaults.
 */
export const FRAME_V0 = {
    perspective: 'global',
    branch: 'main',
};
/**
 * Create a fixed-count domain declaration.
 */
export function domainDeclFixedCount(id, count) {
    return { kind: 'domain_decl', id, shape: { kind: 'fixed_count', count } };
}
/**
 * Create a 2D grid domain declaration.
 */
export function domainDeclGrid2d(id, width, height) {
    return { kind: 'domain_decl', id, shape: { kind: 'grid_2d', width, height } };
}
/**
 * Create a voices domain declaration.
 */
export function domainDeclVoices(id, maxVoices) {
    return { kind: 'domain_decl', id, shape: { kind: 'voices', maxVoices } };
}
/**
 * Create a mesh vertices domain declaration.
 */
export function domainDeclMeshVertices(id, assetId) {
    return { kind: 'domain_decl', id, shape: { kind: 'mesh_vertices', assetId } };
}
// =============================================================================
// Axis Unification
// =============================================================================
/**
 * Error indicating axis unification failed.
 */
export class AxisUnificationError extends Error {
    axis;
    valueA;
    valueB;
    constructor(axis, valueA, valueB) {
        super(`Axis unification failed for '${axis}': cannot unify ${JSON.stringify(valueA)} with ${JSON.stringify(valueB)}`);
        this.axis = axis;
        this.valueA = valueA;
        this.valueB = valueB;
        this.name = 'AxisUnificationError';
    }
}
/**
 * Deep equality check for axis values.
 */
function deepEqual(a, b) {
    if (a === b)
        return true;
    if (typeof a !== 'object' || typeof b !== 'object')
        return false;
    if (a === null || b === null)
        return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length)
        return false;
    for (const key of keysA) {
        if (!keysB.includes(key))
            return false;
        if (!deepEqual(a[key], b[key]))
            return false;
    }
    return true;
}
/**
 * Unify two axis tags according to v0 strict join rules.
 *
 * Rules:
 * - default + default → default
 * - default + instantiated(X) → instantiated(X)
 * - instantiated(X) + default → instantiated(X)
 * - instantiated(X) + instantiated(X) → instantiated(X)
 * - instantiated(X) + instantiated(Y), X≠Y → ERROR
 *
 * @param axisName - Name of axis (for error messages)
 * @param a - First axis tag
 * @param b - Second axis tag
 * @returns Unified axis tag
 * @throws AxisUnificationError if values don't match
 */
export function unifyAxis(axisName, a, b) {
    if (a.kind === 'default' && b.kind === 'default') {
        return { kind: 'default' };
    }
    if (a.kind === 'default') {
        return b;
    }
    if (b.kind === 'default') {
        return a;
    }
    // Both instantiated
    if (deepEqual(a.value, b.value)) {
        return a;
    }
    throw new AxisUnificationError(axisName, a.value, b.value);
}
/**
 * Unify two extents according to v0 strict join rules.
 *
 * All 5 axes are unified independently. Any mismatch throws.
 */
export function unifyExtent(a, b) {
    return {
        cardinality: unifyAxis('cardinality', a.cardinality, b.cardinality),
        temporality: unifyAxis('temporality', a.temporality, b.temporality),
        binding: unifyAxis('binding', a.binding, b.binding),
        perspective: unifyAxis('perspective', a.perspective, b.perspective),
        branch: unifyAxis('branch', a.branch, b.branch),
    };
}
// =============================================================================
// Old World → New Axes Helpers
// =============================================================================
/**
 * Convert old "World" concept to new axes.
 *
 * Mapping:
 * - static/scalar → zero + continuous
 * - signal → one + continuous
 * - field(domain) → many(domain) + continuous
 * - event → one|many + discrete
 */
export function worldToAxes(world, domainId) {
    switch (world) {
        case 'static':
        case 'scalar':
            return {
                cardinality: cardinalityZero(),
                temporality: temporalityContinuous(),
            };
        case 'signal':
            return {
                cardinality: cardinalityOne(),
                temporality: temporalityContinuous(),
            };
        case 'field':
            if (!domainId) {
                throw new Error('field world requires domainId');
            }
            return {
                cardinality: cardinalityMany(domainRef(domainId)),
                temporality: temporalityContinuous(),
            };
        case 'event':
            return {
                cardinality: domainId ? cardinalityMany(domainRef(domainId)) : cardinalityOne(),
                temporality: temporalityDiscrete(),
            };
    }
}
// =============================================================================
// Derived Concept Helpers
// =============================================================================
/**
 * Create a Signal SignalType (one + continuous).
 */
export function signalTypeSignal(payload) {
    return signalType(payload, {
        cardinality: axisInstantiated(cardinalityOne()),
        temporality: axisInstantiated(temporalityContinuous()),
    });
}
/**
 * Create a Field SignalType (many(domain) + continuous).
 */
export function signalTypeField(payload, domainId) {
    return signalType(payload, {
        cardinality: axisInstantiated(cardinalityMany(domainRef(domainId))),
        temporality: axisInstantiated(temporalityContinuous()),
    });
}
/**
 * Create a Trigger SignalType (one + discrete).
 */
export function signalTypeTrigger(payload) {
    return signalType(payload, {
        cardinality: axisInstantiated(cardinalityOne()),
        temporality: axisInstantiated(temporalityDiscrete()),
    });
}
/**
 * Create a Static/Scalar SignalType (zero + continuous).
 */
export function signalTypeStatic(payload) {
    return signalType(payload, {
        cardinality: axisInstantiated(cardinalityZero()),
        temporality: axisInstantiated(temporalityContinuous()),
    });
}
/**
 * Create a per-lane Event SignalType (many(domain) + discrete).
 */
export function signalTypePerLaneEvent(payload, domainId) {
    return signalType(payload, {
        cardinality: axisInstantiated(cardinalityMany(domainRef(domainId))),
        temporality: axisInstantiated(temporalityDiscrete()),
    });
}
