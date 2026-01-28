/**
 * Swizzle and Component Access Utilities for Expression DSL
 *
 * GLSL-style component access patterns:
 * - Position: x, y, z (vec3)
 * - Color: r, g, b, a (color)
 * - Cross-access: x=r, y=g, z=b, w=a
 *
 * Component access allows extraction of individual components from vector types:
 * - vec3.x → float (extract X component)
 * - color.rgb → vec3 (extract RGB as vec3)
 * - vec3.xy → vec2 (extract XY as vec2)
 *
 * Swizzling allows arbitrary reordering:
 * - vec3.zyx → vec3 (reverse order)
 * - color.bgra → color (blue-green-red-alpha)
 */

import { FLOAT, VEC2, VEC3, COLOR, type PayloadType } from '../core/canonical-types';

/** Position component set (vec3) */
export const POSITION_COMPONENTS = ['x', 'y', 'z'] as const;

/** Color component set (rgba) */
export const COLOR_COMPONENTS = ['r', 'g', 'b', 'a'] as const;

/** All valid component characters */
export const ALL_COMPONENTS = ['x', 'y', 'z', 'w', 'r', 'g', 'b', 'a'] as const;

/**
 * Map component character to index.
 * Cross-access: x=r=0, y=g=1, z=b=2, w=a=3
 */
export function componentIndex(char: string): number {
  switch (char) {
    case 'x': case 'r': return 0;
    case 'y': case 'g': return 1;
    case 'z': case 'b': return 2;
    case 'w': case 'a': return 3;
    default: return -1;
  }
}

/** Check if payload type supports component access */
export function isVectorType(payload: PayloadType): boolean {
  if (payload.kind === 'var') return false;
  return payload.kind === 'vec2' || payload.kind === 'vec3' || payload.kind === 'color';
}

/** Get max component count for a vector type */
export function vectorComponentCount(payload: PayloadType): number {
  if (payload.kind === 'var') return 0;
  switch (payload.kind) {
    case 'vec2': return 2;
    case 'vec3': return 3;
    case 'color': return 4;
    default: return 0;
  }
}

/**
 * Validate a swizzle pattern against a source type.
 * @returns Error message if invalid, undefined if valid
 */
export function validateSwizzle(pattern: string, sourceType: PayloadType): string | undefined {
  if (pattern.length === 0) {
    return 'Empty swizzle pattern';
  }
  if (pattern.length > 4) {
    return `Swizzle pattern too long: '${pattern}' (max 4 components)`;
  }

  const maxIndex = vectorComponentCount(sourceType) - 1;
  if (maxIndex < 0) {
    return `Type '${sourceType.kind}' does not support component access`;
  }

  for (const char of pattern) {
    const idx = componentIndex(char);
    if (idx < 0) {
      return `Invalid component '${char}' in swizzle pattern`;
    }
    if (idx > maxIndex) {
      return `${sourceType.kind} has no component '${char}' (max index is ${maxIndex})`;
    }
  }

  return undefined; // Valid
}

/**
 * Compute the result type of a swizzle operation.
 * Assumes pattern is valid (call validateSwizzle first).
 */
export function swizzleResultType(pattern: string): PayloadType {
  switch (pattern.length) {
    case 1: return FLOAT;
    case 2: return VEC2;
    case 3: return VEC3;
    case 4: return COLOR;
    default: throw new Error(`Invalid swizzle length: ${pattern.length}`);
  }
}

/**
 * Check if a swizzle pattern is valid for a given source type.
 */
export function isValidSwizzle(pattern: string, sourceType: PayloadType): boolean {
  return validateSwizzle(pattern, sourceType) === undefined;
}
