/**
 * Core Types for Oscilla
 *
 * This module defines primitive types and utilities used throughout the application.
 * The type system has been migrated to SignalType in canonical-types.ts.
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
