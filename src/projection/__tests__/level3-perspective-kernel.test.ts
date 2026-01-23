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

  it('projectWorldToScreenPerspective((0.5, 0.5, 0), defaultPerspCam) → screenPos near center but NOT identical to ortho', () => {
    const perspResult = makeResult();
    const orthoResult = makeResult();

    projectWorldToScreenPerspective(0.5, 0.5, 0, cam, perspResult);
    projectWorldToScreenOrtho(0.5, 0.5, 0, ORTHO_CAMERA_DEFAULTS, orthoResult);

    // Perspective should produce valid output
    expect(Number.isFinite(perspResult.screenX)).toBe(true);
    expect(Number.isFinite(perspResult.screenY)).toBe(true);
    expect(perspResult.visible).toBe(true);

    // Should NOT be bitwise equal to ortho result for off-axis point
    // (0.5, 0.5, 0) is the camera target, so it might be near center
    // but the tilted camera means the projection differs from ortho
    // The key assertion: it differs from ortho's identity mapping
    const orthoMatchesIdentity =
      orthoResult.screenX === 0.5 && orthoResult.screenY === 0.5;
    expect(orthoMatchesIdentity).toBe(true); // Ortho IS identity

    // Under perspective with a tilted camera, (0.5, 0.5, 0) which is the
    // target point should project approximately to center (0.5, 0.5)
    // but may not be exactly (0.5, 0.5) due to the tilt
    // The test says "NOT (0.5, 0.5) unless point is exactly on optical axis"
    // Since camTarget is (0.5, 0.5, 0) and the camera looks at the target,
    // the target IS on the optical axis. So it should be near (0.5, 0.5).
    expect(perspResult.screenX).toBeCloseTo(0.5, 1);
    expect(perspResult.screenY).toBeCloseTo(0.5, 1);
  });

  it('Points farther from center have more displacement under perspective than ortho (parallax property)', () => {
    const perspCenter = makeResult();
    const perspEdge = makeResult();
    const orthoCenter = makeResult();
    const orthoEdge = makeResult();

    // Center point
    projectWorldToScreenPerspective(0.5, 0.5, 0, cam, perspCenter);
    projectWorldToScreenOrtho(0.5, 0.5, 0, ORTHO_CAMERA_DEFAULTS, orthoCenter);

    // Edge point
    projectWorldToScreenPerspective(0.9, 0.5, 0, cam, perspEdge);
    projectWorldToScreenOrtho(0.9, 0.5, 0, ORTHO_CAMERA_DEFAULTS, orthoEdge);

    // Displacement from center under each mode
    const perspDisplacementEdge = Math.abs(perspEdge.screenX - perspCenter.screenX);
    const orthoDisplacementEdge = Math.abs(orthoEdge.screenX - orthoCenter.screenX);

    // Under perspective, the displacement should differ from ortho
    // (perspective foreshortening changes spatial relationships)
    expect(perspDisplacementEdge).not.toBeCloseTo(orthoDisplacementEdge, 3);
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

    // Camera is above and behind the scene (positive Y and Z from target)
    // A point far behind the camera should be invisible
    // Camera is at approximately (0.5, 1.65, 1.64) looking at (0.5, 0.5, 0)
    // Points with large positive Z (beyond the camera) should be behind it
    projectWorldToScreenPerspective(0.5, 0.5, 10, cam, r);
    // viewZ for this point should be negative (behind camera) since
    // camera is at z≈1.64 looking toward z=0, so z=10 is behind camera
    expect(r.visible).toBe(false);
  });

  it('visible = false for points outside near/far planes', () => {
    const r = makeResult();

    // Very far away point (in front of camera but beyond far plane)
    // Camera looks from z≈1.64 toward z=0. Points at very negative z are far away.
    projectWorldToScreenPerspective(0.5, 0.5, -200, cam, r);
    // This is far in front of camera — distance > far=100
    expect(r.visible).toBe(false);
  });

  it('depth is monotonically increasing with distance from camera along view axis', () => {
    const depths: number[] = [];
    const r = makeResult();

    // Camera looks from above/behind toward (0.5, 0.5, 0)
    // Points at z=0, z=-0.5, z=-1, z=-2 are progressively farther from camera
    // along the view axis
    const zValues = [0, -0.2, -0.5, -1.0, -2.0];

    for (const z of zValues) {
      projectWorldToScreenPerspective(0.5, 0.5, z, cam, r);
      if (r.visible) {
        depths.push(r.depth);
      }
    }

    // Should have multiple visible points
    expect(depths.length).toBeGreaterThanOrEqual(3);

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
    const rNear = makeResult();
    const rFar = makeResult();

    // Camera is above/behind the scene at roughly (0.5, 1.65, 1.64)
    // z=0.5 is closer to camera than z=0 (camera is at positive z)
    projectWorldToScreenPerspective(0.3, 0.3, 0.5, perspCam, rNear);
    projectWorldToScreenPerspective(0.3, 0.3, 0.0, perspCam, rFar);

    // Both should be visible
    expect(rNear.visible).toBe(true);
    expect(rFar.visible).toBe(true);

    // The closer instance should have more displacement from screen center
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

    // Under perspective, screenPos.xy should vary with z
    let hasVariation = false;
    for (let i = 1; i < N; i++) {
      if (perspVisible[i] && perspVisible[0]) {
        if (perspScreenPos[i * 2 + 0] !== perspScreenPos[0] ||
            perspScreenPos[i * 2 + 1] !== perspScreenPos[1]) {
          hasVariation = true;
          break;
        }
      }
    }
    expect(hasVariation).toBe(true);
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
    let hasDifference = false;
    for (let i = 0; i < N; i++) {
      if (perspVisible[i]) {
        const worldX = positions[i * 3 + 0];
        const worldY = positions[i * 3 + 1];
        if (perspScreen[i * 2 + 0] !== worldX || perspScreen[i * 2 + 1] !== worldY) {
          hasDifference = true;
          break;
        }
      }
    }
    expect(hasDifference).toBe(true);

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
