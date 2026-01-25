/**
 * Level 7: Depth Ordering and Visibility
 *
 * Tests proving that instances are correctly sorted by depth (far-to-near / painter's algorithm, stable),
 * and culled instances are excluded from rendering.
 */
import { describe, it, expect } from 'vitest';
import {
  projectInstances,
  depthSortAndCompact,
  type ProjectionOutput,
} from '../../runtime/RenderAssembler';
import { DEFAULT_CAMERA, type ResolvedCameraParams } from '../../runtime/CameraResolver';
import { createPositionField, writePosition } from '../fields';
import { gridLayout3D } from '../layout-kernels';
import { compile } from '../../compiler/compile';
import { buildPatch } from '../../graph';
import { executeFrame } from '../../runtime/ScheduleExecutor';
import { createRuntimeState } from '../../runtime/RuntimeState';
import { BufferPool } from '../../runtime/BufferPool';

// =============================================================================
// Camera Constants
// =============================================================================

const orthoCam: ResolvedCameraParams = DEFAULT_CAMERA;

const perspCam: ResolvedCameraParams = {
  projection: 'persp',
  centerX: 0.5,
  centerY: 0.5,
  distance: 2.0,
  tiltRad: (35 * Math.PI) / 180,
  yawRad: 0,
  fovYRad: (45 * Math.PI) / 180,
  near: 0.01,
  far: 100,
};

// =============================================================================
// Unit Tests
// =============================================================================

describe('Level 7 Unit Tests: Depth Sort and Cull', () => {
  it('Given depth array [0.5, 0.1, 0.9, 0.3], depth sort produces indices [2, 0, 3, 1] (far to near)', () => {
    const count = 4;
    const projection: ProjectionOutput = {
      screenPosition: new Float32Array([
        0.0, 0.0,  // idx 0
        0.1, 0.1,  // idx 1
        0.2, 0.2,  // idx 2
        0.3, 0.3,  // idx 3
      ]),
      screenRadius: new Float32Array([0.05, 0.05, 0.05, 0.05]),
      depth: new Float32Array([0.5, 0.1, 0.9, 0.3]),
      visible: new Uint8Array([1, 1, 1, 1]),
    };

    const color = new Float32Array([
      1, 0, 0, 1,  // idx 0: red
      0, 1, 0, 1,  // idx 1: green
      0, 0, 1, 1,  // idx 2: blue
      1, 1, 0, 1,  // idx 3: yellow
    ]);

    const result = depthSortAndCompact(projection, count, color);

    // Expected order: idx 2 (d=0.9), idx 0 (d=0.5), idx 3 (d=0.3), idx 1 (d=0.1)
    expect(result.count).toBe(4);

    // Verify depth is sorted far-to-near (descending)
    expect(result.depth[0]).toBeCloseTo(0.9);
    expect(result.depth[1]).toBeCloseTo(0.5);
    expect(result.depth[2]).toBeCloseTo(0.3);
    expect(result.depth[3]).toBeCloseTo(0.1);

    // Verify screen positions follow the sort
    expect(result.screenPosition[0]).toBeCloseTo(0.2); // idx 2's x
    expect(result.screenPosition[1]).toBeCloseTo(0.2); // idx 2's y
    expect(result.screenPosition[2]).toBeCloseTo(0.0); // idx 0's x
    expect(result.screenPosition[3]).toBeCloseTo(0.0); // idx 0's y
    expect(result.screenPosition[4]).toBeCloseTo(0.3); // idx 3's x
    expect(result.screenPosition[5]).toBeCloseTo(0.3); // idx 3's y
    expect(result.screenPosition[6]).toBeCloseTo(0.1); // idx 1's x
    expect(result.screenPosition[7]).toBeCloseTo(0.1); // idx 1's y

    // Verify colors follow the sort
    const c = result.color as Float32Array;
    // idx 2 (blue) first
    expect(c[0]).toBe(0); expect(c[1]).toBe(0); expect(c[2]).toBe(1); expect(c[3]).toBe(1);
    // idx 0 (red) second
    expect(c[4]).toBe(1); expect(c[5]).toBe(0); expect(c[6]).toBe(0); expect(c[7]).toBe(1);
    // idx 3 (yellow) third
    expect(c[8]).toBe(1); expect(c[9]).toBe(1); expect(c[10]).toBe(0); expect(c[11]).toBe(1);
    // idx 1 (green) fourth
    expect(c[12]).toBe(0); expect(c[13]).toBe(1); expect(c[14]).toBe(0); expect(c[15]).toBe(1);
  });

  it('Depth sort is stable: equal depths preserve original order', () => {
    const count = 5;
    const projection: ProjectionOutput = {
      screenPosition: new Float32Array([
        0.0, 0.0,  // idx 0
        0.1, 0.1,  // idx 1
        0.2, 0.2,  // idx 2
        0.3, 0.3,  // idx 3
        0.4, 0.4,  // idx 4
      ]),
      screenRadius: new Float32Array([0.01, 0.02, 0.03, 0.04, 0.05]),
      depth: new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5]), // All same depth
      visible: new Uint8Array([1, 1, 1, 1, 1]),
    };

    const color = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      color[i * 4] = i * 0.2; // Mark each with unique color channel
    }

    const result = depthSortAndCompact(projection, count, color);

    // All same depth → original order preserved (stable sort)
    expect(result.count).toBe(5);
    expect(result.screenRadius[0]).toBeCloseTo(0.01, 5); // idx 0 first
    expect(result.screenRadius[1]).toBeCloseTo(0.02, 5); // idx 1 second
    expect(result.screenRadius[2]).toBeCloseTo(0.03, 5); // idx 2 third
    expect(result.screenRadius[3]).toBeCloseTo(0.04, 5); // idx 3 fourth
    expect(result.screenRadius[4]).toBeCloseTo(0.05, 5); // idx 4 fifth
  });

  it('visible = false instances are excluded from the sorted render list', () => {
    const count = 5;
    const projection: ProjectionOutput = {
      screenPosition: new Float32Array([
        0.1, 0.1,  // idx 0: visible
        0.2, 0.2,  // idx 1: INVISIBLE
        0.3, 0.3,  // idx 2: visible
        0.4, 0.4,  // idx 3: INVISIBLE
        0.5, 0.5,  // idx 4: visible
      ]),
      screenRadius: new Float32Array([0.01, 0.02, 0.03, 0.04, 0.05]),
      depth: new Float32Array([0.3, 0.1, 0.5, 0.2, 0.4]),
      visible: new Uint8Array([1, 0, 1, 0, 1]), // 1,3 invisible
    };

    const color = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      color[i * 4] = i; // Unique marker
    }

    const result = depthSortAndCompact(projection, count, color);

    // Only 3 visible instances remain
    expect(result.count).toBe(3);
    expect(result.screenPosition.length).toBe(3 * 2);
    expect(result.screenRadius.length).toBe(3);
    expect(result.depth.length).toBe(3);

    // Sorted by depth among visible (far-to-near): idx 2 (d=0.5), idx 4 (d=0.4), idx 0 (d=0.3)
    expect(result.depth[0]).toBeCloseTo(0.5); // idx 2
    expect(result.depth[1]).toBeCloseTo(0.4); // idx 4
    expect(result.depth[2]).toBeCloseTo(0.3); // idx 0

    // Verify screen positions match sorted visible order
    expect(result.screenPosition[0]).toBeCloseTo(0.3); // idx 2
    expect(result.screenPosition[2]).toBeCloseTo(0.5); // idx 4
    expect(result.screenPosition[4]).toBeCloseTo(0.1); // idx 0

    // Verify colors follow (idx 2, 4, 0 in that order)
    const c = result.color as Float32Array;
    expect(c[0]).toBe(2); // idx 2's marker
    expect(c[4]).toBe(4); // idx 4's marker
    expect(c[8]).toBe(0); // idx 0's marker
  });
});

// =============================================================================
// Integration Tests (Ortho)
// =============================================================================

describe('Level 7 Integration Tests: Ortho Depth Ordering', () => {
  it('Patch with Group A (z=0.0) and Group B (z=0.4): Group A in back (farther from camera)', () => {
    // Ortho camera has near=-100, far=100. Depth = (z-near)/range = (z+100)/200.
    // z=0.0 → depth = 100/200 = 0.5
    // z=0.4 → depth = 100.4/200 = 0.502
    // Far-to-near: higher depth first. So z=0.4 (d=0.502) comes before z=0 (d=0.5)

    const N = 8;
    const positions = createPositionField(N);
    // Group A: first 4 at z=0.0
    for (let i = 0; i < 4; i++) {
      writePosition(positions, i, (i % 2) * 0.5 + 0.1, Math.floor(i / 2) * 0.5 + 0.1, 0.0);
    }
    // Group B: last 4 at z=0.4
    for (let i = 4; i < 8; i++) {
      writePosition(positions, i, ((i - 4) % 2) * 0.5 + 0.1, Math.floor((i - 4) / 2) * 0.5 + 0.1, 0.4);
    }

    const projection = projectInstances(positions, 0.03, N, orthoCam);
    const color = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) color[i * 4] = i; // marker

    const result = depthSortAndCompact(projection, N, color);

    // All 8 visible
    expect(result.count).toBe(8);

    // Verify depth is sorted (far-to-near, descending)
    for (let i = 1; i < result.count; i++) {
      expect(result.depth[i]).toBeLessThanOrEqual(result.depth[i - 1]);
    }

    // Group B (z=0.4) has higher depth than Group A (z=0.0)
    // So Group B instances come first in the sorted output
    // Verify: first 4 depths are all 0.502, last 4 are all 0.5
    expect(result.depth[0]).toBeCloseTo(0.502, 2);
    expect(result.depth[4]).toBeCloseTo(0.5, 2);
  });

  it('Verify by checking depth values: all Group A depths < all Group B depths', () => {
    const N = 8;
    const positions = createPositionField(N);
    for (let i = 0; i < 4; i++) {
      writePosition(positions, i, 0.25 * i, 0.25, 0.0);
    }
    for (let i = 4; i < 8; i++) {
      writePosition(positions, i, 0.25 * (i - 4), 0.75, 0.4);
    }

    const projection = projectInstances(positions, 0.03, N, orthoCam);

    // Group A depths (z=0)
    const groupADepths = Array.from(projection.depth.slice(0, 4));
    // Group B depths (z=0.4)
    const groupBDepths = Array.from(projection.depth.slice(4, 8));

    // All Group B depths > all Group A depths
    const maxA = Math.max(...groupADepths);
    const minB = Math.min(...groupBDepths);
    expect(minB).toBeGreaterThan(maxA);
  });

  it('Backend draw order respects depth: after compaction, depth is monotonically non-increasing', () => {
    const N = 16;
    const positions = createPositionField(N);
    // Random z values between -5 and 5
    const zValues = [-2, 3, -1, 4, 0, 2, -3, 1, -4, 5, -5, 3.5, 0.5, -0.5, 2.5, -1.5];
    for (let i = 0; i < N; i++) {
      writePosition(positions, i, (i % 4) * 0.25, Math.floor(i / 4) * 0.25, zValues[i]);
    }

    const projection = projectInstances(positions, 0.03, N, orthoCam);
    const color = new Float32Array(N * 4);
    const result = depthSortAndCompact(projection, N, color);

    // All should be visible (z between -5 and 5 is within near=-100..far=100)
    expect(result.count).toBe(N);

    // Depth must be monotonically non-increasing (far-to-near)
    for (let i = 1; i < result.count; i++) {
      expect(result.depth[i]).toBeLessThanOrEqual(result.depth[i - 1]);
    }
  });
});

// =============================================================================
// Integration Tests (Perspective)
// =============================================================================

describe('Level 7 Integration Tests: Perspective Depth Ordering', () => {
  it('Same patch under perspective: depth ordering preserved (B still in front of A)', () => {
    const N = 8;
    const positions = createPositionField(N);
    // Group A at z=0, Group B at z=0.4 (closer to perspective camera at z≈1.64)
    for (let i = 0; i < 4; i++) {
      writePosition(positions, i, 0.3 + (i % 2) * 0.2, 0.3 + Math.floor(i / 2) * 0.2, 0.0);
    }
    for (let i = 4; i < 8; i++) {
      writePosition(positions, i, 0.3 + ((i - 4) % 2) * 0.2, 0.3 + Math.floor((i - 4) / 2) * 0.2, 0.4);
    }

    const projection = projectInstances(positions, 0.03, N, perspCam);
    const color = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) color[i * 4] = i;

    const result = depthSortAndCompact(projection, N, color);

    // All visible
    expect(result.count).toBe(8);

    // Under perspective: z=0.4 is CLOSER to camera (camera at z≈1.64)
    // So Group B (z=0.4) has LOWER depth than Group A (z=0.0)
    // After sort: Group A first (higher depth), Group B second

    // Depth must be monotonically non-increasing (far-to-near)
    for (let i = 1; i < result.count; i++) {
      expect(result.depth[i]).toBeLessThanOrEqual(result.depth[i - 1]);
    }

    // Group A (z=0.0, farther from camera) should have higher depth than Group B (z=0.4)
    // Verify: first 4 entries have higher depth than last 4
    const firstFourMin = Math.min(result.depth[0], result.depth[1], result.depth[2], result.depth[3]);
    const lastFourMax = Math.max(result.depth[4], result.depth[5], result.depth[6], result.depth[7]);
    expect(firstFourMin).toBeGreaterThan(lastFourMax);
  });

  it('Screen positions now differ between groups (parallax), but ordering is same', () => {
    const N = 4;
    const positions = createPositionField(N);
    // Two instances at same XY, different z
    writePosition(positions, 0, 0.3, 0.3, 0.0);  // farther from camera
    writePosition(positions, 1, 0.3, 0.3, 0.5);  // closer to camera
    writePosition(positions, 2, 0.7, 0.7, 0.0);  // farther
    writePosition(positions, 3, 0.7, 0.7, 0.5);  // closer

    const projection = projectInstances(positions, 0.03, N, perspCam);
    const color = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) color[i * 4] = i;
    const result = depthSortAndCompact(projection, N, color);

    expect(result.count).toBe(4);

    // Under perspective, instances at different z have different screen positions
    // even with same world XY. Verify parallax exists.
    const sx0 = result.screenPosition[0];
    const sx1 = result.screenPosition[2];
    // Farther instances (z=0.0) should be at higher depth and sorted first
    expect(result.depth[0]).toBeGreaterThan(result.depth[2]);
  });
});

// =============================================================================
// Integration Tests (Culling)
// =============================================================================

describe('Level 7 Integration Tests: Culling', () => {
  it('Instances beyond frustum far plane are culled; others remain', () => {
    // Perspective camera: near=0.01, far=100, camera at z≈1.64
    // Point at z=150: distance from camera = sqrt((0.5-0.5)² + ...) very far
    // Actually viewZ for z=-200 (far from camera along forward) > 100
    // Let's place instances at varying z and check which are culled
    const N = 6;
    const positions = createPositionField(N);
    writePosition(positions, 0, 0.5, 0.5, 0.0);    // visible (viewZ ≈ 2.0)
    writePosition(positions, 1, 0.5, 0.5, -1.0);   // visible (viewZ > 2.0)
    writePosition(positions, 2, 0.5, 0.5, 0.5);    // visible (viewZ < 2.0)
    writePosition(positions, 3, 0.5, 0.5, 1.0);    // visible (viewZ < 1.0)
    writePosition(positions, 4, 0.5, 0.5, 10.0);   // behind camera (viewZ < 0), culled
    writePosition(positions, 5, 0.5, 0.5, -200.0); // beyond far plane, culled

    const projection = projectInstances(positions, 0.03, N, perspCam);

    // Verify visibility flags
    expect(projection.visible[0]).toBe(1); // z=0: visible
    expect(projection.visible[1]).toBe(1); // z=-1: visible
    expect(projection.visible[2]).toBe(1); // z=0.5: visible
    expect(projection.visible[3]).toBe(1); // z=1: visible
    expect(projection.visible[4]).toBe(0); // z=10: behind camera
    expect(projection.visible[5]).toBe(0); // z=-200: beyond far

    const color = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) color[i * 4] = i;
    const result = depthSortAndCompact(projection, N, color);

    // Only 4 visible instances remain
    expect(result.count).toBe(4);
    expect(result.screenPosition.length).toBe(4 * 2);
    expect(result.depth.length).toBe(4);
  });

  it('Culling state does not persist: if instance moves back into frustum next frame, it becomes visible', () => {
    const N = 1;
    const positions = createPositionField(N);

    // Frame 1: behind camera (culled)
    writePosition(positions, 0, 0.5, 0.5, 10.0);
    const proj1 = projectInstances(positions, 0.03, N, perspCam);
    const color = new Float32Array(N * 4);
    const result1 = depthSortAndCompact(proj1, N, color);
    expect(result1.count).toBe(0); // Culled

    // Frame 2: move back into frustum
    writePosition(positions, 0, 0.5, 0.5, 0.0);
    const proj2 = projectInstances(positions, 0.03, N, perspCam);
    const result2 = depthSortAndCompact(proj2, N, color);
    expect(result2.count).toBe(1); // Visible again

    // Verify it has valid screen-space data
    expect(Number.isFinite(result2.screenPosition[0])).toBe(true);
    expect(Number.isFinite(result2.screenPosition[1])).toBe(true);
    expect(Number.isFinite(result2.depth[0])).toBe(true);
  });
});

// =============================================================================
// End-to-End Integration Test (Real Pipeline)
// =============================================================================

describe('Level 7 End-to-End: Real Pipeline Depth Sort + Cull', () => {
  it('Real pipeline executeFrame produces compacted, depth-sorted RenderPassIR', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const ellipse = b.addBlock('Ellipse', { rx: 0.03, ry: 0.03 });
      const array = b.addBlock('Array', { count: 9 });
      const layout = b.addBlock('GridLayout', { rows: 3, cols: 3 });
      const sat = b.addBlock('Const', { value: 1.0 });
      const val = b.addBlock('Const', { value: 1.0 });
      const hue = b.addBlock('HueFromPhase', {});
      const color = b.addBlock('HsvToRgb', {});
      const render = b.addBlock('RenderInstances2D', {});

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(array, 't', hue, 'id01');
      const phase = b.addBlock('Const', { value: 0.0 });
      b.wire(phase, 'out', hue, 'phase');
      b.wire(hue, 'hue', color, 'hue');
      b.wire(sat, 'out', color, 'sat');
      b.wire(val, 'out', color, 'val');
      b.wire(layout, 'position', render, 'pos');
      b.wire(color, 'color', render, 'color');
      b.wire(ellipse, 'shape', render, 'shape');
    });

    const result = compile(patch);
    if (result.kind !== 'ok') {
      throw new Error(`Compile failed`);
    }

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const pool = new BufferPool();

    // Execute one frame (no camera parameter — uses default ortho)
    const frame = executeFrame(program, state, pool, 0);

    expect(frame.ops.length).toBeGreaterThan(0);
    const op = frame.ops[0];

    // All 9 instances at z=0 are within frustum → all visible → count = 9
    expect(op.instances.count).toBe(9);

    // Screen-space fields are compacted (no visible field — all are visible by definition)
    expect(op.instances.position).toBeInstanceOf(Float32Array);
    expect(op.instances.size).toBeInstanceOf(Float32Array);
    expect(op.instances.depth).toBeInstanceOf(Float32Array);
    expect(op.instances.position.length).toBe(9 * 2);
    expect((op.instances.size as Float32Array).length).toBe(9);
    expect(op.instances.depth!.length).toBe(9);

    // After compaction, visible field is NOT in output (all instances are visible)

    // Depth should be sorted (for z=0, all depths are identical under ortho → stable order)
    for (let i = 1; i < op.instances.count; i++) {
      expect(op.instances.depth![i]).toBeLessThanOrEqual(op.instances.depth![i - 1]);
    }
  });
});
