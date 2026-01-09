/**
 * Core Types for Oscilla
 *
 * This module defines the unified type system used throughout the application.
 * It establishes the type contracts between editor, compiler, and runtime.
 */

// =============================================================================
// Primitives
// =============================================================================

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

// =============================================================================
// Type Worlds
// =============================================================================

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

// =============================================================================
// Type Domains
// =============================================================================

/**
 * Core domains - user-facing types in the bus system.
 * These are the learnable creative vocabulary.
 */
export type CoreDomain =
  | 'float'    // Floating-point values
  | 'int'      // Integer values
  | 'vec2'     // 2D positions/vectors
  | 'vec3'     // 3D positions/vectors
  | 'color'    // Color values
  | 'boolean'  // True/false values
  | 'time'     // Time values (always in seconds)
  | 'rate'     // Rate/multiplier values
  | 'trigger'; // Pulse/event signals

/**
 * Internal domains - engine types not directly exposed to users.
 */
export type InternalDomain =
  | 'point'        // Point semantics
  | 'duration'     // Duration semantics
  | 'hsl'          // HSL color space
  | 'path'         // Path data
  | 'expression'   // DSL expression source
  | 'waveform'     // Oscillator waveform selector
  | 'phaseSample'  // PhaseMachine sample payload
  | 'phaseMachine' // PhaseMachine instance payload
  | 'program'      // Compiled program
  | 'renderTree'   // Render tree output
  | 'renderNode'   // Single render node
  | 'filterDef'    // SVG filter definition
  | 'strokeStyle'  // Stroke configuration
  | 'elementCount' // Number of elements
  | 'scene'        // Scene data
  | 'event'        // Generic events
  | 'string'       // String values
  | 'bounds'       // Bounding box
  | 'spec'         // Spec types
  | 'domain'       // Element identity handle
  | 'cameraRef'    // Camera resource reference
  | 'vec4'         // 4D vector
  | 'quat'         // Quaternion for 3D rotations
  | 'mat4'         // 4x4 transformation matrix
  | 'timeMs'       // Time in milliseconds
  | 'renderCmds'   // Render commands
  | 'mesh'         // 3D mesh
  | 'camera'       // Camera
  | 'matBuffer'    // Materialization buffer
  | 'renderFrame'  // Render frame output
  | 'unknown';     // Unknown type

/**
 * All domains (core + internal).
 */
export type Domain = CoreDomain | InternalDomain;

// =============================================================================
// Type Categories
// =============================================================================

/**
 * Category for type filtering.
 * - 'core': User-facing types (appear in bus system, UI)
 * - 'internal': Engine types (internal plumbing, not user-visible)
 */
export type TypeCategory = 'core' | 'internal';

// =============================================================================
// Type Descriptor
// =============================================================================

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

// =============================================================================
// Type Utilities
// =============================================================================

/**
 * Get the total number of scalar slots required for a TypeDesc.
 */
export function getTypeArity(type: TypeDesc): number {
  if (!type.lanes || type.lanes.length === 0) {
    return 1;
  }
  return type.lanes.reduce((sum, count) => sum + count, 0);
}

/**
 * Infer bundle lanes from domain.
 */
export function inferBundleLanes(domain: Domain): number[] | undefined {
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
export function createTypeDesc(
  worldOrOptions: TypeWorld | { world: TypeWorld; domain: Domain; category?: TypeCategory; busEligible?: boolean },
  domain?: Domain,
  category?: TypeCategory,
  busEligible?: boolean,
  options?: {
    semantics?: string;
    unit?: string;
    lanes?: number[];
  }
): TypeDesc {
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
  const actualDomain = domain!;
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
export function sigType(domain: Domain): TypeDesc {
  return createTypeDesc('signal', domain, 'core', true);
}

/**
 * Create a field TypeDesc with default settings.
 */
export function fieldType(domain: Domain): TypeDesc {
  return createTypeDesc('field', domain, 'core', true);
}

/**
 * Create a scalar TypeDesc with default settings.
 */
export function scalarType(domain: Domain): TypeDesc {
  return createTypeDesc('scalar', domain, 'core', true);
}

/**
 * Create an event TypeDesc with default settings.
 */
export function eventType(domain: Domain = 'float'): TypeDesc {
  return createTypeDesc('event', domain, 'core', true);
}

// =============================================================================
// Vec2 Utilities
// =============================================================================

export const Vec2Utils = {
  of: (x: number, y: number): Vec2 => ({ x, y }),
  zero: { x: 0, y: 0 } as Vec2,
  add: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y }),
  scale: (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s }),
  lerp: (a: Vec2, b: Vec2, t: number): Vec2 => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }),
  dot: (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y,
  length: (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y),
  normalize: (v: Vec2): Vec2 => {
    const len = Vec2Utils.length(v);
    return len > 0 ? Vec2Utils.scale(v, 1 / len) : Vec2Utils.zero;
  },
  distance: (a: Vec2, b: Vec2): number => Vec2Utils.length(Vec2Utils.sub(b, a)),
};
