/**
 * Steel Thread Test - Rect Shape Pipeline
 *
 * Tests the full rendering pipeline for the Rect topology:
 * Rect (shape) → Array (cardinality) → position/color fields → Render
 *
 * This test ensures the shape2d payload flows correctly:
 * - Rect block produces shapeRef signal with numeric rect topologyId
 * - Compile produces correct IR with shape2d storage
 * - RenderAssembler resolves shape via topology registry
 * - Output v2 DrawOp has geometry with correct topology and params
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import type { ScheduleIR } from '../backend/schedule-program';
import {
  createRuntimeState,
  executeFrame,
  type DrawPathInstancesOp,
  type DrawPrimitiveInstancesOp,
} from '../../runtime';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';
import { TOPOLOGY_ID_ELLIPSE, TOPOLOGY_ID_RECT } from '../../shapes/registry';

describe('Steel Thread - Rect Shape Pipeline', () => {
  it('should compile and execute a patch using Rect topology', () => {
    // Build the patch: Rect → Array → position/color → Render
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', { periodAMs: 3000, periodBMs: 6000 });

      // Rect shape (uses registry defaults: width=0.04, height=0.02)
      const rect = b.addBlock('Rect', {});
      const array = b.addBlock('Array', { count: 50 });
      b.wire(rect, 'shape', array, 'element');

      // Position: golden spiral pattern
      const centerX = b.addBlock('Const', { value: 0.5 });
      const centerY = b.addBlock('Const', { value: 0.5 });
      const radius = b.addBlock('Const', { value: 0.35 });
      const spin = b.addBlock('Const', { value: 0.4 });

      const goldenAngle = b.addBlock('GoldenAngle', { turns: 50 });
      const angularOffset = b.addBlock('AngularOffset', {});
      const totalAngle = b.addBlock('Add', {});
      const effectiveRadius = b.addBlock('RadiusSqrt', {});
      const pos = b.addBlock('PolarToCartesian', {});

      b.wire(time, 'phaseA', angularOffset, 'phase');
      b.wire(array, 't', goldenAngle, 'id01');
      b.wire(array, 't', angularOffset, 'id01');
      b.wire(array, 't', effectiveRadius, 'id01');
      b.wire(spin, 'out', angularOffset, 'spin');

      b.wire(goldenAngle, 'angle', totalAngle, 'a');
      b.wire(angularOffset, 'offset', totalAngle, 'b');

      b.wire(centerX, 'out', pos, 'centerX');
      b.wire(centerY, 'out', pos, 'centerY');
      b.wire(radius, 'out', effectiveRadius, 'radius');
      b.wire(totalAngle, 'out', pos, 'angle');
      b.wire(effectiveRadius, 'out', pos, 'radius');

      // Color: hue from phase (must wire phase explicitly)
      const hue = b.addBlock('HueFromPhase', {});
      b.wire(time, 'phaseA', hue, 'phase');
      b.wire(array, 't', hue, 'id01');

      const sat = b.addBlock('Const', { value: 0.9 });
      const val = b.addBlock('Const', { value: 1.0 });
      const color = b.addBlock('HsvToRgb', {});
      b.wire(hue, 'hue', color, 'hue');
      b.wire(sat, 'out', color, 'sat');
      b.wire(val, 'out', color, 'val');

      // Render with Rect shape
      const render = b.addBlock('RenderInstances2D', {});
      b.wire(pos, 'pos', render, 'pos');
      b.wire(color, 'color', render, 'color');
      b.wire(rect, 'shape', render, 'shape');
    });

    // Compile the patch
    const result = compile(patch);

    // Should compile successfully
    if (result.kind !== 'ok') {
      console.error('Compile errors:', JSON.stringify(result.errors, null, 2));
      throw new Error(`Compile failed: ${JSON.stringify(result.errors)}`);
    }

    const program = result.program;

    // Verify program structure
    const schedule = program.schedule as ScheduleIR;
    expect(schedule.timeModel.kind).toBe('infinite');
    expect(schedule.instances.size).toBe(1);
    expect(schedule.steps.length).toBeGreaterThan(0);

    // Check render step exists
    const renderSteps = schedule.steps.filter((s: any) => s.kind === 'render');
    expect(renderSteps.length).toBe(1);

    // Verify the render step has a shape with 'rect' topology
    const renderStep = renderSteps[0] as any;
    expect(renderStep.shape).toBeDefined();
    expect(renderStep.shape.topologyId).toBe(TOPOLOGY_ID_RECT);
    // Rect has 4 params: width, height, rotation, cornerRadius
    expect(renderStep.shape.paramSignals.length).toBe(4);

    // Execute frame at t=0
    const arena = getTestArena();
    const state = createRuntimeState(program.slotMeta.length);
    const frame = executeFrame(program, state, arena, 0);

    // Verify frame structure (v2)
    expect(frame.version).toBe(2);
    expect(frame.ops.length).toBe(1);

    const op = frame.ops[0] as DrawPrimitiveInstancesOp;
    expect(op.kind).toBe('drawPrimitiveInstances');
    expect(op.instances.count).toBe(50);
    expect(op.instances.position).toBeInstanceOf(Float32Array);
    expect(op.style.fillColor).toBeInstanceOf(Uint8ClampedArray);

    // Verify position buffer size (vec2 stride after projection)
    const posBuffer = op.instances.position as Float32Array;
    expect(posBuffer.length).toBe(50 * 2); // 50 particles × 2 floats per position (x, y)

    // Verify color buffer size
    const colorBuffer = op.style.fillColor as Uint8ClampedArray;
    expect(colorBuffer.length).toBe(50 * 4); // 50 particles × 4 bytes per color

    // After projection, size becomes per-instance Float32Array
    expect(op.instances.size).toBeInstanceOf(Float32Array);
    const sizeBuffer = op.instances.size as Float32Array;
    expect(sizeBuffer.length).toBe(50);

    // Verify geometry has correct rect topology (primitive mode)
    expect(op.geometry.topologyId).toBe(TOPOLOGY_ID_RECT);
    expect(op.geometry.params.width).toBeCloseTo(0.04, 5);
    expect(op.geometry.params.height).toBeCloseTo(0.02, 5);
    expect(op.geometry.params.rotation).toBe(0);
    expect(op.geometry.params.cornerRadius).toBe(0);

    // Verify positions are finite (vec2 stride)
    for (let i = 0; i < 50; i++) {
      const x = posBuffer[i * 2 + 0];
      const y = posBuffer[i * 2 + 1];
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }

    // Verify sizes are finite and positive
    for (let i = 0; i < 50; i++) {
      const size = sizeBuffer[i];
      expect(Number.isFinite(size)).toBe(true);
      expect(size).toBeGreaterThan(0);
    }

    // Verify colors are valid RGBA
    for (let i = 0; i < 50; i++) {
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

    // Copy frame 1 positions for comparison
    const frame1Positions = new Float32Array(posBuffer);

    // Execute another frame at t=1000ms to verify animation
    const frame2 = executeFrame(program, state, arena, 1000);
    const op2 = frame2.ops[0] as DrawPrimitiveInstancesOp;
    const pos2 = op2.instances.position as Float32Array;

    // Positions should differ between frames (animated)
    let hasDifference = false;
    for (let i = 0; i < 50; i++) {
      if (
        Math.abs(frame1Positions[i * 2 + 0] - pos2[i * 2 + 0]) > 0.001 ||
        Math.abs(frame1Positions[i * 2 + 1] - pos2[i * 2 + 1]) > 0.001
      ) {
        hasDifference = true;
        break;
      }
    }
    expect(hasDifference).toBe(true);

    // Verify frame 2 also has correct rect shape
    expect(op2.geometry.topologyId).toBe(TOPOLOGY_ID_RECT);
    expect(op2.geometry.params.width).toBeCloseTo(0.04, 5);
  });

  it('should produce different geometry for Ellipse vs Rect', () => {
    // Build Ellipse patch
    const ellipsePatch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', { periodAMs: 3000, periodBMs: 6000 });
      const ellipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
      const array = b.addBlock('Array', { count: 10 });
      b.wire(ellipse, 'shape', array, 'element');

      const pos = b.addBlock('PolarToCartesian', {});
      const centerX = b.addBlock('Const', { value: 0.5 });
      const centerY = b.addBlock('Const', { value: 0.5 });
      const radius = b.addBlock('Const', { value: 0.3 });
      const goldenAngle = b.addBlock('GoldenAngle', { turns: 50 });
      const effectiveRadius = b.addBlock('RadiusSqrt', {});

      b.wire(array, 't', goldenAngle, 'id01');
      b.wire(array, 't', effectiveRadius, 'id01');
      b.wire(centerX, 'out', pos, 'centerX');
      b.wire(centerY, 'out', pos, 'centerY');
      b.wire(radius, 'out', effectiveRadius, 'radius');
      b.wire(goldenAngle, 'angle', pos, 'angle');
      b.wire(effectiveRadius, 'out', pos, 'radius');

      const hue = b.addBlock('HueFromPhase', {});
      b.wire(time, 'phaseA', hue, 'phase');
      b.wire(array, 't', hue, 'id01');

      const sat = b.addBlock('Const', { value: 1.0 });
      const val = b.addBlock('Const', { value: 1.0 });
      const color = b.addBlock('HsvToRgb', {});
      b.wire(hue, 'hue', color, 'hue');
      b.wire(sat, 'out', color, 'sat');
      b.wire(val, 'out', color, 'val');

      const render = b.addBlock('RenderInstances2D', {});
      b.wire(pos, 'pos', render, 'pos');
      b.wire(color, 'color', render, 'color');
      b.wire(ellipse, 'shape', render, 'shape');
    });

    // Build Rect patch
    const rectPatch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', { periodAMs: 3000, periodBMs: 6000 });
      const rect = b.addBlock('Rect', {});
      const array = b.addBlock('Array', { count: 10 });
      b.wire(rect, 'shape', array, 'element');

      const pos = b.addBlock('PolarToCartesian', {});
      const centerX = b.addBlock('Const', { value: 0.5 });
      const centerY = b.addBlock('Const', { value: 0.5 });
      const radius = b.addBlock('Const', { value: 0.3 });
      const goldenAngle = b.addBlock('GoldenAngle', { turns: 50 });
      const effectiveRadius = b.addBlock('RadiusSqrt', {});

      b.wire(array, 't', goldenAngle, 'id01');
      b.wire(array, 't', effectiveRadius, 'id01');
      b.wire(centerX, 'out', pos, 'centerX');
      b.wire(centerY, 'out', pos, 'centerY');
      b.wire(radius, 'out', effectiveRadius, 'radius');
      b.wire(goldenAngle, 'angle', pos, 'angle');
      b.wire(effectiveRadius, 'out', pos, 'radius');

      const hue = b.addBlock('HueFromPhase', {});
      b.wire(time, 'phaseA', hue, 'phase');
      b.wire(array, 't', hue, 'id01');

      const sat = b.addBlock('Const', { value: 1.0 });
      const val = b.addBlock('Const', { value: 1.0 });
      const color = b.addBlock('HsvToRgb', {});
      b.wire(hue, 'hue', color, 'hue');
      b.wire(sat, 'out', color, 'sat');
      b.wire(val, 'out', color, 'val');

      const render = b.addBlock('RenderInstances2D', {});
      b.wire(pos, 'pos', render, 'pos');
      b.wire(color, 'color', render, 'color');
      b.wire(rect, 'shape', render, 'shape');
    });

    // Compile both
    const ellipseResult = compile(ellipsePatch);
    const rectResult = compile(rectPatch);

    if (ellipseResult.kind !== 'ok') {
      throw new Error(`Ellipse compile failed: ${JSON.stringify(ellipseResult.errors)}`);
    }
    if (rectResult.kind !== 'ok') {
      throw new Error(`Rect compile failed: ${JSON.stringify(rectResult.errors)}`);
    }

    // Execute both
    const arena = getTestArena();
    const ellipseState = createRuntimeState(ellipseResult.program.slotMeta.length);
    const rectState = createRuntimeState(rectResult.program.slotMeta.length);

    const ellipseFrame = executeFrame(ellipseResult.program, ellipseState, arena, 0);
    const rectFrame = executeFrame(rectResult.program, rectState, arena, 0);

    // Both should render successfully
    expect(ellipseFrame.ops.length).toBe(1);
    expect(rectFrame.ops.length).toBe(1);

    const ellipseOp = ellipseFrame.ops[0] as DrawPrimitiveInstancesOp;
    const rectOp = rectFrame.ops[0] as DrawPrimitiveInstancesOp;

    // Verify different topologies
    expect(ellipseOp.geometry.topologyId).toBe(TOPOLOGY_ID_ELLIPSE);
    expect(rectOp.geometry.topologyId).toBe(TOPOLOGY_ID_RECT);

    // Verify different param names (ellipse: rx/ry, rect: width/height)
    expect(ellipseOp.geometry.params).toHaveProperty('rx');
    expect(ellipseOp.geometry.params).toHaveProperty('ry');
    expect(rectOp.geometry.params).toHaveProperty('width');
    expect(rectOp.geometry.params).toHaveProperty('height');

    // Both should be primitive mode
    expect(ellipseOp.kind).toBe('drawPrimitiveInstances');
    expect(rectOp.kind).toBe('drawPrimitiveInstances');

    // Verify param values match registry defaults
    expect(ellipseOp.geometry.params.rx).toBeCloseTo(0.02, 5);
    expect(ellipseOp.geometry.params.ry).toBeCloseTo(0.02, 5);
    expect(rectOp.geometry.params.width).toBeCloseTo(0.04, 5);
    expect(rectOp.geometry.params.height).toBeCloseTo(0.02, 5);
  });
});
