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
    // Perspective changes the radius (it's NOT identity)
    expect(result).not.toBe(0.05);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);

    // Verify against expected formula: screenR = worldR / (viewZ * tan(fovY/2))
    // For (0.5, 0.5, 0): camera at (0.5, ~1.65, ~1.64), forward toward (0.5, 0.5, 0)
    // viewZ = distance from camera to target along view axis ≈ 2.0 (derivation distance)
    // Expected: 0.05 / (2.0 * tan(22.5°)) ≈ 0.05 / (2.0 * 0.4142) ≈ 0.0604
    // Use approximate match to verify formula correctness
    expect(result).toBeCloseTo(0.05 / (2.0 * Math.tan(perspCam.fovY * 0.5)), 2);
  });

  it('Under perspective: same radius at z=0 vs z=0.5 → farther instance has smaller screen radius', () => {
    // Camera is at approximately (0.5, 1.65, 1.64) looking at target (0.5, 0.5, 0).
    // viewZ = projection onto forward axis; camera distance from target ≈ 2.0.
    // z=0.5 is closer to camera (smaller viewZ) → larger screen radius
    // z=0.0 is farther from camera (viewZ ≈ 2.0) → smaller screen radius
    // z=-1.0 is even farther → even smaller
    const rAtZ05 = projectWorldRadiusToScreenRadiusPerspective(0.05, 0.5, 0.5, 0.5, perspCam);
    const rAtZ0 = projectWorldRadiusToScreenRadiusPerspective(0.05, 0.5, 0.5, 0.0, perspCam);
    const rAtZNeg1 = projectWorldRadiusToScreenRadiusPerspective(0.05, 0.5, 0.5, -1.0, perspCam);

    // Closer → larger, farther → smaller (monotonic with distance)
    expect(rAtZ05).toBeGreaterThan(rAtZ0);
    expect(rAtZ0).toBeGreaterThan(rAtZNeg1);
    // All positive and finite
    expect(rAtZ05).toBeGreaterThan(0);
    expect(rAtZNeg1).toBeGreaterThan(0);
  });

  it('Under ortho: same radius at z=0 vs z=0.5 → screen radius is identical', () => {
    const rAtZ0 = projectWorldRadiusToScreenRadiusOrtho(0.05, 0.5, 0.5, 0.0, orthoCam);
    const rAtZ05 = projectWorldRadiusToScreenRadiusOrtho(0.05, 0.5, 0.5, 0.5, orthoCam);
    expect(rAtZ0).toBe(rAtZ05);
  });

  it('Screen radius is never negative or NaN', () => {
    // Test many positions under both modes, including edge cases
    const positions: [number, number, number][] = [
      [0.5, 0.5, 0], [0, 0, 0], [1, 1, 0],
      [0.5, 0.5, 0.5], [0.5, 0.5, -1],
      [0.1, 0.9, 0.3], [0.8, 0.2, -0.5],
      // Behind camera: z=10 is behind the camera at z≈1.64 (viewZ <= 0)
      [0.5, 0.5, 10],
      // Very far from camera
      [0.5, 0.5, -50],
    ];

    for (const [x, y, z] of positions) {
      const orthoR = projectWorldRadiusToScreenRadiusOrtho(0.05, x, y, z, orthoCam);
      expect(orthoR).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(orthoR)).toBe(false);

      const perspR = projectWorldRadiusToScreenRadiusPerspective(0.05, x, y, z, perspCam);
      expect(perspR).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(perspR)).toBe(false);
    }

    // Specifically verify behind-camera returns 0 (not negative or NaN)
    const behindCam = projectWorldRadiusToScreenRadiusPerspective(0.05, 0.5, 0.5, 10, perspCam);
    expect(behindCam).toBe(0);
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
    // The formula: screenR = worldR / (viewZ * tan(fovY/2))
    // For two points with same worldR at different viewZ distances:
    //   rA / rB = viewZ_B / viewZ_A  (the 1/distance property)
    //
    // We independently compute viewZ for each point to verify the ratio.
    // Camera at (0.5, ~1.65, ~1.64), target (0.5, 0.5, 0), distance=2.0
    // Forward vector = normalize(target - camPos)
    const cam = PERSP_CAMERA_DEFAULTS;
    const fwdX = cam.camTargetX - cam.camPosX;
    const fwdY = cam.camTargetY - cam.camPosY;
    const fwdZ = cam.camTargetZ - cam.camPosZ;
    const fwdLen = Math.sqrt(fwdX * fwdX + fwdY * fwdY + fwdZ * fwdZ);
    const nfX = fwdX / fwdLen;
    const nfY = fwdY / fwdLen;
    const nfZ = fwdZ / fwdLen;

    // Compute viewZ for points at (0.5, 0.5, z) for z = 0.5, 0.25, 0.0
    function computeViewZ(z: number): number {
      const dx = 0.5 - cam.camPosX;
      const dy = 0.5 - cam.camPosY;
      const dz = z - cam.camPosZ;
      return dx * nfX + dy * nfY + dz * nfZ;
    }

    const viewZClose = computeViewZ(0.5);
    const viewZMiddle = computeViewZ(0.25);
    const viewZFar = computeViewZ(0.0);

    // All in front of camera
    expect(viewZClose).toBeGreaterThan(0);
    expect(viewZMiddle).toBeGreaterThan(0);
    expect(viewZFar).toBeGreaterThan(0);
    // Ordering: close < middle < far (viewZ increases with distance)
    expect(viewZClose).toBeLessThan(viewZMiddle);
    expect(viewZMiddle).toBeLessThan(viewZFar);

    // Get actual screen radii from the function
    const rClose = projectWorldRadiusToScreenRadiusPerspective(0.05, 0.5, 0.5, 0.5, cam);
    const rMiddle = projectWorldRadiusToScreenRadiusPerspective(0.05, 0.5, 0.5, 0.25, cam);
    const rFar = projectWorldRadiusToScreenRadiusPerspective(0.05, 0.5, 0.5, 0.0, cam);

    // All positive
    expect(rClose).toBeGreaterThan(0);
    expect(rMiddle).toBeGreaterThan(0);
    expect(rFar).toBeGreaterThan(0);

    // Verify the 1/distance property:
    // rClose/rFar should equal viewZFar/viewZClose
    const actualRatio = rClose / rFar;
    const expectedRatio = viewZFar / viewZClose;
    expect(actualRatio).toBeCloseTo(expectedRatio, 10);

    // Also verify rClose/rMiddle = viewZMiddle/viewZClose
    const actualRatio2 = rClose / rMiddle;
    const expectedRatio2 = viewZMiddle / viewZClose;
    expect(actualRatio2).toBeCloseTo(expectedRatio2, 10);
  });
});
