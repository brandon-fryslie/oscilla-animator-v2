import { describe, expect, it } from 'vitest';
import {
  CANONICAL_CAMERA_UP,
  CANONICAL_CAMERA_WORLD_TARGET_Z,
  CANONICAL_WORLD_CENTER_X,
  CANONICAL_WORLD_CENTER_Y,
  CLIP_SPACE_MAX,
  CLIP_SPACE_MIN,
  DEGREES_TO_RADIANS,
  NORMALIZED_SCREEN_MAX,
  NORMALIZED_SCREEN_MIN,
  clipToNormalizedScreen,
  normalizedScreenToClip,
} from '../coordinate-system';

describe('Coordinate system contract', () => {
  it('maps clip bounds to normalized screen bounds', () => {
    expect(clipToNormalizedScreen(CLIP_SPACE_MIN)).toBe(NORMALIZED_SCREEN_MIN);
    expect(clipToNormalizedScreen(CLIP_SPACE_MAX)).toBe(NORMALIZED_SCREEN_MAX);
    expect(clipToNormalizedScreen(0)).toBe(0.5);
  });

  it('maps normalized screen bounds back to clip bounds', () => {
    expect(normalizedScreenToClip(NORMALIZED_SCREEN_MIN)).toBe(CLIP_SPACE_MIN);
    expect(normalizedScreenToClip(NORMALIZED_SCREEN_MAX)).toBe(CLIP_SPACE_MAX);
    expect(normalizedScreenToClip(0.5)).toBe(0);
  });

  it('clip/screen conversions are reciprocal for representative values', () => {
    const clipValues = [-1, -0.25, 0, 0.3, 1];
    for (const clip of clipValues) {
      expect(normalizedScreenToClip(clipToNormalizedScreen(clip))).toBeCloseTo(clip, 12);
    }
  });

  it('exposes canonical camera axes and center constants', () => {
    expect(CANONICAL_WORLD_CENTER_X).toBe(0);
    expect(CANONICAL_WORLD_CENTER_Y).toBe(0);
    expect(CANONICAL_CAMERA_WORLD_TARGET_Z).toBe(0);
    expect(CANONICAL_CAMERA_UP).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('exposes degree/radian conversion constant', () => {
    expect(180 * DEGREES_TO_RADIANS).toBeCloseTo(Math.PI, 12);
    expect(45 * DEGREES_TO_RADIANS).toBeCloseTo(Math.PI / 4, 12);
  });
});
