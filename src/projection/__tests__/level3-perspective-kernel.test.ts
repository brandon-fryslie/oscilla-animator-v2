/**
 * Level 3: Perspective Projection Kernel (Pure Math)
 *
 * Tests proving the perspective kernel produces correct parallax and differs from ortho.
 */
import { describe, it, expect } from 'vitest';
import {
  projectWorldToScreenPerspective,
  projectFieldPerspective,
  deriveCamPos,
  PERSP_CAMERA_DEFAULTS,
  PERSP_DERIVATION,
} from '../perspective-kernel';
import {
  projectWorldToScreenOrtho,
  projectFieldOrtho,
  ORTHO_CAMERA_DEFAULTS,
  type ProjectionResult,
} from '../ortho-kernel';
import { createPositionField, writePosition } from '../fields';
import { gridLayout3D } from '../layout-kernels';

function makeResult(): ProjectionResult {
  return { screenX: 0, screenY: 0, depth: 0, visible: false };
}

// =============================================================================
// Unit Tests
// =============================================================================

describe('Level 3 Unit Tests: Scalar Kernel', () => {
  const cam = PERSP_CAMERA_DEFAULTS;

  it('projectWorldToScreenPerspective((0.5, 0.5, 0), defaultPerspCam) → screenPos near center but NOT identical to ortho for off-axis points', () => {
    const perspResult = makeResult();
    const orthoResult = makeResult();

    // (0.5, 0.5, 0) IS the camera target (on optical axis).
    // It should project to approximately (0.5, 0.5) under perspective.
    projectWorldToScreenPerspective(0.5, 0.5, 0, cam, perspResult);
    expect(Number.isFinite(perspResult.screenX)).toBe(true);
    expect(Number.isFinite(perspResult.screenY)).toBe(true);
    expect(perspResult.visible).toBe(true);
    // On-axis point should project near (0.5, 0.5) — verify tight tolerance
    expect(perspResult.screenX).toBeCloseTo(0.5, 5);
    expect(perspResult.screenY).toBeCloseTo(0.5, 5);

    // Now test an OFF-axis point: (0.8, 0.3, 0)
    // Under ortho it maps to identity: screenPos === (0.8, 0.3)
    // Under perspective it should differ due to the tilted camera
    const perspOff = makeResult();
    const orthoOff = makeResult();
    projectWorldToScreenPerspective(0.8, 0.3, 0, cam, perspOff);
    projectWorldToScreenOrtho(0.8, 0.3, 0, ORTHO_CAMERA_DEFAULTS, orthoOff);

    // Ortho IS identity
    expect(orthoOff.screenX).toBe(0.8);
    expect(orthoOff.screenY).toBe(0.3);

    // Perspective should NOT be bitwise equal to ortho for off-axis point
    const matchesOrtho =
      perspOff.screenX === orthoOff.screenX && perspOff.screenY === orthoOff.screenY;
    expect(matchesOrtho).toBe(false);
  });

  it('Points farther from center have more displacement under perspective than ortho (parallax property)', () => {
    // The parallax property: the perspective-ortho DIFFERENCE grows with distance
    // from the optical center. A point at 0.7 should have less persp-ortho deviation
    // than a point at 0.9.
    const perspMid = makeResult();
    const perspEdge = makeResult();

    // Mid-distance point (0.7, 0.5) — moderately off-axis
    projectWorldToScreenPerspective(0.7, 0.5, 0, cam, perspMid);
    // Edge point (0.9, 0.5) — further off-axis
    projectWorldToScreenPerspective(0.9, 0.5, 0, cam, perspEdge);

    // Ortho identity: screen coords === world coords
    // So persp-ortho deviation = |perspScreen - worldPos|
    const deviationMid = Math.sqrt(
      (perspMid.screenX - 0.7) ** 2 + (perspMid.screenY - 0.5) ** 2
    );
    const deviationEdge = Math.sqrt(
      (perspEdge.screenX - 0.9) ** 2 + (perspEdge.screenY - 0.5) ** 2
    );

    // The edge point (further from center) has MORE perspective deviation than the mid point
    expect(deviationEdge).toBeGreaterThan(deviationMid);
    // Both deviations are non-zero (perspective differs from ortho for off-axis points)
    expect(deviationMid).toBeGreaterThan(0);
    expect(deviationEdge).toBeGreaterThan(0);
  });

  it('camPos is computed deterministically from tilt/yaw/distance/target', () => {
    const { tiltAngle, yawAngle, distance, camTargetX, camTargetY, camTargetZ } = PERSP_DERIVATION;

    const [x, y, z] = deriveCamPos(
      camTargetX, camTargetY, camTargetZ,
      tiltAngle, yawAngle, distance
    );

    // Verify it matches the defaults
    expect(x).toBe(PERSP_CAMERA_DEFAULTS.camPosX);
    expect(y).toBe(PERSP_CAMERA_DEFAULTS.camPosY);
    expect(z).toBe(PERSP_CAMERA_DEFAULTS.camPosZ);

    // Verify the math: with yaw=0, tilt=35°, distance=2
    // (0, 0, 2) → tilt by 35° around X → (0, 2*sin(35°), 2*cos(35°))
    // → yaw by 0° (no change)
    // → + target (0.5, 0.5, 0)
    const expectedY = 0.5 + 2.0 * Math.sin(tiltAngle);
    const expectedZ = 0.0 + 2.0 * Math.cos(tiltAngle);
    const expectedX = 0.5; // yaw=0 means no X displacement

    expect(x).toBeCloseTo(expectedX, 10);
    expect(y).toBeCloseTo(expectedY, 10);
    expect(z).toBeCloseTo(expectedZ, 10);
  });

  it('visible = false for points behind camera', () => {
    const r = makeResult();

    // Camera is at approximately (0.5, 1.65, 1.64) looking at target (0.5, 0.5, 0).
    // The forward vector points from camera toward target (negative Y, negative Z direction).
    // A point at z=10 is on the opposite side of the camera from the target,
    // meaning its view-space Z (dot with forward) is negative — behind camera.
    projectWorldToScreenPerspective(0.5, 0.5, 10, cam, r);
    expect(r.visible).toBe(false);

    // Also test a point directly behind the camera (past camPos along -forward)
    // Camera at (0.5, 1.65, 1.64), so (0.5, 3.0, 3.0) is further above/behind
    projectWorldToScreenPerspective(0.5, 3.0, 3.0, cam, r);
    expect(r.visible).toBe(false);
  });

  it('visible = false for points outside near/far planes', () => {
    const r = makeResult();

    // Far plane test: Very far away point (in front of camera but beyond far=100)
    // Camera looks from z≈1.64 toward z=0. Points at very negative z are far from camera.
    projectWorldToScreenPerspective(0.5, 0.5, -200, cam, r);
    expect(r.visible).toBe(false);

    // Near plane test: Point too close to camera (within near=0.01)
    // Camera is at approximately (0.5, 1.65, 1.64). A point very close
    // to camPos along the view axis has viewZ < near=0.01.
    // Place point just barely in front of camera (almost at camera position)
    const camX = PERSP_CAMERA_DEFAULTS.camPosX;
    const camY = PERSP_CAMERA_DEFAULTS.camPosY;
    const camZ = PERSP_CAMERA_DEFAULTS.camPosZ;
    // Move a tiny amount toward target (forward direction)
    const targetX = PERSP_CAMERA_DEFAULTS.camTargetX;
    const targetY = PERSP_CAMERA_DEFAULTS.camTargetY;
    const targetZ = PERSP_CAMERA_DEFAULTS.camTargetZ;
    // Forward vector (unnormalized): target - camPos
    const fwdX = targetX - camX;
    const fwdY = targetY - camY;
    const fwdZ = targetZ - camZ;
    const fwdLen = Math.sqrt(fwdX * fwdX + fwdY * fwdY + fwdZ * fwdZ);
    // Place point 0.005 units in front of camera (less than near=0.01)
    const nearPtX = camX + (fwdX / fwdLen) * 0.005;
    const nearPtY = camY + (fwdY / fwdLen) * 0.005;
    const nearPtZ = camZ + (fwdZ / fwdLen) * 0.005;
    projectWorldToScreenPerspective(nearPtX, nearPtY, nearPtZ, cam, r);
    expect(r.visible).toBe(false);
  });

  it('depth is monotonically increasing with distance from camera along view axis', () => {
    const depths: number[] = [];
    const r = makeResult();

    // Camera looks from above/behind toward (0.5, 0.5, 0)
    // Points along optical axis at z=0, -0.2, -0.5, -1.0, -2.0 are progressively
    // farther from camera along the view axis (camera is at z≈1.64, looking toward z=0)
    const zValues = [0, -0.2, -0.5, -1.0, -2.0];

    // Pre-check: all points must be visible for this test to be meaningful
    for (const z of zValues) {
      projectWorldToScreenPerspective(0.5, 0.5, z, cam, r);
      expect(r.visible).toBe(true);
      depths.push(r.depth);
    }

    // All 5 points visible
    expect(depths.length).toBe(5);

    // Depth should be monotonically increasing (farther points have higher depth)
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i]).toBeGreaterThan(depths[i - 1]);
    }
  });

  it('Kernel is pure: same inputs → bitwise identical outputs', () => {
    const r1 = makeResult();
    const r2 = makeResult();

    const points: [number, number, number][] = [
      [0.5, 0.5, 0],
      [0.1, 0.9, 0.3],
      [0.8, 0.2, -0.5],
      [0.0, 0.0, 0.0],
      [1.0, 1.0, 0.0],
    ];

    for (const [x, y, z] of points) {
      projectWorldToScreenPerspective(x, y, z, cam, r1);
      projectWorldToScreenPerspective(x, y, z, cam, r2);
      expect(r1.screenX).toBe(r2.screenX);
      expect(r1.screenY).toBe(r2.screenY);
      expect(r1.depth).toBe(r2.depth);
      expect(r1.visible).toBe(r2.visible);
    }
  });
});

// =============================================================================
// Parallax Property Tests
// =============================================================================

describe('Level 3 Parallax Property Tests', () => {
  const perspCam = PERSP_CAMERA_DEFAULTS;
  const orthoCam = ORTHO_CAMERA_DEFAULTS;

  it('Two instances at (0.3, 0.3, 0) and (0.3, 0.3, 0.5): z=0.5 has different screenPos.xy under perspective', () => {
    const r1 = makeResult();
    const r2 = makeResult();

    projectWorldToScreenPerspective(0.3, 0.3, 0.0, perspCam, r1);
    projectWorldToScreenPerspective(0.3, 0.3, 0.5, perspCam, r2);

    // Different z → different screen positions under perspective
    const screenXDiffers = r1.screenX !== r2.screenX;
    const screenYDiffers = r1.screenY !== r2.screenY;
    expect(screenXDiffers || screenYDiffers).toBe(true);
  });

  it('The instance closer to camera is displaced MORE from center than the one farther (verify direction)', () => {
    // Camera at (0.5, ~1.65, ~1.64) looking at (0.5, 0.5, 0).
    // Point at z=0.5 is closer to camera along view axis (smaller viewZ distance)
    // than point at z=0.0 (which is farther along the view axis from camera).
    // Verify by checking depth: closer point has smaller depth.
    const rNear = makeResult();
    const rFar = makeResult();

    projectWorldToScreenPerspective(0.3, 0.3, 0.5, perspCam, rNear);
    projectWorldToScreenPerspective(0.3, 0.3, 0.0, perspCam, rFar);

    // Both must be visible for this test to be meaningful
    expect(rNear.visible).toBe(true);
    expect(rFar.visible).toBe(true);

    // Verify which is actually closer: the closer point has smaller depth
    expect(rNear.depth).toBeLessThan(rFar.depth);

    // The closer instance (smaller depth) should have more displacement from screen center
    // because perspective magnifies off-axis points when closer to camera
    const dispNear = Math.sqrt(
      (rNear.screenX - 0.5) ** 2 + (rNear.screenY - 0.5) ** 2
    );
    const dispFar = Math.sqrt(
      (rFar.screenX - 0.5) ** 2 + (rFar.screenY - 0.5) ** 2
    );

    // Closer to camera = larger apparent displacement from center
    expect(dispNear).toBeGreaterThan(dispFar);
  });

  it('Under ortho, same two instances have IDENTICAL screenPos.xy (z doesnt affect ortho XY)', () => {
    const r1 = makeResult();
    const r2 = makeResult();

    projectWorldToScreenOrtho(0.3, 0.3, 0.0, orthoCam, r1);
    projectWorldToScreenOrtho(0.3, 0.3, 0.5, orthoCam, r2);

    // Under ortho, z has NO effect on screen XY
    expect(r1.screenX).toBe(r2.screenX);
    expect(r1.screenY).toBe(r2.screenY);
  });
});

// =============================================================================
// Field Variant Tests
// =============================================================================

describe('Level 3 Field Variant Tests', () => {
  const cam = PERSP_CAMERA_DEFAULTS;

  it('Field perspective kernel matches N individual scalar calls (element-wise identical)', () => {
    const N = 15;
    const positions = createPositionField(N);

    // Write varied positions (all in front of camera)
    for (let i = 0; i < N; i++) {
      writePosition(positions, i, i / N, 0.5, (i - 7) * 0.1);
    }

    // Field kernel
    const screenPos = new Float32Array(N * 2);
    const depth = new Float32Array(N);
    const visible = new Uint8Array(N);
    projectFieldPerspective(positions, N, cam, screenPos, depth, visible);

    // Compare with scalar kernel
    const scalarResult = makeResult();
    for (let i = 0; i < N; i++) {
      const wx = positions[i * 3 + 0];
      const wy = positions[i * 3 + 1];
      const wz = positions[i * 3 + 2];
      projectWorldToScreenPerspective(wx, wy, wz, cam, scalarResult);

      // screenPos is stored as float32
      expect(screenPos[i * 2 + 0]).toBe(Math.fround(scalarResult.screenX));
      expect(screenPos[i * 2 + 1]).toBe(Math.fround(scalarResult.screenY));
      expect(depth[i]).toBe(Math.fround(scalarResult.depth));
      expect(visible[i]).toBe(scalarResult.visible ? 1 : 0);
    }
  });

  it('Field kernel with varied z produces non-uniform screenPos.xy (unlike ortho)', () => {
    const N = 5;
    const positions = createPositionField(N);

    // Same XY, different Z
    for (let i = 0; i < N; i++) {
      writePosition(positions, i, 0.3, 0.3, i * 0.2);
    }

    // Perspective
    const perspScreenPos = new Float32Array(N * 2);
    const perspDepth = new Float32Array(N);
    const perspVisible = new Uint8Array(N);
    projectFieldPerspective(positions, N, cam, perspScreenPos, perspDepth, perspVisible);

    // Ortho
    const orthoScreenPos = new Float32Array(N * 2);
    const orthoDepth = new Float32Array(N);
    const orthoVisible = new Uint8Array(N);
    projectFieldOrtho(positions, N, ORTHO_CAMERA_DEFAULTS, orthoScreenPos, orthoDepth, orthoVisible);

    // Under ortho, all screenPos.xy should be identical (z doesn't matter)
    for (let i = 1; i < N; i++) {
      if (orthoVisible[i]) {
        expect(orthoScreenPos[i * 2 + 0]).toBe(orthoScreenPos[0]);
        expect(orthoScreenPos[i * 2 + 1]).toBe(orthoScreenPos[1]);
      }
    }

    // Under perspective, screenPos.xy should vary with z:
    // different z values must produce different screen positions from each other
    // Collect unique screen positions for visible instances
    const visibleScreenXs: number[] = [];
    for (let i = 0; i < N; i++) {
      if (perspVisible[i]) {
        visibleScreenXs.push(perspScreenPos[i * 2 + 0]);
      }
    }
    // At least 3 visible instances
    expect(visibleScreenXs.length).toBeGreaterThanOrEqual(3);

    // Verify non-uniformity: at least 2 distinct screen X values among visible instances
    const uniqueXs = new Set(visibleScreenXs);
    expect(uniqueXs.size).toBeGreaterThanOrEqual(2);

    // Stronger: each consecutive visible pair should differ (monotonic variation with z)
    for (let i = 1; i < N; i++) {
      if (perspVisible[i] && perspVisible[i - 1]) {
        const prevX = perspScreenPos[(i - 1) * 2 + 0];
        const currX = perspScreenPos[i * 2 + 0];
        const prevY = perspScreenPos[(i - 1) * 2 + 1];
        const currY = perspScreenPos[i * 2 + 1];
        // Each different z produces a different screen position
        expect(currX !== prevX || currY !== prevY).toBe(true);
      }
    }
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Level 3 Integration Tests', () => {
  const perspCam = PERSP_CAMERA_DEFAULTS;
  const orthoCam = ORTHO_CAMERA_DEFAULTS;

  it('GridLayout(4x4) projected through both kernels: ortho=identity, perspective=parallax, both valid', () => {
    const N = 16;
    const positions = createPositionField(N);
    gridLayout3D(positions, N, 4, 4);

    // Ortho projection
    const orthoScreen = new Float32Array(N * 2);
    const orthoDepth = new Float32Array(N);
    const orthoVisible = new Uint8Array(N);
    projectFieldOrtho(positions, N, orthoCam, orthoScreen, orthoDepth, orthoVisible);

    // Perspective projection
    const perspScreen = new Float32Array(N * 2);
    const perspDepth = new Float32Array(N);
    const perspVisible = new Uint8Array(N);
    projectFieldPerspective(positions, N, perspCam, perspScreen, perspDepth, perspVisible);

    // Ortho: screenPos === worldPos.xy (identity)
    for (let i = 0; i < N; i++) {
      expect(orthoScreen[i * 2 + 0]).toBe(positions[i * 3 + 0]);
      expect(orthoScreen[i * 2 + 1]).toBe(positions[i * 3 + 1]);
    }

    // Perspective: screenPos !== worldPos.xy for off-center instances
    // Check that instances far from the grid center (0.5, 0.5) show more deviation
    let offCenterCount = 0;
    let offCenterDifferent = 0;
    for (let i = 0; i < N; i++) {
      if (!perspVisible[i]) continue;
      const worldX = positions[i * 3 + 0];
      const worldY = positions[i * 3 + 1];
      const distFromCenter = Math.sqrt((worldX - 0.5) ** 2 + (worldY - 0.5) ** 2);

      // Off-center: distance > 0.2 from grid center
      if (distFromCenter > 0.2) {
        offCenterCount++;
        if (perspScreen[i * 2 + 0] !== worldX || perspScreen[i * 2 + 1] !== worldY) {
          offCenterDifferent++;
        }
      }
    }
    // Multiple off-center instances exist and all differ from ortho identity
    expect(offCenterCount).toBeGreaterThanOrEqual(4);
    expect(offCenterDifferent).toBe(offCenterCount);

    // Both produce valid (non-NaN, non-Inf) outputs
    for (let i = 0; i < N; i++) {
      expect(Number.isFinite(orthoScreen[i * 2 + 0])).toBe(true);
      expect(Number.isFinite(orthoScreen[i * 2 + 1])).toBe(true);
      expect(Number.isFinite(orthoDepth[i])).toBe(true);

      if (perspVisible[i]) {
        expect(Number.isFinite(perspScreen[i * 2 + 0])).toBe(true);
        expect(Number.isFinite(perspScreen[i * 2 + 1])).toBe(true);
        expect(Number.isFinite(perspDepth[i])).toBe(true);
      }
    }

    // Both agree on visibility for in-frustum points (z=0, within both frustums)
    for (let i = 0; i < N; i++) {
      // All points are at z=0, which is within both frustums
      expect(orthoVisible[i]).toBe(1);
      expect(perspVisible[i]).toBe(1);
    }
  });
});
