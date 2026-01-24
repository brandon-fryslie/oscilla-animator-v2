/**
 * Steel Thread Test - Animated Particles
 *
 * Tests the minimal viable pipeline using three-stage block architecture:
 * Ellipse (shape) → Array (cardinality) → GridLayout (operation) → Render
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import type { ScheduleIR } from '../passes-v2/pass7-schedule';
import {
  createRuntimeState,
  BufferPool,
  executeFrame,
  type RenderFrameIR_Future,
  type DrawPathInstancesOp,
  type DrawPrimitiveInstancesOp,
} from '../../runtime';

describe('Steel Thread - Animated Particles', () => {
  it('should compile and execute the minimal animated particles patch', () => {
    // Build the patch using three-stage block architecture
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', { periodAMS: 5000, periodBMS: 10000 });

      // Three-stage architecture:
      // 1. Ellipse (shape) → Signal<shape>
      // 2. Array (cardinality) → Field<shape>
      // 3. GridLayout (operation) → Field<vec2>
      const ellipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
      const array = b.addBlock('Array', { count: 100 });
      const layout = b.addBlock('GridLayout', { rows: 10, cols: 10 });

      // Wire Ellipse → Array → GridLayout
      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      const centerX = b.addBlock('Const', { value: 0.5 });
      const centerY = b.addBlock('Const', { value: 0.5 });
      const radius = b.addBlock('Const', { value: 0.35 });
      const spin = b.addBlock('Const', { value: 0.5 });

      // Position from composable primitives
      const goldenAngle = b.addBlock('FieldGoldenAngle', { turns: 50 });
      const angularOffset = b.addBlock('FieldAngularOffset', {});
      const totalAngle = b.addBlock('FieldAdd', {});
      const effectiveRadius = b.addBlock('FieldRadiusSqrt', {});
      const pos = b.addBlock('FieldPolarToCartesian', {});

      const sat = b.addBlock('Const', { value: 1.0 });
      const val = b.addBlock('Const', { value: 1.0 });

      // Color from composable primitives
      const hue = b.addBlock('FieldHueFromPhase', {});
      const color = b.addBlock('HsvToRgb', {});
      const render = b.addBlock('RenderInstances2D', {});

      // Wire phase to position and color
      b.wire(time, 'phaseA', angularOffset, 'phase');
      b.wire(time, 'phaseA', hue, 'phase');

      // Wire Array 't' output (normalized index 0-1) to field blocks
      b.wire(array, 't', goldenAngle, 'id01');
      b.wire(array, 't', angularOffset, 'id01');
      b.wire(array, 't', hue, 'id01');
      b.wire(array, 't', effectiveRadius, 'id01');

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
      b.wire(effectiveRadius, 'out', pos, 'radius');

      // Wire hue and sat/val to color
      b.wire(hue, 'hue', color, 'hue');
      b.wire(sat, 'out', color, 'sat');
      b.wire(val, 'out', color, 'val');

      // Wire pos, color, shape to render
      b.wire(pos, 'pos', render, 'pos');
      b.wire(color, 'color', render, 'color');
      b.wire(ellipse, 'shape', render, 'shape');
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
    const schedule = program.schedule as ScheduleIR;
    expect(schedule.timeModel.kind).toBe('infinite');
    expect(schedule.instances.size).toBe(1);
    expect(schedule.steps.length).toBeGreaterThan(0);

    // Check we have a render step
    const renderSteps = schedule.steps.filter((s: any) => s.kind === 'render');
    expect(renderSteps.length).toBe(1);

    // Execute a frame
    const pool = new BufferPool();
    const state = createRuntimeState(program.slotMeta.length);

    const frame = executeFrame(program, state, pool, 0);

    // Verify frame structure (v2)
    expect(frame.version).toBe(2);
    expect(frame.ops.length).toBe(1);

    const op = frame.ops[0] as DrawPathInstancesOp | DrawPrimitiveInstancesOp;
    expect(op.kind).toBe('drawPrimitiveInstances');
    expect(op.instances.count).toBe(100);
    expect(op.instances.position).toBeInstanceOf(Float32Array);
    expect(op.style.fillColor).toBeInstanceOf(Uint8ClampedArray);

    // Verify position buffer has correct size (vec3 stride, but no camera so still world-space)
    const posBuffer = op.instances.position as Float32Array;
    expect(posBuffer.length).toBe(100 * 3); // 100 particles, 3 floats per position (x, y, z)
    // Copy the values since the buffer will be reused for frame 2
    const frame1Positions = new Float32Array(posBuffer);

    // Verify color buffer has correct size
    const colorBuffer = op.style.fillColor as Uint8ClampedArray;
    expect(colorBuffer.length).toBe(100 * 4); // 100 particles, 4 bytes per color (RGBA)

    // Verify size is uniform (no camera = no projection = uniform size)
    expect(typeof op.instances.size).toBe('number');
    expect(op.instances.size).toBe(1); // Default scale from RenderInstances2D block

    // Verify positions are finite numbers (actual range depends on animation parameters)
    for (let i = 0; i < 100; i++) {
      const x = posBuffer[i * 3 + 0];
      const y = posBuffer[i * 3 + 1];
      const z = posBuffer[i * 3 + 2];
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(z).toBe(0.0); // z should always be 0.0
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
    const pos2 = (frame2.ops[0] as DrawPathInstancesOp | DrawPrimitiveInstancesOp).instances.position as Float32Array;

    // Positions should be different from frame 1
    // Note: posBuffer and pos2 may be the same buffer object (reused by pool)
    // So we compare against frame1Positions which we copied earlier
    let hasDifference = false;
    for (let i = 0; i < 100; i++) {
      if (
        Math.abs(frame1Positions[i * 3 + 0] - pos2[i * 3 + 0]) > 0.001 ||
        Math.abs(frame1Positions[i * 3 + 1] - pos2[i * 3 + 1]) > 0.001
      ) {
        hasDifference = true;
        break;
      }
    }
    expect(hasDifference).toBe(true);
  });
});
