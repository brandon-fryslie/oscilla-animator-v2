/**
 * Core Types for Oscilla
 *
 * This module defines the unified type system used throughout the application.
 * It establishes the type contracts between editor, compiler, and runtime.
 */
// =============================================================================
// Type Utilities
// =============================================================================
/**
 * Get the total number of scalar slots required for a TypeDesc.
 */
export function getTypeArity(type) {
    if (!type.lanes || type.lanes.length === 0) {
        return 1;
    }
    return type.lanes.reduce((sum, count) => sum + count, 0);
}
/**
 * Infer bundle lanes from domain.
 */
export function inferBundleLanes(domain) {
    switch (domain) {
        case 'vec2':
            return [2];
        case 'vec3':
            return [3];
        case 'vec4':
            return [4];
        case 'quat':
            return [4];
        case 'mat4':
            return [16];
        case 'color':
            return [4]; // RGBA
        default:
            return undefined;
    }
}
/**
 * Create a TypeDesc with automatic bundle inference.
 * Supports both positional and object-form arguments.
 */
export function createTypeDesc(worldOrOptions, domain, category, busEligible, options) {
    // Handle object-form argument
    if (typeof worldOrOptions === 'object') {
        const { world, domain: d, category: c = 'core', busEligible: b = true } = worldOrOptions;
        const lanes = inferBundleLanes(d);
        return {
            world,
            domain: d,
            category: c,
            busEligible: b,
            lanes,
        };
    }
    // Handle positional arguments
    const world = worldOrOptions;
    const actualDomain = domain;
    const actualCategory = category ?? 'core';
    const actualBusEligible = busEligible ?? true;
    const lanes = options?.lanes ?? inferBundleLanes(actualDomain);
    return {
        world,
        domain: actualDomain,
        category: actualCategory,
        busEligible: actualBusEligible,
        lanes,
        semantics: options?.semantics,
        unit: options?.unit,
    };
}
// =============================================================================
// Simple Type Constructors
// =============================================================================
/**
 * Create a signal TypeDesc with default settings.
 */
export function sigType(domain) {
    return createTypeDesc('signal', domain, 'core', true);
}
/**
 * Create a field TypeDesc with default settings.
 */
export function fieldType(domain) {
    return createTypeDesc('field', domain, 'core', true);
}
/**
 * Create a scalar TypeDesc with default settings.
 */
export function scalarType(domain) {
    return createTypeDesc('scalar', domain, 'core', true);
}
/**
 * Create an event TypeDesc with default settings.
 */
export function eventType(domain = 'float') {
    return createTypeDesc('event', domain, 'core', true);
}
// =============================================================================
// Vec2 Utilities
// =============================================================================
export const Vec2Utils = {
    of: (x, y) => ({ x, y }),
    zero: { x: 0, y: 0 },
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
    scale: (v, s) => ({ x: v.x * s, y: v.y * s }),
    lerp: (a, b, t) => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
    }),
    dot: (a, b) => a.x * b.x + a.y * b.y,
    length: (v) => Math.sqrt(v.x * v.x + v.y * v.y),
    normalize: (v) => {
        const len = Vec2Utils.length(v);
        return len > 0 ? Vec2Utils.scale(v, 1 / len) : Vec2Utils.zero;
    },
    distance: (a, b) => Vec2Utils.length(Vec2Utils.sub(b, a)),
};
