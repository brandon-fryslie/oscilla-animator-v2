/**
 * Steel Thread Test - Animated Particles
 *
 * Tests the minimal viable pipeline:
 * time → domain → fields → render
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import {
  createRuntimeState,
  BufferPool,
  executeFrame,
} from '../../runtime';

describe('Steel Thread - Animated Particles', () => {
  it('should compile and execute the minimal animated particles patch', () => {
    // Build the patch
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', { periodMs: 5000 });
      const domain = b.addBlock('DomainN', { n: 100, seed: 42 });
      const id01 = b.addBlock('FieldFromDomainId', {});
      const centerX = b.addBlock('ConstFloat', { value: 0.5 });
      const centerY = b.addBlock('ConstFloat', { value: 0.5 });
      const radius = b.addBlock('ConstFloat', { value: 0.35 });
      const spin = b.addBlock('ConstFloat', { value: 0.5 });

      // Position from composable primitives
      const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });
      const angularOffset = b.addBlock('FieldAngularOffset', {});
      const totalAngle = b.addBlock('FieldAdd', {});
      const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});
      const pos = b.addBlock('FieldPolarToCartesian', {});

      const sat = b.addBlock('ConstFloat', { value: 1.0 });
      const val = b.addBlock('ConstFloat', { value: 1.0 });

      // Color from composable primitives
      const hue = b.addBlock('FieldHueFromPhase', {});
      const color = b.addBlock('HsvToRgb', {});

      const size = b.addBlock('ConstFloat', { value: 3 });
      const render = b.addBlock('RenderInstances2D', {});

      // Wire domain to blocks that need it
      b.wire(domain, 'domain', id01, 'domain');
      b.wire(domain, 'domain', render, 'domain');

      // Wire phase to position and color
      b.wire(time, 'phase', angularOffset, 'phase');
      b.wire(time, 'phase', hue, 'phase');

      // Wire id01 to position and color blocks
      b.wire(id01, 'id01', goldenAngle, 'id01');
      b.wire(id01, 'id01', angularOffset, 'id01');
      b.wire(id01, 'id01', hue, 'id01');
      b.wire(id01, 'id01', effectiveRadius, 'id01');

      // Wire spin to angular offset
      b.wire(spin, 'out', angularOffset, 'spin');

      // Wire golden angle + offset to total angle
      b.wire(goldenAngle, 'angle', totalAngle, 'a');
      b.wire(angularOffset, 'offset', totalAngle, 'b');

      // Wire center, radius, angle to polar to cartesian
      b.wire(centerX, 'out', pos, 'centerX');
      b.wire(centerY, 'out', pos, 'centerY');
      b.wire(radius, 'out', effectiveRadius, 'radius');
      b.wire(totalAngle, 'out', pos, 'angle');
      b.wire(effectiveRadius, 'radius', pos, 'radius');

      // Wire hue and sat/val to color
      b.wire(hue, 'hue', color, 'hue');
      b.wire(sat, 'out', color, 'sat');
      b.wire(val, 'out', color, 'val');

      // Wire pos, color, size to render
      b.wire(pos, 'pos', render, 'pos');
      b.wire(color, 'color', render, 'color');
      b.wire(size, 'out', render, 'size');
    });

    // Compile the patch
    const result = compile(patch);

    // Should compile successfully
    if (result.kind !== 'ok') {
      console.error('Compile errors:', JSON.stringify(result.errors, null, 2));
      throw new Error(`Compile failed: ${JSON.stringify(result.errors)}`);
    }

    const program = result.program;

    // Verify the program structure
    const schedule = program.schedule as any;
    expect(schedule.timeModel.kind).toBe('infinite');
    expect(schedule.domains.size).toBe(1);
    expect(schedule.steps.length).toBeGreaterThan(0);

    // Check we have a render step
    const renderSteps = schedule.steps.filter((s: any) => s.kind === 'render');
    expect(renderSteps.length).toBe(1);

    // Execute a frame
    const pool = new BufferPool();
    const state = createRuntimeState(program.slotMeta.length);

    const frame = executeFrame(program, state, pool, 0);

    // Verify frame structure
    expect(frame.version).toBe(1);
    expect(frame.passes.length).toBe(1);

    const pass = frame.passes[0];
    expect(pass.kind).toBe('instances2d');
    expect(pass.count).toBe(100);
    expect(pass.position).toBeInstanceOf(Float32Array);
    expect(pass.color).toBeInstanceOf(Uint8ClampedArray);

    // Verify position buffer has correct size
    const posBuffer = pass.position as Float32Array;
    expect(posBuffer.length).toBe(100 * 2); // 100 particles, 2 floats per position

    // Verify color buffer has correct size
    const colorBuffer = pass.color as Uint8ClampedArray;
    expect(colorBuffer.length).toBe(100 * 4); // 100 particles, 4 bytes per color (RGBA)

    // Verify size buffer has correct size (per-element field, not uniform)
    const sizeBuffer = pass.size as Float32Array;
    expect(sizeBuffer).toBeInstanceOf(Float32Array);
    expect(sizeBuffer.length).toBe(100); // 100 particles, 1 float per particle

    // Verify positions are in valid range
    for (let i = 0; i < 100; i++) {
      const x = posBuffer[i * 2 + 0];
      const y = posBuffer[i * 2 + 1];
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(2);
      expect(y).toBeGreaterThanOrEqual(-1);
      expect(y).toBeLessThanOrEqual(2);
    }

    // Verify colors are valid RGBA
    for (let i = 0; i < 100; i++) {
      const r = colorBuffer[i * 4 + 0];
      const g = colorBuffer[i * 4 + 1];
      const b = colorBuffer[i * 4 + 2];
      const a = colorBuffer[i * 4 + 3];
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(255);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
      expect(a).toBe(255); // Full opacity
    }

    // Execute another frame at t=1000ms to verify animation
    const frame2 = executeFrame(program, state, pool, 1000);
    const pos2 = frame2.passes[0].position as Float32Array;

    // Positions should be different from frame 1
    let hasDifference = false;
    for (let i = 0; i < 100; i++) {
      if (
        Math.abs(posBuffer[i * 2 + 0] - pos2[i * 2 + 0]) > 0.001 ||
        Math.abs(posBuffer[i * 2 + 1] - pos2[i * 2 + 1]) > 0.001
      ) {
        hasDifference = true;
        break;
      }
    }
    expect(hasDifference).toBe(true);
  });
});
