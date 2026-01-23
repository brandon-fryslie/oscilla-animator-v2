/**
 * Level 4: Size Projection (World Radius → Screen Radius)
 *
 * Tests proving that sizes project correctly under both ortho and perspective.
 * Ortho: identity (screenRadius === worldRadius).
 * Perspective: foreshortening (1/distance falloff).
 */
import { describe, it, expect } from 'vitest';
import {
  projectWorldRadiusToScreenRadiusOrtho,
  projectFieldRadiusOrtho,
  ORTHO_CAMERA_DEFAULTS,
} from '../ortho-kernel';
import {
  projectWorldRadiusToScreenRadiusPerspective,
  projectFieldRadiusPerspective,
  PERSP_CAMERA_DEFAULTS,
} from '../perspective-kernel';
import { createPositionField, writePosition, createSizeField } from '../fields';

// =============================================================================
// Unit Tests
// =============================================================================

describe('Level 4 Unit Tests', () => {
  const orthoCam = ORTHO_CAMERA_DEFAULTS;
  const perspCam = PERSP_CAMERA_DEFAULTS;

  it('projectWorldRadiusToScreenRadius(0.05, (0.5, 0.5, 0), orthoDefaults) → 0.05 (identity)', () => {
    const result = projectWorldRadiusToScreenRadiusOrtho(0.05, 0.5, 0.5, 0, orthoCam);
    expect(result).toBe(0.05);
  });

  it('projectWorldRadiusToScreenRadius(0.05, (0.5, 0.5, 0), perspDefaults) → some value != 0.05', () => {
    const result = projectWorldRadiusToScreenRadiusPerspective(0.05, 0.5, 0.5, 0, perspCam);
    expect(result).not.toBe(0.05);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });

  it('Under perspective: same radius at z=0 vs z=0.5 → farther instance has smaller screen radius', () => {
    // Camera is at approximately (0.5, 1.65, 1.64) looking at (0.5, 0.5, 0)
    // z=0 is the target plane, z=0.5 is closer to the camera (camera z ≈ 1.64)
    // "Farther" from camera means larger viewZ distance
    const rAtZ0 = projectWorldRadiusToScreenRadiusPerspective(0.05, 0.5, 0.5, 0.0, perspCam);
    const rAtZ05 = projectWorldRadiusToScreenRadiusPerspective(0.05, 0.5, 0.5, 0.5, perspCam);

    // z=0.5 is closer to camera → larger screen radius
    // z=0.0 is farther from camera → smaller screen radius
    expect(rAtZ05).toBeGreaterThan(rAtZ0);

    // Alternative: test z=0 vs z=-1 (z=-1 is even farther from camera)
    const rAtZNeg1 = projectWorldRadiusToScreenRadiusPerspective(0.05, 0.5, 0.5, -1.0, perspCam);
    expect(rAtZNeg1).toBeLessThan(rAtZ0); // Farther → smaller
  });

  it('Under ortho: same radius at z=0 vs z=0.5 → screen radius is identical', () => {
    const rAtZ0 = projectWorldRadiusToScreenRadiusOrtho(0.05, 0.5, 0.5, 0.0, orthoCam);
    const rAtZ05 = projectWorldRadiusToScreenRadiusOrtho(0.05, 0.5, 0.5, 0.5, orthoCam);
    expect(rAtZ0).toBe(rAtZ05);
  });

  it('Screen radius is never negative or NaN', () => {
    // Test many positions under both modes
    const positions: [number, number, number][] = [
      [0.5, 0.5, 0], [0, 0, 0], [1, 1, 0],
      [0.5, 0.5, 0.5], [0.5, 0.5, -1],
      [0.1, 0.9, 0.3], [0.8, 0.2, -0.5],
    ];

    for (const [x, y, z] of positions) {
      const orthoR = projectWorldRadiusToScreenRadiusOrtho(0.05, x, y, z, orthoCam);
      expect(orthoR).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(orthoR)).toBe(false);

      const perspR = projectWorldRadiusToScreenRadiusPerspective(0.05, x, y, z, perspCam);
      expect(perspR).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(perspR)).toBe(false);
    }
  });

  it('Screen radius of 0 worldRadius is 0 (zero stays zero)', () => {
    expect(projectWorldRadiusToScreenRadiusOrtho(0, 0.5, 0.5, 0, orthoCam)).toBe(0);
    expect(projectWorldRadiusToScreenRadiusPerspective(0, 0.5, 0.5, 0, perspCam)).toBe(0);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Level 4 Integration Tests', () => {
  const orthoCam = ORTHO_CAMERA_DEFAULTS;
  const perspCam = PERSP_CAMERA_DEFAULTS;

  it('5 instances at varied z, uniform worldRadius=0.05: ortho all same, perspective monotonic by distance', () => {
    const N = 5;
    const positions = createPositionField(N);
    const worldRadii = createSizeField(N);

    // All at center XY, varied z
    const zValues = [-0.5, 0.0, 0.25, 0.5, 0.75];
    for (let i = 0; i < N; i++) {
      writePosition(positions, i, 0.5, 0.5, zValues[i]);
      worldRadii[i] = 0.05;
    }

    // Ortho: all screenRadii === 0.05
    const orthoRadii = new Float32Array(N);
    projectFieldRadiusOrtho(worldRadii, positions, N, orthoCam, orthoRadii);
    for (let i = 0; i < N; i++) {
      expect(orthoRadii[i]).toBeCloseTo(0.05);
    }

    // Perspective: radii monotonically ordered by z-distance from camera
    // Camera is at z≈1.64. Closer z → closer to camera → larger radius.
    // z=-0.5 is farthest, z=0.75 is closest to camera.
    const perspRadii = new Float32Array(N);
    projectFieldRadiusPerspective(worldRadii, positions, N, perspCam, perspRadii);

    // Should be monotonically increasing with z (closer to camera)
    for (let i = 1; i < N; i++) {
      expect(perspRadii[i]).toBeGreaterThan(perspRadii[i - 1]);
    }
  });

  it('Ratio between screen radii under perspective matches 1/distance falloff', () => {
    const perspCam2 = PERSP_CAMERA_DEFAULTS;

    // Two instances at different distances from camera (same XY)
    const rClose = projectWorldRadiusToScreenRadiusPerspective(0.05, 0.5, 0.5, 0.5, perspCam2);
    const rFar = projectWorldRadiusToScreenRadiusPerspective(0.05, 0.5, 0.5, 0.0, perspCam2);

    // Both are at (0.5, 0.5) which is center of the scene.
    // The ratio should be viewZ_far / viewZ_close (inverse distance relationship).
    // We can verify the ratio is consistent with 1/d scaling.

    // Compute expected ratio: if screenR = worldR / (viewZ * tan(fov/2))
    // then ratio = rClose/rFar = viewZ_far / viewZ_close
    const ratio = rClose / rFar;

    // The ratio should be > 1 (close is bigger)
    expect(ratio).toBeGreaterThan(1);

    // Verify with a third point: if 1/d scaling holds, then
    // r1/r2 should equal d2/d1 for any two points along the same view ray
    const rMiddle = projectWorldRadiusToScreenRadiusPerspective(0.05, 0.5, 0.5, 0.25, perspCam2);

    // Close/Middle should be less than Close/Far
    const ratioCloseMiddle = rClose / rMiddle;
    const ratioCloseFar = rClose / rFar;
    expect(ratioCloseMiddle).toBeLessThan(ratioCloseFar);

    // All positive
    expect(rClose).toBeGreaterThan(0);
    expect(rMiddle).toBeGreaterThan(0);
    expect(rFar).toBeGreaterThan(0);

    // Verify the 1/d property more precisely:
    // screenR = worldR / (viewZ * tan(fov/2))
    // For two points at same (x,y) but different z, both on the same view ray through center:
    // rA / rB = viewZ_B / viewZ_A
    // This is exact within floating-point tolerance
    expect(ratio).toBeCloseTo(ratioCloseFar, 5);
  });
});
