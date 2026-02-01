/**
 * Steel Thread Test - Dual Topology with Scale
 *
 * Tests the full rendering pipeline for multiple topologies with animated scale.
 * Exercises:
 * - Two shape blocks with different topologyIds (Ellipse, Rect)
 * - Animated scale input on RenderInstances2D
 * - Both passes produce correct resolvedShape, buffer sizes, and animation
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import type { ScheduleIR } from '../backend/schedule-program';
import {
  createRuntimeState,
  executeFrame,
  type RenderFrameIR,
} from '../../runtime';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';
import { TOPOLOGY_ID_ELLIPSE, TOPOLOGY_ID_RECT } from '../../shapes/registry';

describe('Steel Thread - Dual Topology with Scale', () => {
  it('should render two topologies with animated scale', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', { periodAMs: 4000, periodBMs: 8000 });

      // Animated scale expressions (different for each layer)
      const eScaleExpr = b.addBlock('Expression', {
        expression: '1.5 + 0.5 * sin(in0 * 6.28)', // ellipse: 1.0 to 2.0
      });
      b.wire(time, 'phaseA', eScaleExpr, 'in0');

      const rScaleExpr = b.addBlock('Expression', {
        expression: '0.8 + 0.4 * sin(in0 * 6.28 + 3.14)', // rect: 0.4 to 1.2 (counter-phase)
      });
      b.wire(time, 'phaseB', rScaleExpr, 'in0');

      // === LAYER 1: Ellipses with CircleLayoutUV ===
      const ellipse = b.addBlock('Ellipse', {});
      const ellipseArray = b.addBlock('Array', { count: 25 });
      b.wire(ellipse, 'shape', ellipseArray, 'element');

      const eLayout = b.addBlock('CircleLayoutUV', { radius: 0.4 });
      b.wire(ellipseArray, 'elements', eLayout, 'elements');
      b.wire(time, 'phaseA', eLayout, 'phase');

      // Simple solid color
      const eColor = b.addBlock('Const', { value: [1.0, 0.5, 0.0, 1.0] }); // Orange

      const eRender = b.addBlock('RenderInstances2D', {});
      b.wire(eLayout, 'position', eRender, 'pos');
      b.wire(eColor, 'out', eRender, 'color');
      b.wire(ellipse, 'shape', eRender, 'shape');
      b.wire(eScaleExpr, 'out', eRender, 'scale');

      // === LAYER 2: Rectangles with CircleLayoutUV ===
      const rect = b.addBlock('Rect', {});
      const rectArray = b.addBlock('Array', { count: 20 });
      b.wire(rect, 'shape', rectArray, 'element');

      const rLayout = b.addBlock('CircleLayoutUV', { radius: 0.35 });
      b.wire(rectArray, 'elements', rLayout, 'elements');
      b.wire(time, 'phaseB', rLayout, 'phase');

      // Simple solid color
      const rColor = b.addBlock('Const', { value: [0.0, 0.5, 1.0, 1.0] }); // Blue

      const rRender = b.addBlock('RenderInstances2D', {});
      b.wire(rLayout, 'position', rRender, 'pos');
      b.wire(rColor, 'out', rRender, 'color');
      b.wire(rect, 'shape', rRender, 'shape');
      b.wire(rScaleExpr, 'out', rRender, 'scale');
    });

    // Compile
    const result = compile(patch);
    if (result.kind !== 'ok') {
      console.error('Compile errors:', JSON.stringify(result.errors, null, 2));
      throw new Error(`Compile failed: ${JSON.stringify(result.errors)}`);
    }

    const program = result.program;
    const schedule = program.schedule as ScheduleIR;

    // Verify TWO render steps
    const renderSteps = schedule.steps.filter((s: any) => s.kind === 'render');
    expect(renderSteps.length).toBe(2);

    // Both have different topology IDs
    const topologyIds = renderSteps.map((s: any) => s.shape.topologyId);
    expect(topologyIds).toContain(TOPOLOGY_ID_ELLIPSE);
    expect(topologyIds).toContain(TOPOLOGY_ID_RECT);

    // === FRAME 1: t=0 ===
    const arena = getTestArena();
    const state = createRuntimeState(program.slotMeta.length);
    const frame1 = executeFrame(program, state, arena, 0) as RenderFrameIR;

    expect(frame1.version).toBe(2);
    expect(frame1.ops.length).toBe(2);

    const ellipseOp1 = frame1.ops.find(op => op.geometry.topologyId === TOPOLOGY_ID_ELLIPSE)!;
    const rectOp1 = frame1.ops.find(op => op.geometry.topologyId === TOPOLOGY_ID_RECT)!;
    expect(ellipseOp1).toBeDefined();
    expect(rectOp1).toBeDefined();

    // Verify counts
    expect(ellipseOp1.instances.count).toBe(25);
    expect(rectOp1.instances.count).toBe(20);

    // Verify buffer types and sizes (after projection: vec2 stride, Float32Array sizes)
    expect(ellipseOp1.instances.position).toBeInstanceOf(Float32Array);
    expect(ellipseOp1.style.fillColor).toBeInstanceOf(Uint8ClampedArray);
    expect(ellipseOp1.instances.position.length).toBe(25 * 2); // 25 × 2 floats (x, y)
    expect(ellipseOp1.style.fillColor!.length).toBe(25 * 4);

    expect(rectOp1.instances.position).toBeInstanceOf(Float32Array);
    expect(rectOp1.style.fillColor).toBeInstanceOf(Uint8ClampedArray);
    expect(rectOp1.instances.position.length).toBe(20 * 2); // 20 × 2 floats (x, y)
    expect(rectOp1.style.fillColor!.length).toBe(20 * 4);

    // Verify shapes are properly resolved
    expect(ellipseOp1.kind).toBe('drawPrimitiveInstances');
    expect(ellipseOp1.geometry.topologyId).toBe(TOPOLOGY_ID_ELLIPSE);
    if (ellipseOp1.kind === 'drawPrimitiveInstances') {
      expect(ellipseOp1.geometry.params).toHaveProperty('rx');
      expect(ellipseOp1.geometry.params).toHaveProperty('ry');
    }

    expect(rectOp1.kind).toBe('drawPrimitiveInstances');
    expect(rectOp1.geometry.topologyId).toBe(TOPOLOGY_ID_RECT);
    if (rectOp1.kind === 'drawPrimitiveInstances') {
      expect(rectOp1.geometry.params).toHaveProperty('width');
      expect(rectOp1.geometry.params).toHaveProperty('height');
      expect(rectOp1.geometry.params).toHaveProperty('cornerRadius');
    }

    // === VERIFY SCALE IS ANIMATED (Float32Array after projection) ===
    expect(ellipseOp1.instances.size).toBeInstanceOf(Float32Array);
    expect(rectOp1.instances.size).toBeInstanceOf(Float32Array);

    const ellipseSizes1 = ellipseOp1.instances.size as Float32Array;
    const rectSizes1 = rectOp1.instances.size as Float32Array;
    expect(ellipseSizes1.length).toBe(25);
    expect(rectSizes1.length).toBe(20);

    // Verify sizes are finite and positive
    for (let i = 0; i < 25; i++) {
      expect(Number.isFinite(ellipseSizes1[i])).toBe(true);
      expect(ellipseSizes1[i]).toBeGreaterThan(0);
    }
    for (let i = 0; i < 20; i++) {
      expect(Number.isFinite(rectSizes1[i])).toBe(true);
      expect(rectSizes1[i]).toBeGreaterThan(0);
    }

    // === VERIFY COLOR ===
    const eColorBuf1 = ellipseOp1.style.fillColor!;
    const rColorBuf1 = rectOp1.style.fillColor!;

    // All instances should have same color (solid color, not per-instance)
    for (let i = 0; i < 25; i++) {
      expect(eColorBuf1[i * 4 + 0]).toBeGreaterThanOrEqual(0);
      expect(eColorBuf1[i * 4 + 1]).toBeGreaterThanOrEqual(0);
      expect(eColorBuf1[i * 4 + 2]).toBeGreaterThanOrEqual(0);
      expect(eColorBuf1[i * 4 + 3]).toBe(255); // Full opacity
    }

    // Verify positions are finite (vec2 stride after projection)
    for (const op of frame1.ops) {
      const pos = op.instances.position;
      for (let i = 0; i < op.instances.count; i++) {
        expect(Number.isFinite(pos[i * 2 + 0])).toBe(true);
        expect(Number.isFinite(pos[i * 2 + 1])).toBe(true);
      }
    }

    // === FRAME 2: t=1000ms - verify animation ===
    // Copy frame 1 data for comparison
    const f1EllipsePos = new Float32Array(ellipseOp1.instances.position);
    const f1RectPos = new Float32Array(rectOp1.instances.position);
    const f1EllipseSizes = new Float32Array(ellipseSizes1);
    const f1RectSizes = new Float32Array(rectSizes1);

    const frame2 = executeFrame(program, state, arena, 1000) as RenderFrameIR;
    const ellipseOp2 = frame2.ops.find(op => op.geometry.topologyId === TOPOLOGY_ID_ELLIPSE)!;
    const rectOp2 = frame2.ops.find(op => op.geometry.topologyId === TOPOLOGY_ID_RECT)!;

    // Positions should change (animated by phase)
    let ellipseMoved = false;
    const ePos2 = ellipseOp2.instances.position;
    for (let i = 0; i < 25; i++) {
      if (Math.abs(f1EllipsePos[i * 2 + 0] - ePos2[i * 2 + 0]) > 0.001 ||
          Math.abs(f1EllipsePos[i * 2 + 1] - ePos2[i * 2 + 1]) > 0.001) {
        ellipseMoved = true;
        break;
      }
    }
    expect(ellipseMoved).toBe(true);

    let rectMoved = false;
    const rPos2 = rectOp2.instances.position;
    for (let i = 0; i < 20; i++) {
      if (Math.abs(f1RectPos[i * 2 + 0] - rPos2[i * 2 + 0]) > 0.001 ||
          Math.abs(f1RectPos[i * 2 + 1] - rPos2[i * 2 + 1]) > 0.001) {
        rectMoved = true;
        break;
      }
    }
    expect(rectMoved).toBe(true);

    // Sizes should change between frames (animated scale, Float32Array)
    const ellipseSizes2 = ellipseOp2.instances.size as Float32Array;
    const rectSizes2 = rectOp2.instances.size as Float32Array;

    let ellipseSizeChanged = false;
    for (let i = 0; i < 25; i++) {
      if (Math.abs(f1EllipseSizes[i] - ellipseSizes2[i]) > 0.01) {
        ellipseSizeChanged = true;
        break;
      }
    }
    expect(ellipseSizeChanged).toBe(true);

    let rectSizeChanged = false;
    for (let i = 0; i < 20; i++) {
      if (Math.abs(f1RectSizes[i] - rectSizes2[i]) > 0.01) {
        rectSizeChanged = true;
        break;
      }
    }
    expect(rectSizeChanged).toBe(true);

    // Shapes are stable across frames
    expect(ellipseOp2.geometry.topologyId).toBe(TOPOLOGY_ID_ELLIPSE);
    expect(rectOp2.geometry.topologyId).toBe(TOPOLOGY_ID_RECT);
    expect(ellipseOp2.kind).toBe('drawPrimitiveInstances');
    expect(rectOp2.kind).toBe('drawPrimitiveInstances');

    // === FRAME 3: t=2000ms - verify continued animation ===
    const frame3 = executeFrame(program, state, arena, 2000) as RenderFrameIR;
    const ellipseOp3 = frame3.ops.find(op => op.geometry.topologyId === TOPOLOGY_ID_ELLIPSE)!;
    const rectOp3 = frame3.ops.find(op => op.geometry.topologyId === TOPOLOGY_ID_RECT)!;

    // Sizes continue to change
    const ellipseSizes3 = ellipseOp3.instances.size as Float32Array;
    let sizes3Changed = false;
    for (let i = 0; i < 25; i++) {
      if (Math.abs(ellipseSizes2[i] - ellipseSizes3[i]) > 0.01) {
        sizes3Changed = true;
        break;
      }
    }
    expect(sizes3Changed).toBe(true);

    // All ops still valid
    expect(frame3.ops.length).toBe(2);
    expect(ellipseOp3.instances.count).toBe(25);
    expect(rectOp3.instances.count).toBe(20);
  });
});
