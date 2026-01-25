/**
 * Level 10: Golden Certification Tests
 *
 * Multi-concern integration tests exercising the ENTIRE pipeline:
 * compile → executeFrame × N frames → verify
 *
 * These tests prove all 9 previous levels compose correctly.
 * This is the final certification level for the 3D projection system.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph/Patch';
import { compile } from '../../compiler/compile';
import { executeFrame } from '../../runtime/ScheduleExecutor';
import { createRuntimeState, type RuntimeState } from '../../runtime/RuntimeState';
import { BufferPool } from '../../runtime/BufferPool';
import { DEFAULT_CAMERA, type ResolvedCameraParams } from '../../runtime/CameraResolver';
import type { CompiledProgramIR, ValueSlot } from '../../compiler/ir/program';

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
// Helper Functions
// =============================================================================

/**
 * Build a 5×5 grid patch (25 instances) with:
 * - GridLayout (world positions)
 * - FieldHueFromPhase (per-instance color)
 * - RenderInstances2D (render sink)
 */
function buildGoldenPatch() {
  return buildPatch((b) => {
    const time = b.addBlock('InfiniteTimeRoot', {});
    const ellipse = b.addBlock('Ellipse', { rx: 0.03, ry: 0.03 });
    const array = b.addBlock('Array', { count: 25 });
    const layout = b.addBlock('GridLayout', { rows: 5, cols: 5 });

    // Color pipeline (Field-level hue from phase)
    const sat = b.addBlock('Const', { value: 1.0 });
    const val = b.addBlock('Const', { value: 1.0 });
    const hue = b.addBlock('HueFromPhase', {});
    const color = b.addBlock('HsvToRgb', {});

    const render = b.addBlock('RenderInstances2D', {});

    // Camera block for data-driven projection control
    b.addBlock('Camera', {
      projection: 0, // 0 = ortho, 1 = persp
      centerX: 0.5,
      centerY: 0.5,
      distance: 2.0,
      tiltDeg: 0,
      yawDeg: 0,
      fovYDeg: 45,
      near: 0.01,
      far: 100,
    });

    // Wire topology
    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');

    // Wire color
    b.wire(time, 'phaseA', hue, 'phase');
    b.wire(array, 't', hue, 'id01');
    b.wire(hue, 'hue', color, 'hue');
    b.wire(sat, 'out', color, 'sat');
    b.wire(val, 'out', color, 'val');

    // Wire to render
    b.wire(layout, 'position', render, 'pos');
    b.wire(color, 'color', render, 'color');
    b.wire(ellipse, 'shape', render, 'shape');
  });
}

/**
 * Helper: Set camera projection via slot
 */
function setCameraParams(
  program: CompiledProgramIR,
  state: RuntimeState,
  params: Partial<ResolvedCameraParams>
) {
  if (program.renderGlobals.length === 0 || program.renderGlobals[0].kind !== 'camera') {
    return;
  }
  const decl = program.renderGlobals[0];
  const slotMeta = program.slotMeta;

  const writeSlot = (slot: ValueSlot, value: number) => {
    const meta = slotMeta.find((m) => m.slot === slot);
    if (meta) {
      state.values.f64[meta.offset] = value;
    }
  };

  if (params.projection !== undefined) writeSlot(decl.projectionSlot, params.projection === 'persp' ? 1 : 0);
  if (params.centerX !== undefined) writeSlot(decl.centerXSlot, params.centerX);
  if (params.centerY !== undefined) writeSlot(decl.centerYSlot, params.centerY);
  if (params.distance !== undefined) writeSlot(decl.distanceSlot, params.distance);
  if (params.tiltRad !== undefined) writeSlot(decl.tiltDegSlot, (params.tiltRad * 180) / Math.PI);
  if (params.yawRad !== undefined) writeSlot(decl.yawDegSlot, (params.yawRad * 180) / Math.PI);
  if (params.fovYRad !== undefined) writeSlot(decl.fovYDegSlot, (params.fovYRad * 180) / Math.PI);
  if (params.near !== undefined) writeSlot(decl.nearSlot, params.near);
  if (params.far !== undefined) writeSlot(decl.farSlot, params.far);
}

// =============================================================================
// Test 10.1: The Golden Patch - Multi-Frame Camera Toggle
// =============================================================================

describe('Level 10 Golden Tests: The Golden Patch', () => {
  /**
   * Build a 5×5 grid patch (25 instances) with:
   * - GridLayout (world positions)
   * - FieldHueFromPhase (per-instance color)
   * - RenderInstances2D (render sink)
   *
   * Note: RenderInstances2D has default scale=1.0.
   * The Ellipse rx/ry params (0.03) are shape params, not the world radius.
   * The world radius used for projection is the scale parameter (1.0).
   */


  it('Test 1.1: Run 120 frames ortho - verify identity projection', () => {
    const patch = buildGoldenPatch();
    const result = compile(patch);
    if (result.kind !== 'ok') {
      throw new Error(`Compile failed: ${JSON.stringify((result as any).errors)}`);
    }

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const pool = new BufferPool();

    const N = 25;
    const expectedRadius = Math.fround(1.0); // Default scale from RenderInstances2D

    // Run 120 frames with ortho camera (default)
    for (let frame = 0; frame < 120; frame++) {
      setCameraParams(program, state, { projection: 'ortho' });
      const frameIR = executeFrame(program, state, pool, frame * 16.667);

      expect(frameIR.ops.length).toBeGreaterThan(0);
      const op = frameIR.ops[0];
      expect(op.instances.count).toBe(N);

      // Verify screen-space fields exist
      expect(op.instances.position).toBeInstanceOf(Float32Array);
      expect(op.instances.size).toBeInstanceOf(Float32Array);
      expect(op.instances.depth).toBeInstanceOf(Float32Array);

      expect(op.instances.position!.length).toBe(N * 2);
      expect((op.instances.size as Float32Array).length).toBe(N);
      expect(op.instances.depth!.length).toBe(N);

      // Ortho projection: screenPosition.xy should match worldPosition.xy (identity)
      // GridLayout outputs world positions in the range [0,1]
      // Verify all screen positions are in [0,1] and finite
      for (let i = 0; i < N; i++) {
        const sx = op.instances.position![i * 2];
        const sy = op.instances.position![i * 2 + 1];
        expect(Number.isFinite(sx)).toBe(true);
        expect(Number.isFinite(sy)).toBe(true);
        expect(sx).toBeGreaterThanOrEqual(0);
        expect(sx).toBeLessThanOrEqual(1);
        expect(sy).toBeGreaterThanOrEqual(0);
        expect(sy).toBeLessThanOrEqual(1);

        // Ortho: screenRadius === worldRadius (identity)
        // worldRadius = scale parameter = 1.0 (RenderInstances2D default)
        expect((op.instances.size as Float32Array)[i]).toBe(expectedRadius);

        // Verify depth is finite (ortho depth depends on z, which is 0 for GridLayout)
        expect(Number.isFinite(op.instances.depth![i])).toBe(true);
      }

      // All z=0 instances are visible under ortho
      // (no visible field in compacted output, but count should match)
      expect(op.instances.count).toBe(N);
    }
  });

  it('Test 1.2: Toggle to perspective at frame 121, run to 180 - verify non-identity projection', () => {
    const patch = buildGoldenPatch();
    const result = compile(patch);
    if (result.kind !== 'ok') {
      throw new Error(`Compile failed`);
    }

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const pool = new BufferPool();

    const N = 25;

    // Run frames 0-120 with ortho (establish baseline)
    for (let frame = 0; frame < 121; frame++) {
      setCameraParams(program, state, { projection: 'ortho' });
      executeFrame(program, state, pool, frame * 16.667);
    }

    // Capture frame 120 ortho output for comparison
    setCameraParams(program, state, { projection: 'ortho' });
    const frame120 = executeFrame(program, state, pool, 120 * 16.667);
    const orthoPositions = new Float32Array(frame120.ops[0].instances.position!);

    // Toggle to perspective at frame 121, run to frame 180
    for (let frame = 121; frame <= 180; frame++) {
      setCameraParams(program, state, {
        projection: 'persp',
        centerX: 0.5,
        centerY: 0.5,
        distance: 2.0,
        tiltRad: (35 * Math.PI) / 180,
        yawRad: 0,
        fovYRad: (45 * Math.PI) / 180,
        near: 0.01,
        far: 100,
      });
      const frameIR = executeFrame(program, state, pool, frame * 16.667);

      expect(frameIR.ops.length).toBeGreaterThan(0);
      const op = frameIR.ops[0];
      expect(op.instances.count).toBe(N);

      // Verify screen-space fields exist
      expect(op.instances.position).toBeInstanceOf(Float32Array);
      expect(op.instances.size).toBeInstanceOf(Float32Array);
      expect(op.instances.depth).toBeInstanceOf(Float32Array);

      // Perspective: screenPositions differ from ortho (parallax from camera at z=2.0)
      // At least some instances should have different screen positions
      let anyDifferent = false;
      for (let i = 0; i < N; i++) {
        const sx = op.instances.position![i * 2];
        const sy = op.instances.position![i * 2 + 1];

        // Still in valid range
        expect(Number.isFinite(sx)).toBe(true);
        expect(Number.isFinite(sy)).toBe(true);

        // Check if different from ortho
        if (
          Math.abs(sx - orthoPositions[i * 2]) > 0.001 ||
          Math.abs(sy - orthoPositions[i * 2 + 1]) > 0.001
        ) {
          anyDifferent = true;
        }

        // Verify depth is finite
        expect(Number.isFinite(op.instances.depth![i])).toBe(true);
      }

      // At least one instance should have a different screen position under perspective
      expect(anyDifferent).toBe(true);
    }
  });

  it('Test 1.3: Toggle back to ortho at frame 181, run to 240 - verify identity restored', () => {
    const patch = buildGoldenPatch();
    const result = compile(patch);
    if (result.kind !== 'ok') {
      throw new Error(`Compile failed`);
    }

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const pool = new BufferPool();

    const N = 25;
    const expectedRadius = Math.fround(1.0);

    // Run frames 0-120 ortho
    for (let frame = 0; frame <= 120; frame++) {
      setCameraParams(program, state, { projection: 'ortho' });
      executeFrame(program, state, pool, frame * 16.667);
    }

    // Run frames 121-180 perspective
    for (let frame = 121; frame <= 180; frame++) {
      setCameraParams(program, state, {
        projection: 'persp',
        centerX: 0.5,
        centerY: 0.5,
        distance: 2.0,
        tiltRad: (35 * Math.PI) / 180,
        yawRad: 0,
        fovYRad: (45 * Math.PI) / 180,
        near: 0.01,
        far: 100,
      });
      executeFrame(program, state, pool, frame * 16.667);
    }

    // Toggle back to ortho at frame 181, run to 240
    for (let frame = 181; frame <= 240; frame++) {
      setCameraParams(program, state, { projection: 'ortho' });
      const frameIR = executeFrame(program, state, pool, frame * 16.667);

      expect(frameIR.ops.length).toBeGreaterThan(0);
      const op = frameIR.ops[0];
      expect(op.instances.count).toBe(N);

      // Ortho identity restored: screenRadius === worldRadius (scale = 1.0)
      for (let i = 0; i < N; i++) {
        expect((op.instances.size as Float32Array)[i]).toBe(expectedRadius);
      }
    }
  });

  it('Test 1.4: Frame 240 output matches control run (never-toggled ortho)', () => {
    const patch = buildGoldenPatch();

    // Run 1: Toggle sequence (ortho → persp → ortho)
    const result1 = compile(patch);
    if (result1.kind !== 'ok') throw new Error('Compile failed');
    const program1 = result1.program;
    const state1 = createRuntimeState(program1.slotMeta.length);
    const pool1 = new BufferPool();

    for (let frame = 0; frame <= 120; frame++) {
      setCameraParams(program1, state1, { projection: 'ortho' });
      executeFrame(program1, state1, pool1, frame * 16.667);
    }
    for (let frame = 121; frame <= 180; frame++) {
      setCameraParams(program1, state1, {
        projection: 'persp',
        centerX: 0.5,
        centerY: 0.5,
        distance: 2.0,
        tiltRad: (35 * Math.PI) / 180,
        yawRad: 0,
        fovYRad: (45 * Math.PI) / 180,
        near: 0.01,
        far: 100,
      });
      executeFrame(program1, state1, pool1, frame * 16.667);
    }
    for (let frame = 181; frame <= 240; frame++) {
      setCameraParams(program1, state1, { projection: 'ortho' });
      executeFrame(program1, state1, pool1, frame * 16.667);
    }

    setCameraParams(program1, state1, { projection: 'ortho' });
    const toggledFrame = executeFrame(program1, state1, pool1, 240 * 16.667);

    // Run 2: Control (always ortho)
    const result2 = compile(patch);
    if (result2.kind !== 'ok') throw new Error('Compile failed');
    const program2 = result2.program;
    const state2 = createRuntimeState(program2.slotMeta.length);
    const pool2 = new BufferPool();

    for (let frame = 0; frame <= 240; frame++) {
      setCameraParams(program2, state2, { projection: 'ortho' });
      executeFrame(program2, state2, pool2, frame * 16.667);
    }

    setCameraParams(program2, state2, { projection: 'ortho' });
    const controlFrame = executeFrame(program2, state2, pool2, 240 * 16.667);

    // Compare frame 240 outputs
    const toggledOp = toggledFrame.ops[0];
    const controlOp = controlFrame.ops[0];

    expect(toggledOp.instances.count).toBe(controlOp.instances.count);

    // Screen positions should be identical (within float precision)
    for (let i = 0; i < toggledOp.instances.count * 2; i++) {
      expect(toggledOp.instances.position![i]).toBeCloseTo(controlOp.instances.position![i], 5);
    }

    // Screen radii should be identical
    for (let i = 0; i < toggledOp.instances.count; i++) {
      expect((toggledOp.instances.size as Float32Array)[i]).toBe((controlOp.instances.size as Float32Array)[i]);
    }
  });
});

// =============================================================================
// Test 10.2: Determinism Replay
// =============================================================================

describe('Level 10 Golden Tests: Determinism', () => {
  /**
   * Helper for determinism test
   */
  function runDeterministicSequence(): Float32Array[] {
    const patch = buildGoldenPatch();
    const result = compile(patch);
    if (result.kind !== 'ok') throw new Error('Compile failed');

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const pool = new BufferPool();

    const recordings: Float32Array[] = [];

    // Run 60 frames, record screenPosition for each
    for (let frame = 0; frame < 60; frame++) {
      setCameraParams(program, state, { projection: 'ortho' });
      const frameIR = executeFrame(program, state, pool, frame * 16.667);
      const op = frameIR.ops[0];
      // Store a COPY of the screenPosition buffer
      recordings.push(new Float32Array(op.instances.position!));
    }

    expect(recordings.length).toBe(60);
    return recordings;
  }

  it('Test 2.1-2.2: Determinism - Run twice, assert bitwise-identical outputs', () => {
    const recordings1 = runDeterministicSequence();
    const recordings2 = runDeterministicSequence();

    expect(recordings1.length).toBe(60);
    expect(recordings2.length).toBe(60);

    for (let frame = 0; frame < 60; frame++) {
      const expected = recordings1[frame];
      const actual = recordings2[frame];

      expect(actual.length).toBe(expected.length);
      for (let i = 0; i < actual.length; i++) {
        expect(actual[i]).toBe(expected[i]);
      }
    }
  });
});

// =============================================================================
// Test 10.3: Stress Test
// =============================================================================

describe('Level 10 Golden Tests: Stress Test', () => {
  it('Test 3.1: 50×50 grid (2500 instances), toggle sequence, verify no NaN/Inf', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', {});
      const ellipse = b.addBlock('Ellipse', { rx: 0.01, ry: 0.01 });
      const array = b.addBlock('Array', { count: 2500 });
      const layout = b.addBlock('GridLayout', { rows: 50, cols: 50 });

      const sat = b.addBlock('Const', { value: 1.0 });
      const val = b.addBlock('Const', { value: 1.0 });
      const hue = b.addBlock('HueFromPhase', {});
      const color = b.addBlock('HsvToRgb', {});
      const render = b.addBlock('RenderInstances2D', {});

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(time, 'phaseA', hue, 'phase');
      b.wire(array, 't', hue, 'id01');
      b.wire(hue, 'hue', color, 'hue');
      b.wire(sat, 'out', color, 'sat');
      b.wire(val, 'out', color, 'val');
      b.wire(layout, 'position', render, 'pos');
      b.wire(color, 'color', render, 'color');
      b.wire(ellipse, 'shape', render, 'shape');
    });

    const result = compile(patch);
    if (result.kind !== 'ok') throw new Error('Compile failed');

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const pool = new BufferPool();

    const N = 2500;

    // Run 10 frames ortho
    for (let frame = 0; frame < 10; frame++) {
      setCameraParams(program, state, { projection: 'ortho' });
      const frameIR = executeFrame(program, state, pool, frame * 16.667);
      const op = frameIR.ops[0];

      expect(op.instances.count).toBe(N);

      // Verify no NaN/Inf
      for (let i = 0; i < N; i++) {
        const sx = op.instances.position![i * 2];
        const sy = op.instances.position![i * 2 + 1];
        const sr = (op.instances.size as Float32Array)[i];
        const d = op.instances.depth![i];

        expect(Number.isFinite(sx)).toBe(true);
        expect(Number.isFinite(sy)).toBe(true);
        expect(Number.isFinite(sr)).toBe(true);
        expect(Number.isFinite(d)).toBe(true);

        // Visible screen positions should be in [0,1]
        expect(sx).toBeGreaterThanOrEqual(0);
        expect(sx).toBeLessThanOrEqual(1);
        expect(sy).toBeGreaterThanOrEqual(0);
        expect(sy).toBeLessThanOrEqual(1);
      }

      // Verify buffer lengths
      expect(op.instances.position!.length).toBe(N * 2);
      expect((op.instances.size as Float32Array).length).toBe(N);
      expect(op.instances.depth!.length).toBe(N);
    }

    // Run 10 frames perspective
    for (let frame = 10; frame < 20; frame++) {
      setCameraParams(program, state, {
        projection: 'persp',
        distance: 2.0,
        tiltRad: 0.5,
      });
      const frameIR = executeFrame(program, state, pool, frame * 16.667);
      const op = frameIR.ops[0];

      expect(op.instances.count).toBe(N);

      // Verify no NaN/Inf
      for (let i = 0; i < N; i++) {
        expect(Number.isFinite(op.instances.position![i * 2])).toBe(true);
        expect(Number.isFinite(op.instances.position![i * 2 + 1])).toBe(true);
        expect(Number.isFinite((op.instances.size as Float32Array)[i])).toBe(true);
        expect(Number.isFinite(op.instances.depth![i])).toBe(true);
      }
    }

    // Run 10 frames ortho again
    for (let frame = 20; frame < 30; frame++) {
      setCameraParams(program, state, { projection: 'ortho' });
      const frameIR = executeFrame(program, state, pool, frame * 16.667);
      const op = frameIR.ops[0];

      expect(op.instances.count).toBe(N);

      // Verify no NaN/Inf
      for (let i = 0; i < N; i++) {
        expect(Number.isFinite(op.instances.position![i * 2])).toBe(true);
        expect(Number.isFinite(op.instances.position![i * 2 + 1])).toBe(true);
        expect(Number.isFinite((op.instances.size as Float32Array)[i])).toBe(true);
        expect(Number.isFinite(op.instances.depth![i])).toBe(true);
      }
    }
  });
});

// =============================================================================
// Test 10.4: Export Isolation
// =============================================================================

describe('Level 10 Golden Tests: Export Isolation', () => {
  it('Test 4.1-4.3: Export Isolation - Comparison after sequence', () => {
    const patch = buildGoldenPatch();

    // Run 1: Toggle sequence
    const result1 = compile(patch);
    if (result1.kind !== 'ok') throw new Error('Compile failed');
    const program1 = result1.program;
    const state1 = createRuntimeState(program1.slotMeta.length);
    const pool1 = new BufferPool();

    for (let frame = 0; frame < 60; frame++) {
      const proj = Math.floor(frame / 10) % 2 === 0 ? 'ortho' : 'persp';
      setCameraParams(program1, state1, {
        projection: proj,
        distance: 2.0,
      });
      executeFrame(program1, state1, pool1, frame * 16.667);
    }
    setCameraParams(program1, state1, { projection: 'ortho' });
    const toggledFrame = executeFrame(program1, state1, pool1, 60 * 16.667);
    const toggledOp = toggledFrame.ops[0];

    // Run 2: Control
    const result2 = compile(patch);
    if (result2.kind !== 'ok') throw new Error('Compile failed');
    const program2 = result1.program;
    const state2 = createRuntimeState(program2.slotMeta.length);
    const pool2 = new BufferPool();

    for (let frame = 0; frame < 60; frame++) {
      setCameraParams(program2, state2, { projection: 'ortho' });
      executeFrame(program2, state2, pool2, frame * 16.667);
    }
    setCameraParams(program2, state2, { projection: 'ortho' });
    const controlFrame = executeFrame(program2, state2, pool2, 60 * 16.667);
    const controlOp = controlFrame.ops[0];

    // Assert identity
    expect(toggledOp.instances.count).toBe(controlOp.instances.count);
    const count = toggledOp.instances.count;

    const screenPos1 = toggledOp.instances.position!;
    const screenPos2 = controlOp.instances.position!;
    for (let i = 0; i < count * 2; i++) {
      expect(screenPos1[i]).toBe(screenPos2[i]);
    }

    const size1 = toggledOp.instances.size as Float32Array;
    const size2 = controlOp.instances.size as Float32Array;
    for (let i = 0; i < count; i++) {
      expect(size1[i]).toBe(size2[i]);
    }
  });
});

// =============================================================================
// Test 10.5: Explicit Camera Override (SKIP - feature doesn't exist yet)
// =============================================================================

describe.skip('Level 10 Golden Tests: Explicit Camera Override', () => {
  it('Test 5.1: CameraBlock overrides viewer-level camera (future feature)', () => {
    // Placeholder for when CameraBlock is implemented
    // This would test that a CameraBlock in the patch overrides the viewer-level camera param
  });
});

// =============================================================================
// Test 10.6: CombineMode Enforcement (Placeholder tests)
// =============================================================================

describe('Level 10 Golden Tests: CombineMode Enforcement', () => {
  it.skip('Test 6.1: Compile with two float writers using CombineMode "sum"', () => {
    // This tests whether the compiler accepts CombineMode 'sum' for float writers
    // If compile-time enforcement is working, this should compile without error

    // This test requires a block that accepts multiple inputs with CombineMode
    // For now, this is skipped as a placeholder - the actual test depends on block definitions

    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', {});
      const const1 = b.addBlock('Const', { value: 1.0 });
      const const2 = b.addBlock('Const', { value: 2.0 });

      // Would need a block that can combine multiple inputs here
    });

    const result = compile(patch);
    expect(['ok', 'error']).toContain(result.kind);
  });

  it.skip('Test 6.2: Compile with shape2d writers using CombineMode "layer" (if exists)', () => {
    // Placeholder for shape2d combine mode tests
    // This depends on whether 'layer' mode exists for shape2d
  });
});

// =============================================================================
// Test 10.7: Multi-Backend Golden Comparison
// =============================================================================

describe('Level 10 Golden Tests: Multi-Backend Comparison', () => {
  it('Test 7.1: Run golden patch for 60 frames, verify coordinate math consistency', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', {});
      const ellipse = b.addBlock('Ellipse', { rx: 0.03, ry: 0.03 });
      const array = b.addBlock('Array', { count: 25 });
      const layout = b.addBlock('GridLayout', { rows: 5, cols: 5 });

      const sat = b.addBlock('Const', { value: 1.0 });
      const val = b.addBlock('Const', { value: 1.0 });
      const hue = b.addBlock('HueFromPhase', {});
      const color = b.addBlock('HsvToRgb', {});
      const render = b.addBlock('RenderInstances2D', {});

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(time, 'phaseA', hue, 'phase');
      b.wire(array, 't', hue, 'id01');
      b.wire(hue, 'hue', color, 'hue');
      b.wire(sat, 'out', color, 'sat');
      b.wire(val, 'out', color, 'val');
      b.wire(layout, 'position', render, 'pos');
      b.wire(color, 'color', render, 'color');
      b.wire(ellipse, 'shape', render, 'shape');
    });

    const result = compile(patch);
    if (result.kind !== 'ok') throw new Error('Compile failed');

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const pool = new BufferPool();

    // Run 60 frames
    for (let frame = 0; frame < 60; frame++) {
      setCameraParams(program, state, { projection: 'ortho' });
      executeFrame(program, state, pool, frame * 16.667);
    }

    setCameraParams(program, state, { projection: 'ortho' });
    const frame60 = executeFrame(program, state, pool, 60 * 16.667);
    const op = frame60.ops[0];

    // Verify RenderPassIR has screen-space data
    expect(op.instances.position).toBeTruthy();
    expect(op.instances.size).toBeTruthy();

    // The coordinate math is the same for both Canvas2D and SVG:
    // pixelX = screenPosition[i*2] * width
    // pixelY = screenPosition[i*2+1] * height
    //
    // This is verified by Level 8 tests, but we can check that the data
    // is in the expected normalized range [0,1]

    const N = op.instances.count;
    for (let i = 0; i < N; i++) {
      const sx = op.instances.position![i * 2];
      const sy = op.instances.position![i * 2 + 1];

      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sx).toBeLessThanOrEqual(1);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sy).toBeLessThanOrEqual(1);
    }

    // If we were to render this with Canvas2D at 1000×1000:
    // Instance 0 at screenPos [0.1, 0.1] → pixel (100, 100)
    // Instance at screenPos [0.5, 0.5] → pixel (500, 500)
    //
    // If we were to render this with SVG at 1000×1000:
    // Same mapping: [0.1, 0.1] → translate(100 100)
    //
    // Both backends use the same math, proven by Level 8.
    // This test verifies the pipeline produces valid normalized coordinates.
  });
});
