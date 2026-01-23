/**
 * Steel Thread Test - Dual Topology with Scale & Opacity
 *
 * Tests the full rendering pipeline for multiple topologies with animated
 * scale and opacity. Exercises:
 * - Two shape blocks with different topologyIds (Ellipse, Rect)
 * - Animated scale input on RenderInstances2D
 * - ApplyOpacity block modulating color alpha channel
 * - Both passes produce correct resolvedShape, buffer sizes, and animation
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import type { ScheduleIR } from '../passes-v2/pass7-schedule';
import {
  createRuntimeState,
  BufferPool,
  executeFrame,
} from '../../runtime';
import { TOPOLOGY_ID_ELLIPSE, TOPOLOGY_ID_RECT } from '../../shapes/registry';

describe('Steel Thread - Dual Topology with Scale & Opacity', () => {
  it('should render two topologies with animated scale and opacity', () => {
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

      // Per-element opacity fields (FieldPulse produces per-element varying opacity)
      // These will be wired after the arrays are created (need id01)

      // === LAYER 1: Ellipses with scale + opacity ===
      const ellipse = b.addBlock('Ellipse', {});
      const ellipseArray = b.addBlock('Array', { count: 25 });
      b.wire(ellipse, 'shape', ellipseArray, 'element');

      const eGolden = b.addBlock('FieldGoldenAngle', { turns: 50 });
      const eAngular = b.addBlock('FieldAngularOffset', {});
      const eTotalAngle = b.addBlock('FieldAdd', {});
      const eRadius = b.addBlock('FieldRadiusSqrt', {});
      const ePos = b.addBlock('FieldPolarToCartesian', {});
      const eSpin = b.addBlock('Const', { value: 0.5 });

      b.wire(ellipseArray, 't', eGolden, 'id01');
      b.wire(ellipseArray, 't', eAngular, 'id01');
      b.wire(ellipseArray, 't', eRadius, 'id01');
      b.wire(time, 'phaseA', eAngular, 'phase');
      b.wire(eSpin, 'out', eAngular, 'spin');
      b.wire(eGolden, 'angle', eTotalAngle, 'a');
      b.wire(eAngular, 'offset', eTotalAngle, 'b');

      const eCenterX = b.addBlock('Const', { value: 0.5 });
      const eCenterY = b.addBlock('Const', { value: 0.5 });
      const eRadiusMax = b.addBlock('Const', { value: 0.4 });
      b.wire(eCenterX, 'out', ePos, 'centerX');
      b.wire(eCenterY, 'out', ePos, 'centerY');
      b.wire(eRadiusMax, 'out', eRadius, 'radius');
      b.wire(eTotalAngle, 'out', ePos, 'angle');
      b.wire(eRadius, 'out', ePos, 'radius');

      // Ellipse color + opacity
      const eHue = b.addBlock('FieldHueFromPhase', {});
      b.wire(time, 'phaseA', eHue, 'phase');
      b.wire(ellipseArray, 't', eHue, 'id01');
      const eColor = b.addBlock('HsvToRgb', {});
      const eSat = b.addBlock('Const', { value: 1.0 });
      const eVal = b.addBlock('Const', { value: 1.0 });
      b.wire(eHue, 'hue', eColor, 'hue');
      b.wire(eSat, 'out', eColor, 'sat');
      b.wire(eVal, 'out', eColor, 'val');

      // Per-element opacity for ellipses
      const eOpacityPulse = b.addBlock('FieldPulse', {});
      const eOpBase = b.addBlock('Const', { value: 0.4 });
      const eOpAmp = b.addBlock('Const', { value: 0.6 });
      const eOpSpread = b.addBlock('Const', { value: 1.5 });
      b.wire(ellipseArray, 't', eOpacityPulse, 'id01');
      b.wire(time, 'phaseA', eOpacityPulse, 'phase');
      b.wire(eOpBase, 'out', eOpacityPulse, 'base');
      b.wire(eOpAmp, 'out', eOpacityPulse, 'amplitude');
      b.wire(eOpSpread, 'out', eOpacityPulse, 'spread');

      const eOpacity = b.addBlock('ApplyOpacity', {});
      b.wire(eColor, 'color', eOpacity, 'color');
      b.wire(eOpacityPulse, 'value', eOpacity, 'opacity');

      const eRender = b.addBlock('RenderInstances2D', {});
      b.wire(ePos, 'pos', eRender, 'pos');
      b.wire(eOpacity, 'out', eRender, 'color');
      b.wire(ellipse, 'shape', eRender, 'shape');
      b.wire(eScaleExpr, 'out', eRender, 'scale');

      // === LAYER 2: Rectangles with scale + opacity ===
      const rect = b.addBlock('Rect', {});
      const rectArray = b.addBlock('Array', { count: 20 });
      b.wire(rect, 'shape', rectArray, 'element');

      const rGolden = b.addBlock('FieldGoldenAngle', { turns: 30 });
      const rAngular = b.addBlock('FieldAngularOffset', {});
      const rTotalAngle = b.addBlock('FieldAdd', {});
      const rRadius = b.addBlock('FieldRadiusSqrt', {});
      const rPos = b.addBlock('FieldPolarToCartesian', {});
      const rSpinConst = b.addBlock('Const', { value: -0.3 });

      b.wire(rectArray, 't', rGolden, 'id01');
      b.wire(rectArray, 't', rAngular, 'id01');
      b.wire(rectArray, 't', rRadius, 'id01');
      b.wire(time, 'phaseB', rAngular, 'phase');
      b.wire(rSpinConst, 'out', rAngular, 'spin');
      b.wire(rGolden, 'angle', rTotalAngle, 'a');
      b.wire(rAngular, 'offset', rTotalAngle, 'b');

      const rCenterX = b.addBlock('Const', { value: 0.5 });
      const rCenterY = b.addBlock('Const', { value: 0.5 });
      const rRadiusMax = b.addBlock('Const', { value: 0.35 });
      b.wire(rCenterX, 'out', rPos, 'centerX');
      b.wire(rCenterY, 'out', rPos, 'centerY');
      b.wire(rRadiusMax, 'out', rRadius, 'radius');
      b.wire(rTotalAngle, 'out', rPos, 'angle');
      b.wire(rRadius, 'out', rPos, 'radius');

      // Rect color + opacity
      const rHue = b.addBlock('FieldHueFromPhase', {});
      b.wire(time, 'phaseB', rHue, 'phase');
      b.wire(rectArray, 't', rHue, 'id01');
      const rColor = b.addBlock('HsvToRgb', {});
      const rSatConst = b.addBlock('Const', { value: 0.8 });
      const rValConst = b.addBlock('Const', { value: 0.9 });
      b.wire(rHue, 'hue', rColor, 'hue');
      b.wire(rSatConst, 'out', rColor, 'sat');
      b.wire(rValConst, 'out', rColor, 'val');

      // Per-element opacity for rects
      const rOpacityPulse = b.addBlock('FieldPulse', {});
      const rOpBase = b.addBlock('Const', { value: 0.3 });
      const rOpAmp = b.addBlock('Const', { value: 0.7 });
      const rOpSpread = b.addBlock('Const', { value: 2.0 });
      b.wire(rectArray, 't', rOpacityPulse, 'id01');
      b.wire(time, 'phaseB', rOpacityPulse, 'phase');
      b.wire(rOpBase, 'out', rOpacityPulse, 'base');
      b.wire(rOpAmp, 'out', rOpacityPulse, 'amplitude');
      b.wire(rOpSpread, 'out', rOpacityPulse, 'spread');

      const rOpacity = b.addBlock('ApplyOpacity', {});
      b.wire(rColor, 'color', rOpacity, 'color');
      b.wire(rOpacityPulse, 'value', rOpacity, 'opacity');

      const rRender = b.addBlock('RenderInstances2D', {});
      b.wire(rPos, 'pos', rRender, 'pos');
      b.wire(rOpacity, 'out', rRender, 'color');
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
    const pool = new BufferPool();
    const state = createRuntimeState(program.slotMeta.length);
    const frame1 = executeFrame(program, state, pool, 0);

    expect(frame1.version).toBe(1);
    expect(frame1.passes.length).toBe(2);

    const ellipsePass1 = frame1.passes.find(p => p.resolvedShape.topologyId === TOPOLOGY_ID_ELLIPSE)!;
    const rectPass1 = frame1.passes.find(p => p.resolvedShape.topologyId === TOPOLOGY_ID_RECT)!;
    expect(ellipsePass1).toBeDefined();
    expect(rectPass1).toBeDefined();

    // Verify counts
    expect(ellipsePass1.count).toBe(25);
    expect(rectPass1.count).toBe(20);

    // Verify buffer types and sizes
    expect(ellipsePass1.position).toBeInstanceOf(Float32Array);
    expect(ellipsePass1.color).toBeInstanceOf(Uint8ClampedArray);
    expect((ellipsePass1.position as Float32Array).length).toBe(25 * 2);
    expect((ellipsePass1.color as Uint8ClampedArray).length).toBe(25 * 4);

    expect(rectPass1.position).toBeInstanceOf(Float32Array);
    expect(rectPass1.color).toBeInstanceOf(Uint8ClampedArray);
    expect((rectPass1.position as Float32Array).length).toBe(20 * 2);
    expect((rectPass1.color as Uint8ClampedArray).length).toBe(20 * 4);

    // Verify shapes are properly resolved
    expect(ellipsePass1.resolvedShape.resolved).toBe(true);
    expect(ellipsePass1.resolvedShape.topologyId).toBe(TOPOLOGY_ID_ELLIPSE);
    expect(ellipsePass1.resolvedShape.mode).toBe('primitive');
    expect(ellipsePass1.resolvedShape.params).toHaveProperty('rx');
    expect(ellipsePass1.resolvedShape.params).toHaveProperty('ry');

    expect(rectPass1.resolvedShape.resolved).toBe(true);
    expect(rectPass1.resolvedShape.topologyId).toBe(TOPOLOGY_ID_RECT);
    expect(rectPass1.resolvedShape.mode).toBe('primitive');
    expect(rectPass1.resolvedShape.params).toHaveProperty('width');
    expect(rectPass1.resolvedShape.params).toHaveProperty('height');
    expect(rectPass1.resolvedShape.params).toHaveProperty('cornerRadius');

    // === VERIFY SCALE IS ANIMATED (not default 1.0) ===
    // At t=0, sin(0) = 0, so:
    // ellipse scale = 1.5 + 0.5*sin(0) = 1.5
    // rect scale = 0.8 + 0.4*sin(0+π) = 0.8 + 0.4*0 = 0.8
    // phaseA at t=0: phase = 0/4000 = 0
    // phaseB at t=0: phase = 0/8000 = 0
    expect(ellipsePass1.scale).toBeCloseTo(1.5, 1); // 1.5 + 0.5*sin(0*2π) = 1.5
    expect(rectPass1.scale).toBeCloseTo(0.8, 1);    // 0.8 + 0.4*sin(0*2π+π) = 0.8

    // === VERIFY PER-ELEMENT OPACITY (different alpha per element) ===
    const eColorBuf1 = ellipsePass1.color as Uint8ClampedArray;
    const rColorBuf1 = rectPass1.color as Uint8ClampedArray;

    // Per-element opacity: elements should have DIFFERENT alpha values
    // FieldPulse produces: base + amplitude * sin(2π * (phase + id01 * spread))
    // At t=0: phase=0, so value = base + amp * sin(2π * id01 * spread)
    // Different id01 values → different opacities
    let rectAlphaVariation = false;
    const rectAlpha0 = rColorBuf1[3]; // first element alpha
    for (let i = 1; i < 20; i++) {
      if (rColorBuf1[i * 4 + 3] !== rectAlpha0) {
        rectAlphaVariation = true;
        break;
      }
    }
    expect(rectAlphaVariation).toBe(true); // per-element opacity creates variation

    // All alphas should be valid (0-255 range, not all 255)
    let hasReducedAlpha = false;
    for (let i = 0; i < 20; i++) {
      const alpha = rColorBuf1[i * 4 + 3];
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(255);
      if (alpha < 255) hasReducedAlpha = true;
    }
    expect(hasReducedAlpha).toBe(true); // at least some elements have reduced opacity

    // Verify positions are finite
    for (const pass of frame1.passes) {
      const pos = pass.position as Float32Array;
      for (let i = 0; i < pass.count; i++) {
        expect(Number.isFinite(pos[i * 2])).toBe(true);
        expect(Number.isFinite(pos[i * 2 + 1])).toBe(true);
      }
    }

    // Verify colors have valid RGB values
    for (const pass of frame1.passes) {
      const col = pass.color as Uint8ClampedArray;
      for (let i = 0; i < pass.count; i++) {
        expect(col[i * 4 + 0]).toBeGreaterThanOrEqual(0);
        expect(col[i * 4 + 0]).toBeLessThanOrEqual(255);
        expect(col[i * 4 + 1]).toBeGreaterThanOrEqual(0);
        expect(col[i * 4 + 1]).toBeLessThanOrEqual(255);
        expect(col[i * 4 + 2]).toBeGreaterThanOrEqual(0);
        expect(col[i * 4 + 2]).toBeLessThanOrEqual(255);
        // Alpha can be < 255 due to opacity
        expect(col[i * 4 + 3]).toBeGreaterThanOrEqual(0);
        expect(col[i * 4 + 3]).toBeLessThanOrEqual(255);
      }
    }

    // === FRAME 2: t=1000ms - verify animation ===
    // Copy frame 1 data for comparison
    const f1EllipsePos = new Float32Array(ellipsePass1.position as Float32Array);
    const f1RectPos = new Float32Array(rectPass1.position as Float32Array);
    const f1EllipseScale = ellipsePass1.scale;
    const f1RectScale = rectPass1.scale;

    const frame2 = executeFrame(program, state, pool, 1000);
    const ellipsePass2 = frame2.passes.find(p => p.resolvedShape.topologyId === TOPOLOGY_ID_ELLIPSE)!;
    const rectPass2 = frame2.passes.find(p => p.resolvedShape.topologyId === TOPOLOGY_ID_RECT)!;

    // Positions should change (animated)
    let ellipseMoved = false;
    const ePos2 = ellipsePass2.position as Float32Array;
    for (let i = 0; i < 25; i++) {
      if (Math.abs(f1EllipsePos[i * 2] - ePos2[i * 2]) > 0.001 ||
          Math.abs(f1EllipsePos[i * 2 + 1] - ePos2[i * 2 + 1]) > 0.001) {
        ellipseMoved = true;
        break;
      }
    }
    expect(ellipseMoved).toBe(true);

    let rectMoved = false;
    const rPos2 = rectPass2.position as Float32Array;
    for (let i = 0; i < 20; i++) {
      if (Math.abs(f1RectPos[i * 2] - rPos2[i * 2]) > 0.001 ||
          Math.abs(f1RectPos[i * 2 + 1] - rPos2[i * 2 + 1]) > 0.001) {
        rectMoved = true;
        break;
      }
    }
    expect(rectMoved).toBe(true);

    // Scale should change between frames (animated)
    expect(ellipsePass2.scale).not.toBeCloseTo(f1EllipseScale, 2);
    expect(rectPass2.scale).not.toBeCloseTo(f1RectScale, 2);

    // Scale should be positive and reasonable
    expect(ellipsePass2.scale).toBeGreaterThan(0);
    expect(ellipsePass2.scale).toBeLessThan(5);
    expect(rectPass2.scale).toBeGreaterThan(0);
    expect(rectPass2.scale).toBeLessThan(5);

    // Per-element opacity should change between frames (phase advances)
    const eColorBuf2 = ellipsePass2.color as Uint8ClampedArray;
    const rColorBuf2 = rectPass2.color as Uint8ClampedArray;

    // Alpha distribution should shift as phase changes
    let alphaDistributionChanged = false;
    for (let i = 0; i < 20; i++) {
      if (rColorBuf1[i * 4 + 3] !== rColorBuf2[i * 4 + 3]) {
        alphaDistributionChanged = true;
        break;
      }
    }
    expect(alphaDistributionChanged).toBe(true);

    // Shapes are stable across frames
    expect(ellipsePass2.resolvedShape.topologyId).toBe(TOPOLOGY_ID_ELLIPSE);
    expect(rectPass2.resolvedShape.topologyId).toBe(TOPOLOGY_ID_RECT);
    expect(ellipsePass2.resolvedShape.mode).toBe('primitive');
    expect(rectPass2.resolvedShape.mode).toBe('primitive');

    // === FRAME 3: t=2000ms - verify continued animation ===
    const frame3 = executeFrame(program, state, pool, 2000);
    const ellipsePass3 = frame3.passes.find(p => p.resolvedShape.topologyId === TOPOLOGY_ID_ELLIPSE)!;
    const rectPass3 = frame3.passes.find(p => p.resolvedShape.topologyId === TOPOLOGY_ID_RECT)!;

    // Scale continues to change
    expect(ellipsePass3.scale).not.toBeCloseTo(ellipsePass2.scale, 2);

    // All passes still valid
    expect(frame3.passes.length).toBe(2);
    expect(ellipsePass3.count).toBe(25);
    expect(rectPass3.count).toBe(20);
  });
});
