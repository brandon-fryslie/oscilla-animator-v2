/**
 * Shape Kaleidoscope - Dual topology demo
 *
 * Two interlocking spirals: ellipses rotating clockwise, rectangles counter-clockwise.
 * Both topologies render simultaneously in the same patch (two render passes).
 * Animated scale pulses shapes in and out. Spread out for visibility.
 * Demonstrates the full shape2d pipeline with multiple topologies.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchShapeKaleidoscope: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 6000,
    periodBMs: 10000,
  }, { role: timeRootRole() });

  // Animated scale: pulsing between 0.6 and 1.8
  const eScaleExpr = b.addBlock('Expression', {
    expression: '1.2 + 0.6 * sin(in0 * 6.28)', // pulse with phaseA
  });
  b.wire(time, 'phaseA', eScaleExpr, 'in0');

  const rScaleExpr = b.addBlock('Expression', {
    expression: '1.5 + 0.8 * sin(in0 * 6.28 + 3.14)', // counter-pulse with phaseB
  });
  b.wire(time, 'phaseB', rScaleExpr, 'in0');

  // === LAYER 1: Ellipses (clockwise spiral) ===
  const ellipse = b.addBlock('Ellipse', { rx: 0.015, ry: 0.015 });
  const ellipseArray = b.addBlock('Array', { count: 150 });
  b.wire(ellipse, 'shape', ellipseArray, 'element');

  // Ellipse positions: golden spiral spinning clockwise, wide spread
  const eGolden = b.addBlock('GoldenAngle', { turns: 50 });
  const eAngular = b.addBlock('AngularOffset', {});
  const eTotalAngle = b.addBlock('Add', {});
  const eRadius = b.addBlock('RadiusSqrt', { radius: 0.45 });
  const ePos = b.addBlock('FieldPolarToCartesian', {});

  b.wire(ellipseArray, 't', eGolden, 'id01');
  b.wire(ellipseArray, 't', eAngular, 'id01');
  b.wire(ellipseArray, 't', eRadius, 'id01');
  b.wire(time, 'phaseA', eAngular, 'phase');
  b.wire(eGolden, 'angle', eTotalAngle, 'a');
  b.wire(eAngular, 'offset', eTotalAngle, 'b');

  b.wire(eTotalAngle, 'out', ePos, 'angle');
  b.wire(eRadius, 'out', ePos, 'radius');

  // Ellipse color: warm hues
  const eHue = b.addBlock('HueFromPhase', {});
  b.wire(time, 'phaseA', eHue, 'phase');
  b.wire(ellipseArray, 't', eHue, 'id01');

  const eColor = b.addBlock('HsvToRgb', {});
  b.wire(eHue, 'hue', eColor, 'hue');

  // Ellipse per-element opacity: wave sweeps across elements
  const eOpacityPulse = b.addBlock('Pulse', { base: 0.3, amplitude: 0.7, spread: 1.5 });
  b.wire(ellipseArray, 't', eOpacityPulse, 'id01');
  b.wire(time, 'phaseA', eOpacityPulse, 'phase');

  const eOpacity = b.addBlock('ApplyOpacity', {});
  b.wire(eColor, 'color', eOpacity, 'color');
  b.wire(eOpacityPulse, 'value', eOpacity, 'opacity');

  const eRender = b.addBlock('RenderInstances2D', {});
  b.wire(ePos, 'pos', eRender, 'pos');
  b.wire(eOpacity, 'out', eRender, 'color'); // opacity-modulated color
  b.wire(ellipse, 'shape', eRender, 'shape');
  b.wire(eScaleExpr, 'out', eRender, 'scale'); // animated scale

  // === LAYER 2: Rectangles (counter-clockwise spiral) ===
  const rect = b.addBlock('Rect', { width: 0.025, height: 0.012 });
  const rectArray = b.addBlock('Array', { count: 100 });
  b.wire(rect, 'shape', rectArray, 'element');

  // Rect positions: golden spiral spinning counter-clockwise, wide spread
  const rGolden = b.addBlock('GoldenAngle', { turns: 30 });
  const rAngular = b.addBlock('AngularOffset', {});
  const rTotalAngle = b.addBlock('Add', {});
  const rRadius = b.addBlock('RadiusSqrt', { radius: 0.42 });
  const rPos = b.addBlock('FieldPolarToCartesian', {});

  b.wire(rectArray, 't', rGolden, 'id01');
  b.wire(rectArray, 't', rAngular, 'id01');
  b.wire(rectArray, 't', rRadius, 'id01');
  b.wire(time, 'phaseB', rAngular, 'phase');
  b.wire(rGolden, 'angle', rTotalAngle, 'a');
  b.wire(rAngular, 'offset', rTotalAngle, 'b');

  b.wire(rTotalAngle, 'out', rPos, 'angle');
  b.wire(rRadius, 'out', rPos, 'radius');

  // Rect color: complementary hues (offset by 0.5)
  const rPhaseOffset = b.addBlock('Expression', {
    expression: 'in0 + 0.5',
  });
  b.wire(time, 'phaseB', rPhaseOffset, 'in0');

  const rHue = b.addBlock('HueFromPhase', {});
  b.wire(rPhaseOffset, 'out', rHue, 'phase');
  b.wire(rectArray, 't', rHue, 'id01');

  const rColor = b.addBlock('HsvToRgb', {});
  b.wire(rHue, 'hue', rColor, 'hue');

  // Rect per-element opacity: counter-phase wave
  const rOpacityPulse = b.addBlock('Pulse', { base: 0.4, amplitude: 0.6, spread: 2.5 });
  b.wire(rectArray, 't', rOpacityPulse, 'id01');
  b.wire(time, 'phaseB', rOpacityPulse, 'phase');

  const rOpacity = b.addBlock('ApplyOpacity', {});
  b.wire(rColor, 'color', rOpacity, 'color');
  b.wire(rOpacityPulse, 'value', rOpacity, 'opacity');

  const rRender = b.addBlock('RenderInstances2D', {});
  b.wire(rPos, 'pos', rRender, 'pos');
  b.wire(rOpacity, 'out', rRender, 'color'); // opacity-modulated color
  b.wire(rect, 'shape', rRender, 'shape');
  b.wire(rScaleExpr, 'out', rRender, 'scale'); // animated counter-pulse scale
};
