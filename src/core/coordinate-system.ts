/**
 * Canonical Coordinate System Contract
 *
 * Shared coordinate-space constants and conversion helpers used across
 * projection, runtime camera resolution, and renderer assembly boundaries.
 */

/**
 * Degrees-to-radians conversion constant.
 * // [LAW:one-source-of-truth] Angle conversion is centralized here.
 */
export const DEGREES_TO_RADIANS = Math.PI / 180;

/**
 * Canonical world-space center used by default camera targeting.
 */
export const CANONICAL_WORLD_CENTER_X = 0.5;
export const CANONICAL_WORLD_CENTER_Y = 0.5;

/**
 * Canonical world-space camera target z-plane for 2.5D rendering.
 */
export const CANONICAL_CAMERA_WORLD_TARGET_Z = 0.0;

/**
 * Canonical camera up vector.
 */
export const CANONICAL_CAMERA_UP = Object.freeze({
  x: 0.0,
  y: 1.0,
  z: 0.0,
} as const);

/**
 * Clip-space and normalized screen-space bounds.
 */
export const CLIP_SPACE_MIN = -1.0;
export const CLIP_SPACE_MAX = 1.0;
export const NORMALIZED_SCREEN_MIN = 0.0;
export const NORMALIZED_SCREEN_MAX = 1.0;

/**
 * Linear clip<->screen mapping coefficients.
 * screen = clip * SCALE + OFFSET
 */
export const CLIP_TO_NORMALIZED_SCALE = 0.5;
export const CLIP_TO_NORMALIZED_OFFSET = 0.5;

/**
 * Convert clip-space scalar [-1,1] to normalized screen scalar [0,1].
 */
export function clipToNormalizedScreen(clipValue: number): number {
  return clipValue * CLIP_TO_NORMALIZED_SCALE + CLIP_TO_NORMALIZED_OFFSET;
}

/**
 * Convert normalized screen scalar [0,1] to clip-space scalar [-1,1].
 */
export function normalizedScreenToClip(normalizedValue: number): number {
  return (normalizedValue - CLIP_TO_NORMALIZED_OFFSET) / CLIP_TO_NORMALIZED_SCALE;
}
