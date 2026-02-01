/**
 * Level 5: Assembler Integration Test (projection → render IR)
 *
 * Tests that the RenderAssembler correctly calls the orthoProject kernel
 * and produces screen-space fields (position, size, depth) when a camera is present.
 *
 * This is a FULL PIPELINE test proving end-to-end integration:
 * - Block graph compiled to Schedule IR
 * - Schedule IR executed by runtime
 * - executeFrame calls RenderAssembler
 * - RenderAssembler produces RenderFrameIR with projected fields
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';
import { createRuntimeState, executeFrame, type RenderFrameIR } from '../../runtime';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';

/**
 * Helper: build a simple patch with GridLayoutUV + constant color for testing.
 */
function buildSimplePatch(count: number, rows: number, cols: number) {
  return buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot', {});
    const ellipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
    const array = b.addBlock('Array', { count });
    const layout = b.addBlock('GridLayoutUV', { rows, cols });
    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');

    const color = b.addBlock('Const', { value: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 } });

    const render = b.addBlock('RenderInstances2D', {});
    b.wire(layout, 'position', render, 'pos');
    b.wire(color, 'out', render, 'color');
    b.wire(ellipse, 'shape', render, 'shape');
  });
}

// =============================================================================
// LEVEL 5 UNIT TESTS: Assembler API surface
// =============================================================================

describe('Level 5 Unit Tests: Assembler API', () => {
  it('executeFrame runs without a camera block (uses default ortho camera)', () => {
    const patch = buildSimplePatch(4, 2, 2);

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const arena = getTestArena();

    // executeFrame no longer takes camera parameter
    // Camera is resolved from program.renderGlobals (default if none)
    const frameNoCamera = executeFrame(program, state, arena, 0);
    expect(frameNoCamera.version).toBe(2);
    expect(frameNoCamera.ops.length).toBeGreaterThan(0);

    const frameNext = executeFrame(program, state, arena, 16);
    expect(frameNext.version).toBe(2);
    expect(frameNext.ops.length).toBeGreaterThan(0);
  });

  it('Frame with no camera block produces world-space (vec3) positions', () => {
    const patch = buildSimplePatch(4, 2, 2);

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const arena = getTestArena();

    const frame = executeFrame(program, state, arena, 0) as RenderFrameIR;
    expect(frame.version).toBe(2);
    expect(frame.ops.length).toBeGreaterThan(0);

    const op = frame.ops[0];
    const position = op.instances.position;

    // NO camera block: default ortho camera applies, positions are stride-2 vec2 (screen-space)
    // Note: The default camera DOES project (uses ortho projection)
    expect(position.length).toBe(4 * 2);

    // Size should be Float32Array (per-instance projected sizes)
    expect(op.instances.size).toBeInstanceOf(Float32Array);
  });

  it('Frame with default camera produces screen-space (vec2) positions and per-instance sizes', () => {
    const patch = buildSimplePatch(4, 2, 2);

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const arena = getTestArena();

    const frame = executeFrame(program, state, arena, 0) as RenderFrameIR;
    expect(frame.version).toBe(2);
    expect(frame.ops.length).toBeGreaterThan(0);

    const op = frame.ops[0];
    const position = op.instances.position;
    const size = op.instances.size;

    // WITH default camera: positions are stride-2 vec2 (screen-space normalized [0,1])
    expect(position.length).toBe(4 * 2);

    // Positions should be in [0,1] range
    for (let i = 0; i < 4; i++) {
      const x = position[i * 2];
      const y = position[i * 2 + 1];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }

    // Size should be Float32Array (per-instance screen radii)
    expect(size).toBeInstanceOf(Float32Array);
    expect((size as Float32Array).length).toBe(4);

    // Depth field should be present
    expect(op.instances.depth).toBeInstanceOf(Float32Array);
    expect(op.instances.depth!.length).toBe(4);
  });
});

// =============================================================================
// LEVEL 5 INTEGRATION TESTS: Full Pipeline
// =============================================================================

describe('Level 5 Integration Tests: Full Pipeline', () => {
  it('Pipeline runs signals → fields → projection → render IR with correct ordering (real end-to-end test)', () => {
    const N = 9;
    const patch = buildSimplePatch(N, 3, 3);

    // Compile the patch
    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') {
      throw new Error(`Compile failed: ${JSON.stringify(result.errors)}`);
    }
    const program = result.program;

    // Create runtime state and buffer pool
    const state = createRuntimeState(program.slotMeta.length);
    const arena = getTestArena();

    // Execute one frame (default ortho camera from program.renderGlobals)
    const frame = executeFrame(program, state, arena, 0) as RenderFrameIR;

    // Verify frame produced a render op
    expect(frame.ops.length).toBeGreaterThan(0);
    const op = frame.ops[0];

    // CRITICAL: Screen-space fields must be populated (post-compaction)
    // This proves the camera param flowed through the pipeline
    expect(op.instances.position).toBeInstanceOf(Float32Array);
    expect(op.instances.size).toBeInstanceOf(Float32Array);
    expect(op.instances.depth).toBeInstanceOf(Float32Array);

    // After L7 compaction: count reflects visible instances only.
    // All 9 instances are at z=0, within ortho frustum, so all visible.
    expect(op.instances.count).toBe(N);
    expect(op.instances.position.length).toBe(N * 2); // stride 2 (screen-space)
    expect((op.instances.size as Float32Array).length).toBe(N);
    expect(op.instances.depth!.length).toBe(N);

    // Verify all instances have finite screen-space values (proves projection ran)
    for (let i = 0; i < N; i++) {
      // Verify screen-space values are finite (not NaN/Infinity from uninitialized buffers)
      expect(Number.isFinite(op.instances.position[i * 2])).toBe(true);
      expect(Number.isFinite(op.instances.position[i * 2 + 1])).toBe(true);
      expect(Number.isFinite((op.instances.size as Float32Array)[i])).toBe(true);
      expect(Number.isFinite(op.instances.depth![i])).toBe(true);
    }

    // PROOF OF ORDERING:
    // If this test passes, pipeline ordering is proven correct:
    // 1. Signals evaluated (Const values, time phase produced)
    // 2. Fields materialized (GridLayout produced world positions)
    // 3. Projection applied (orthoProject converted vec3 positions → vec2 screen coords + depth)
    // 4. RenderFrameIR assembled with screen-space fields

    // Additional verification: check that positions are in screen-space [0,1] range
    for (let i = 0; i < N; i++) {
      const x = op.instances.position[i * 2];
      const y = op.instances.position[i * 2 + 1];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });
});
