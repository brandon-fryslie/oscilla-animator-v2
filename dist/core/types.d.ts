/**
 * Core Types for Oscilla
 *
 * This module defines the unified type system used throughout the application.
 * It establishes the type contracts between editor, compiler, and runtime.
 */
/** Time in seconds (wall clock). */
export type Time = number;
/** Normalized progress in [0, 1]. */
export type Unit = number;
/** PRNG seed for reproducible randomness. */
export type Seed = number;
/** 2D point/vector. */
export type Point = {
    readonly x: number;
    readonly y: number;
};
/** Vec2 alias for Point. */
export type Vec2 = Point;
/** Duration in seconds. */
export type Duration = number;
/** Stable identity for render nodes. */
export type Id = string;
/**
 * Top-level categorization of values in the Oscilla system.
 *
 * - `signal`: Time-varying values (functions of time, evaluated per-frame)
 * - `event`: Discrete event streams (sparse, edge-triggered)
 * - `field`: Domain-varying values (per-element lazy expressions)
 * - `scalar`: Compile-time constants (immediate values)
 * - `config`: Configuration values (not runtime-evaluated, used for setup)
 * - `special`: Resource references (not values, but typed IDs/handles)
 */
export type TypeWorld = 'signal' | 'event' | 'field' | 'scalar' | 'config' | 'special';
/**
 * Core domains - user-facing types in the bus system.
 * These are the learnable creative vocabulary.
 */
export type CoreDomain = 'float' | 'int' | 'vec2' | 'vec3' | 'color' | 'boolean' | 'time' | 'rate' | 'trigger';
/**
 * Internal domains - engine types not directly exposed to users.
 */
export type InternalDomain = 'point' | 'duration' | 'hsl' | 'path' | 'expression' | 'waveform' | 'phaseSample' | 'phaseMachine' | 'program' | 'renderTree' | 'renderNode' | 'filterDef' | 'strokeStyle' | 'elementCount' | 'scene' | 'event' | 'string' | 'bounds' | 'spec' | 'domain' | 'cameraRef' | 'vec4' | 'quat' | 'mat4' | 'timeMs' | 'renderCmds' | 'mesh' | 'camera' | 'matBuffer' | 'renderFrame' | 'unknown';
/**
 * All domains (core + internal).
 */
export type Domain = CoreDomain | InternalDomain;
/**
 * Category for type filtering.
 * - 'core': User-facing types (appear in bus system, UI)
 * - 'internal': Engine types (internal plumbing, not user-visible)
 */
export type TypeCategory = 'core' | 'internal';
/**
 * Unified type descriptor for values across editor and compiler.
 *
 * TypeDesc is the single authoritative type contract used throughout Oscilla.
 */
export interface TypeDesc {
    /** Top-level world classification (evaluation timing) */
    readonly world: TypeWorld;
    /** Domain-specific type (semantic meaning) */
    readonly domain: Domain;
    /** Category: core (user-facing) or internal (engine) */
    readonly category: TypeCategory;
    /** Whether this type can be used for buses */
    readonly busEligible: boolean;
    /**
     * Bundle shape - array of lane counts describing multi-component structure.
     *
     * Examples:
     * - Scalar: undefined or [1] (single value)
     * - Vec2: [2] (x, y components)
     * - Vec3: [3] (x, y, z components)
     * - RGBA: [4] (r, g, b, a components)
     * - Mat4: [16] (4x4 matrix as 16 components)
     */
    readonly lanes?: number[];
    /** Optional semantic annotation */
    readonly semantics?: string;
    /** Optional unit annotation */
    readonly unit?: string;
}
/**
 * Get the total number of scalar slots required for a TypeDesc.
 */
export declare function getTypeArity(type: TypeDesc): number;
/**
 * Infer bundle lanes from domain.
 */
export declare function inferBundleLanes(domain: Domain): number[] | undefined;
/**
 * Create a TypeDesc with automatic bundle inference.
 * Supports both positional and object-form arguments.
 */
export declare function createTypeDesc(worldOrOptions: TypeWorld | {
    world: TypeWorld;
    domain: Domain;
    category?: TypeCategory;
    busEligible?: boolean;
}, domain?: Domain, category?: TypeCategory, busEligible?: boolean, options?: {
    semantics?: string;
    unit?: string;
    lanes?: number[];
}): TypeDesc;
/**
 * Create a signal TypeDesc with default settings.
 */
export declare function sigType(domain: Domain): TypeDesc;
/**
 * Create a field TypeDesc with default settings.
 */
export declare function fieldType(domain: Domain): TypeDesc;
/**
 * Create a scalar TypeDesc with default settings.
 */
export declare function scalarType(domain: Domain): TypeDesc;
/**
 * Create an event TypeDesc with default settings.
 */
export declare function eventType(domain?: Domain): TypeDesc;
export declare const Vec2Utils: {
    of: (x: number, y: number) => Vec2;
    zero: Vec2;
    add: (a: Vec2, b: Vec2) => Vec2;
    sub: (a: Vec2, b: Vec2) => Vec2;
    scale: (v: Vec2, s: number) => Vec2;
    lerp: (a: Vec2, b: Vec2, t: number) => Vec2;
    dot: (a: Vec2, b: Vec2) => number;
    length: (v: Vec2) => number;
    normalize: (v: Vec2) => Vec2;
    distance: (a: Vec2, b: Vec2) => number;
};
