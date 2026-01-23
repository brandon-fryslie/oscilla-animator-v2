/**
 * Level 5: RenderAssembler Projection Stage (Pipeline Wiring)
 *
 * Tests proving the projection kernels are called at the right place in the pipeline.
 * World-space in, screen-space out. Ortho default working end-to-end.
 */
import { describe, it, expect } from 'vitest';
import {
  projectInstances,
  type ProjectionMode,
  type CameraParams,
  type ProjectionOutput,
  assembleRenderPass,
  type AssemblerContext,
} from '../../runtime/RenderAssembler';
import { ORTHO_CAMERA_DEFAULTS } from '../ortho-kernel';
import { PERSP_CAMERA_DEFAULTS } from '../perspective-kernel';
import { createPositionField, writePosition } from '../fields';
import { gridLayout3D } from '../layout-kernels';

// =============================================================================
// Unit Tests
// =============================================================================

describe('Level 5 Unit Tests: Projection Step', () => {
  const orthoCam: CameraParams = { mode: 'orthographic', params: ORTHO_CAMERA_DEFAULTS };
  const perspCam: CameraParams = { mode: 'perspective', params: PERSP_CAMERA_DEFAULTS };

  it('RenderAssembler has a projection step that accepts: world position buffers + camera params', () => {
    // projectInstances is the projection step function
    // It accepts: worldPositions (Float32Array stride 3), worldRadius, count, camera params
    const N = 4;
    const positions = createPositionField(N);
    gridLayout3D(positions, N, 2, 2);

    // Should not throw — accepts camera params as argument
    const result = projectInstances(positions, 0.05, N, orthoCam);
    expect(result).toBeDefined();

    // Also works with perspective
    const result2 = projectInstances(positions, 0.05, N, perspCam);
    expect(result2).toBeDefined();
  });

  it('Projection step outputs: screenPosition (Float32Array), screenRadius (Float32Array), depth (Float32Array), visible (Uint8Array)', () => {
    const N = 9;
    const positions = createPositionField(N);
    gridLayout3D(positions, N, 3, 3);

    const result = projectInstances(positions, 0.03, N, orthoCam);

    // Check types
    expect(result.screenPosition).toBeInstanceOf(Float32Array);
    expect(result.screenRadius).toBeInstanceOf(Float32Array);
    expect(result.depth).toBeInstanceOf(Float32Array);
    expect(result.visible).toBeInstanceOf(Uint8Array);

    // Check lengths
    expect(result.screenPosition.length).toBe(N * 2); // stride 2
    expect(result.screenRadius.length).toBe(N);
    expect(result.depth.length).toBe(N);
    expect(result.visible.length).toBe(N);
  });

  it('RenderAssembler does NOT mutate world-space input buffers (snapshot before === snapshot after)', () => {
    const N = 16;
    const positions = createPositionField(N);
    gridLayout3D(positions, N, 4, 4);

    // Snapshot before
    const snapshotBefore = new Float32Array(positions);

    // Run ortho projection
    projectInstances(positions, 0.03, N, orthoCam);

    // Verify no mutation
    expect(positions).toEqual(snapshotBefore);

    // Run perspective projection (more complex math)
    projectInstances(positions, 0.03, N, perspCam);

    // Verify no mutation again
    expect(positions).toEqual(snapshotBefore);
  });

  it('RenderPass struct contains all four screen-space fields with correct lengths', () => {
    const N = 9;
    const positions = createPositionField(N);
    gridLayout3D(positions, N, 3, 3);

    const result = projectInstances(positions, 0.03, N, orthoCam);

    // All four fields present
    expect(result.screenPosition).toBeDefined();
    expect(result.screenRadius).toBeDefined();
    expect(result.depth).toBeDefined();
    expect(result.visible).toBeDefined();

    // Correct lengths for N instances
    expect(result.screenPosition.length).toBe(N * 2);
    expect(result.screenRadius.length).toBe(N);
    expect(result.depth.length).toBe(N);
    expect(result.visible.length).toBe(N);

    // Verify values are reasonable for ortho at z=0
    for (let i = 0; i < N; i++) {
      const sx = result.screenPosition[i * 2];
      const sy = result.screenPosition[i * 2 + 1];
      expect(Number.isFinite(sx)).toBe(true);
      expect(Number.isFinite(sy)).toBe(true);
      // Ortho identity: Float32Array storage rounds 0.03 to Math.fround(0.03)
      expect(result.screenRadius[i]).toBe(Math.fround(0.03));
      expect(Number.isFinite(result.depth[i])).toBe(true);
      expect(result.visible[i]).toBe(1); // all z=0 are visible
    }
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Level 5 Integration Tests: Full Pipeline', () => {
  const orthoCam: CameraParams = { mode: 'orthographic', params: ORTHO_CAMERA_DEFAULTS };
  const perspCam: CameraParams = { mode: 'perspective', params: PERSP_CAMERA_DEFAULTS };

  it('GridLayout(4x4) → ortho projection: screenPos matches worldPos.xy, screenRadius=0.03, uniform depth, all visible', () => {
    const N = 16;
    const positions = createPositionField(N);
    gridLayout3D(positions, N, 4, 4);
    const worldRadius = 0.03;

    const result = projectInstances(positions, worldRadius, N, orthoCam);

    for (let i = 0; i < N; i++) {
      const worldX = positions[i * 3 + 0];
      const worldY = positions[i * 3 + 1];
      const worldZ = positions[i * 3 + 2];

      // screenPos matches worldPos.xy (ortho identity at z=0)
      expect(result.screenPosition[i * 2]).toBe(worldX);
      expect(result.screenPosition[i * 2 + 1]).toBe(worldY);

      // screenRadius === worldRadius (ortho identity, through Float32Array storage)
      expect(result.screenRadius[i]).toBe(Math.fround(worldRadius));

      // depth is uniform (all z=0)
      expect(result.depth[i]).toBe(result.depth[0]);

      // all visible
      expect(result.visible[i]).toBe(1);
    }
  });

  it('Layout with z=0.3: screenPos.xy still matches worldPos.xy, depth differs from z=0, all visible', () => {
    const N = 16;
    const positions = createPositionField(N);
    gridLayout3D(positions, N, 4, 4);

    // Set all z to 0.3
    for (let i = 0; i < N; i++) {
      positions[i * 3 + 2] = 0.3;
    }

    const resultZ03 = projectInstances(positions, 0.03, N, orthoCam);

    // Also compute z=0 result for depth comparison
    const positionsZ0 = createPositionField(N);
    gridLayout3D(positionsZ0, N, 4, 4);
    const resultZ0 = projectInstances(positionsZ0, 0.03, N, orthoCam);

    for (let i = 0; i < N; i++) {
      const worldX = positions[i * 3 + 0];
      const worldY = positions[i * 3 + 1];

      // Ortho identity holds regardless of z
      expect(resultZ03.screenPosition[i * 2]).toBe(worldX);
      expect(resultZ03.screenPosition[i * 2 + 1]).toBe(worldY);

      // Depth differs from z=0
      expect(resultZ03.depth[i]).not.toBe(resultZ0.depth[i]);

      // All visible (z=0.3 is well within near=-100..far=100)
      expect(resultZ03.visible[i]).toBe(1);
    }
  });

  it('Projection produces separate output buffers (not views of world input)', () => {
    const N = 4;
    const positions = createPositionField(N);
    gridLayout3D(positions, N, 2, 2);

    const result = projectInstances(positions, 0.03, N, orthoCam);

    // screenPosition buffer is a different object than positions
    expect(result.screenPosition.buffer).not.toBe(positions.buffer);
    // depth and visible are separate too
    expect(result.depth.buffer).not.toBe(positions.buffer);
  });

  it('Projection with both modes selects correct kernel via if/else branch', () => {
    const N = 9;
    const positions = createPositionField(N);
    gridLayout3D(positions, N, 3, 3);

    const orthoResult = projectInstances(positions, 0.03, N, orthoCam);
    const perspResult = projectInstances(positions, 0.03, N, perspCam);

    // Under ortho: screenPos === worldPos.xy
    for (let i = 0; i < N; i++) {
      expect(orthoResult.screenPosition[i * 2]).toBe(positions[i * 3]);
      expect(orthoResult.screenPosition[i * 2 + 1]).toBe(positions[i * 3 + 1]);
    }

    // Under perspective: screenPos differs for off-center instances
    // Center instance at (0.5, 0.5) will be near center, but not exact identity
    let anyDifferent = false;
    for (let i = 0; i < N; i++) {
      if (
        perspResult.screenPosition[i * 2] !== positions[i * 3] ||
        perspResult.screenPosition[i * 2 + 1] !== positions[i * 3 + 1]
      ) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });
});
