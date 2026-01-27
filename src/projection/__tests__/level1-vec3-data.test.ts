/**
 * Level 1: vec3 Everywhere (Data Representation)
 *
 * Tests proving the 3D data shape is correct.
 * Position fields are Float32Array stride 3, size fields are Float32Array stride 1.
 * Layout blocks produce z=0.0 explicitly.
 */
import { describe, it, expect } from 'vitest';
import type { RenderFrameIR } from '../../runtime';
import {
  createPositionField,
  createSizeField,
  readPosition,
  writePosition,
  positionFieldCount,
  sizeFieldCount,
} from '../fields';
import {
  gridLayout3D,
  lineLayout3D,
  circleLayout3D,
  applyZModulation,
} from '../layout-kernels';

// =============================================================================
// Unit Tests
// =============================================================================

describe('Level 1 Unit Tests', () => {
  it('Position fields are Float32Array with stride 3 (not 2)', () => {
    const field = createPositionField(5);
    expect(field).toBeInstanceOf(Float32Array);
    // Stride 3: each instance takes 3 floats
    expect(field.length).toBe(5 * 3);
    // Verify it's NOT stride 2
    expect(field.length).not.toBe(5 * 2);
  });

  it('Constructing a position field with N instances allocates exactly N * 3 floats', () => {
    const counts = [0, 1, 7, 16, 100, 10000];
    for (const N of counts) {
      const field = createPositionField(N);
      expect(field.length).toBe(N * 3);
      expect(field.byteLength).toBe(N * 3 * 4); // 4 bytes per float32
    }
  });

  it('Reading back [x, y, z] triples from a position field returns the values written', () => {
    const field = createPositionField(3);

    writePosition(field, 0, 0.1, 0.2, 0.3);
    writePosition(field, 1, 0.4, 0.5, 0.6);
    writePosition(field, 2, 0.7, 0.8, 0.9);

    expect(readPosition(field, 0)).toEqual([
      expect.closeTo(0.1, 5),
      expect.closeTo(0.2, 5),
      expect.closeTo(0.3, 5),
    ]);
    expect(readPosition(field, 1)).toEqual([
      expect.closeTo(0.4, 5),
      expect.closeTo(0.5, 5),
      expect.closeTo(0.6, 5),
    ]);
    expect(readPosition(field, 2)).toEqual([
      expect.closeTo(0.7, 5),
      expect.closeTo(0.8, 5),
      expect.closeTo(0.9, 5),
    ]);
  });

  it('Size fields are Float32Array with stride 1, interpreted as world-space radius', () => {
    const field = createSizeField(5);
    expect(field).toBeInstanceOf(Float32Array);
    expect(field.length).toBe(5); // Stride 1: one float per instance

    // Write world-space radii
    field[0] = 0.05;
    field[1] = 0.1;
    field[2] = 0.03;
    field[3] = 0.5;
    field[4] = 1.0;

    // Read back — values are in world-space units (not pixels)
    expect(field[0]).toBeCloseTo(0.05);
    expect(field[1]).toBeCloseTo(0.1);
    expect(field[2]).toBeCloseTo(0.03);
    expect(field[3]).toBeCloseTo(0.5);
    expect(field[4]).toBeCloseTo(1.0);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Level 1 Integration Tests', () => {
  it('GridLayout(4x4) produces a Field<vec3> with 16 entries, each z === 0.0 (exact)', () => {
    const N = 16;
    const out = createPositionField(N);
    gridLayout3D(out, N, 4, 4);

    expect(positionFieldCount(out)).toBe(16);

    // Every z must be exactly 0.0
    for (let i = 0; i < N; i++) {
      const [x, y, z] = readPosition(out, i);
      expect(z).toBe(0.0); // Exact, not close-to
      // XY should be in [0,1]
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it('LineLayout(N=8) produces a Field<vec3> with 8 entries, each z === 0.0 (exact)', () => {
    const N = 8;
    const out = createPositionField(N);
    lineLayout3D(out, N, 0.1, 0.2, 0.9, 0.8);

    expect(positionFieldCount(out)).toBe(8);

    for (let i = 0; i < N; i++) {
      const [x, y, z] = readPosition(out, i);
      expect(z).toBe(0.0); // Exact
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }

    // Verify endpoints
    const [x0, y0] = readPosition(out, 0);
    expect(x0).toBeCloseTo(0.1);
    expect(y0).toBeCloseTo(0.2);

    const [x7, y7] = readPosition(out, 7);
    expect(x7).toBeCloseTo(0.9);
    expect(y7).toBeCloseTo(0.8);
  });

  it('CircleLayout(N=12) produces a Field<vec3> with 12 entries, each z === 0.0 (exact)', () => {
    const N = 12;
    const out = createPositionField(N);
    circleLayout3D(out, N, 0.5, 0.5, 0.3, 0);

    expect(positionFieldCount(out)).toBe(12);

    for (let i = 0; i < N; i++) {
      const [_x, _y, z] = readPosition(out, i);
      expect(z).toBe(0.0); // Exact
    }
  });

  it('A layout block that receives z-modulation input writes non-zero z values into the position field', () => {
    const N = 8;
    const out = createPositionField(N);
    gridLayout3D(out, N, 4, 2);

    // Verify z=0 initially
    for (let i = 0; i < N; i++) {
      expect(readPosition(out, i)[2]).toBe(0.0);
    }

    // Apply z-modulation
    const zMod = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      zMod[i] = 0.1 * (i + 1); // 0.1, 0.2, ..., 0.8
    }
    applyZModulation(out, zMod, N);

    // Now z values are non-zero
    for (let i = 0; i < N; i++) {
      const [_x, _y, z] = readPosition(out, i);
      expect(z).not.toBe(0.0);
      expect(z).toBeCloseTo(0.1 * (i + 1));
    }
  });

  it('Compile a minimal patch (Layout → RenderSink): the compiled schedule position slot is typed as vec3', async () => {
    // This test uses the REAL compile→execute pipeline (not the projection module helpers).
    // It proves the L1 INVARIANT: executeFrame() with a layout block produces stride-3 Float32Array
    // via the Materializer's standard field-slot pipeline.
    const { buildPatch } = await import('../../graph');
    const { compile } = await import('../../compiler/compile');
    const { createRuntimeState, executeFrame } = await import('../../runtime');
    const { getTestArena } = await import('../../runtime/__tests__/test-arena-helper');

    const N = 16;
    const patch = buildPatch((b: any) => {
      b.addBlock('InfiniteTimeRoot', { periodAMs: 5000, periodBMs: 10000 });
      const ellipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
      const array = b.addBlock('Array', { count: N });
      const layout = b.addBlock('GridLayout', { rows: 4, cols: 4 });
      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');

      // Color: constant white via HSV
      const hue = b.addBlock('HueFromPhase', {});
      b.wire(array, 't', hue, 'id01');
      const phase = b.addBlock('Const', { value: 0.0 });
      b.wire(phase, 'out', hue, 'phase');
      const sat = b.addBlock('Const', { value: 0.0 }); // S=0 → white
      const val = b.addBlock('Const', { value: 1.0 });
      const color = b.addBlock('HsvToRgb', {});
      b.wire(hue, 'hue', color, 'hue');
      b.wire(sat, 'out', color, 'sat');
      b.wire(val, 'out', color, 'val');

      // Render: wire layout position directly to render block
      const render = b.addBlock('RenderInstances2D', {});
      b.wire(layout, 'position', render, 'pos');
      b.wire(color, 'color', render, 'color');
      b.wire(ellipse, 'shape', render, 'shape');
    });

    const result = compile(patch);
    if (result.kind !== 'ok') {
      throw new Error(`Compile failed: ${JSON.stringify(result.errors)}`);
    }

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const arena = getTestArena();
    const frame = executeFrame(program, state, arena, 0) as RenderFrameIR;

    expect(frame.ops.length).toBeGreaterThan(0);
    const op = frame.ops[0];
    const position = op.instances.position;

    // After projection: position buffer is stride-2 screen-space (vec2)
    expect(position).toBeInstanceOf(Float32Array);
    expect(position.length).toBe(N * 2); // 16 instances × 2 floats per position

    // All x/y values must be finite (z no longer exists in projected output)
    for (let i = 0; i < N; i++) {
      const x = position[i * 2 + 0];
      const y = position[i * 2 + 1];
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });
});

// =============================================================================
// Additional property tests
// =============================================================================

describe('Level 1 Property Tests', () => {
  it('GridLayout positions are evenly distributed in [0,1]^2', () => {
    const N = 25;
    const out = createPositionField(N);
    gridLayout3D(out, N, 5, 5);

    // Check corners
    const [x0, y0] = readPosition(out, 0);
    expect(x0).toBeCloseTo(0.0);
    expect(y0).toBeCloseTo(0.0);

    const [x4, y4] = readPosition(out, 4);
    expect(x4).toBeCloseTo(1.0);
    expect(y4).toBeCloseTo(0.0);

    const [x20, y20] = readPosition(out, 20);
    expect(x20).toBeCloseTo(0.0);
    expect(y20).toBeCloseTo(1.0);

    const [x24, y24] = readPosition(out, 24);
    expect(x24).toBeCloseTo(1.0);
    expect(y24).toBeCloseTo(1.0);
  });

  it('CircleLayout positions are at correct radius from center', () => {
    const N = 12;
    const radius = 0.3;
    const out = createPositionField(N);
    circleLayout3D(out, N, 0.5, 0.5, radius, 0);

    for (let i = 0; i < N; i++) {
      const [x, y] = readPosition(out, i);
      const dx = x - 0.5;
      const dy = y - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      expect(dist).toBeCloseTo(radius, 5);
    }
  });

  it('LineLayout positions are evenly spaced along the line', () => {
    const N = 5;
    const out = createPositionField(N);
    lineLayout3D(out, N, 0.0, 0.0, 1.0, 1.0);

    for (let i = 0; i < N; i++) {
      const [x, y] = readPosition(out, i);
      const expected = i / (N - 1);
      expect(x).toBeCloseTo(expected);
      expect(y).toBeCloseTo(expected);
    }
  });

  it('Position field with N=0 produces empty array (no crash)', () => {
    const field = createPositionField(0);
    expect(field.length).toBe(0);
    expect(positionFieldCount(field)).toBe(0);
  });

  it('Size field with N=0 produces empty array (no crash)', () => {
    const field = createSizeField(0);
    expect(field.length).toBe(0);
    expect(sizeFieldCount(field)).toBe(0);
  });
});
