/**
 * ConstValue — Strongly-Typed Constant Values (Invariant I5)
 *
 * INVARIANT I5: ConstValue.kind MUST match CanonicalType.payload.kind
 */

import type { CameraProjection, PayloadType } from './payloads';

// =============================================================================
// ConstValue
// =============================================================================

/**
 * Strongly-typed constant value representation.
 *
 * Tuple values are readonly to prevent mutation and maintain
 * CanonicalType immutability contract.
 *
 * @see constValueMatchesPayload for validation helper
 */
export type ConstValue =
  | { readonly kind: 'float'; readonly value: number }
  | { readonly kind: 'int'; readonly value: number }
  | { readonly kind: 'bool'; readonly value: boolean }
  | { readonly kind: 'vec2'; readonly value: readonly [number, number] }
  | { readonly kind: 'vec3'; readonly value: readonly [number, number, number] }
  | { readonly kind: 'color'; readonly value: readonly [number, number, number, number] }
  | { readonly kind: 'cameraProjection'; readonly value: CameraProjection };

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate that ConstValue.kind matches PayloadType.kind.
 * Used by axis enforcement pass to catch payload mismatches at runtime.
 */
export function constValueMatchesPayload(
  payload: PayloadType,
  constValue: ConstValue
): boolean {
  return payload.kind === constValue.kind;
}

// =============================================================================
// Constructors
// =============================================================================

/** Create a float constant value. */
export function floatConst(value: number): ConstValue {
  return { kind: 'float', value };
}

/** Create an int constant value. */
export function intConst(value: number): ConstValue {
  return { kind: 'int', value };
}

/** Create a bool constant value. */
export function boolConst(value: boolean): ConstValue {
  return { kind: 'bool', value };
}

/** Create a vec2 constant value. */
export function vec2Const(x: number, y: number): ConstValue {
  return { kind: 'vec2', value: [x, y] as const };
}

/** Create a vec3 constant value. */
export function vec3Const(x: number, y: number, z: number): ConstValue {
  return { kind: 'vec3', value: [x, y, z] as const };
}

/** Create a color constant value (RGBA). */
export function colorConst(r: number, g: number, b: number, a: number): ConstValue {
  return { kind: 'color', value: [r, g, b, a] as const };
}

/** Create a camera projection constant value. */
export function cameraProjectionConst(value: CameraProjection): ConstValue {
  return { kind: 'cameraProjection', value };
}

// =============================================================================
// Extractors
// =============================================================================

/**
 * Extract a scalar number from a ConstValue.
 * Works for float, int, bool (as 0|1).
 * Throws for vec2, vec3, color, and cameraProjection.
 */
export function constValueAsNumber(cv: ConstValue): number {
  switch (cv.kind) {
    case 'float':
    case 'int':
      return cv.value;
    case 'bool':
      return cv.value ? 1 : 0;
    case 'cameraProjection':
      throw new Error(`Cannot convert cameraProjection const value to number: ${cv.value}`);
    case 'vec2':
    case 'vec3':
    case 'color':
      throw new Error(`Cannot convert ${cv.kind} const value to scalar number (use component access instead)`);
    default: {
      const _exhaustive: never = cv;
      throw new Error(`Unknown ConstValue kind: ${(_exhaustive as ConstValue).kind}`);
    }
  }
}

/**
 * Extract a boolean from a ConstValue.
 * Only works for bool kind. Throws for other kinds.
 */
export function constValueAsBool(cv: ConstValue): boolean {
  if (cv.kind !== 'bool') {
    throw new Error(`Expected bool ConstValue, got: ${cv.kind}`);
  }
  return cv.value;
}
