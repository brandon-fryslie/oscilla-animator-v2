/**
 * Rect Mosaic - Animated rectangle spiral with jitter and opacity
 *
 * Rectangles in a golden spiral with per-element jitter for organic feel.
 * Animated scale pulsing and opacity fade create depth illusion.
 * Demonstrates Rect topology + scale + opacity through shape2d pipeline.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchRectMosaic: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 4000,
    periodBMs: 7000,
  }, { role: timeRootRole() });

  // Rectangle shape
  const rect = b.addBlock('Rect', { width: 0.03, height: 0.015 });
  const array = b.addBlock('Array', { count: 400 });
  b.wire(rect, 'shape', array, 'element');

  // Position: golden spiral with jitter for organic randomness
  const goldenAngle = b.addBlock('GoldenAngle', { turns: 80 });
  const angularOffset = b.addBlock('AngularOffset', {});
  const totalAngle = b.addBlock('Add', {});
  const effectiveRadius = b.addBlock('RadiusSqrt', { radius: 0.45 });
  const pos = b.addBlock('FieldPolarToCartesian', {});

  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(array, 't', effectiveRadius, 'id01');

  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');

  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  // Add jitter for organic per-element randomness
  const jitter = b.addBlock('Jitter2D', { amountX: 0.02, amountY: 0.02 });
  const timeBroadcast = b.addBlock('Broadcast', { payloadType: 'float' });
  const jitterRand = b.addBlock('Add', {});
  b.wire(time, 'tMs', timeBroadcast, 'signal');
  b.wire(timeBroadcast, 'field', jitterRand, 'a');
  b.wire(array, 't', jitterRand, 'b');
  b.wire(pos, 'pos', jitter, 'pos');
  b.wire(jitterRand, 'out', jitter, 'rand');

  // Color from index + time
  const hue = b.addBlock('HueFromPhase', {});
  b.wire(time, 'phaseB', hue, 'phase');
  b.wire(array, 't', hue, 'id01');

  const color = b.addBlock('HsvToRgb', {});
  b.wire(hue, 'hue', color, 'hue');

  // Per-element animated opacity: wave that sweeps across elements
  const opacityPulse = b.addBlock('Pulse', { base: 0.4, amplitude: 0.6, spread: 2.0 });
  b.wire(array, 't', opacityPulse, 'id01');
  b.wire(time, 'phaseB', opacityPulse, 'phase');

  const opacity = b.addBlock('ApplyOpacity', {});
  b.wire(color, 'color', opacity, 'color');
  b.wire(opacityPulse, 'value', opacity, 'opacity');

  // Animated scale: pulsing
  const scaleExpr = b.addBlock('Expression', {
    expression: '1.0 + 0.5 * sin(in0 * 6.28 + 1.57)', // quarter-phase offset from opacity
  });
  b.wire(time, 'phaseA', scaleExpr, 'in0');

  // Render with rect shape, animated scale and opacity
  const render = b.addBlock('RenderInstances2D', {});
  b.wire(jitter, 'out', render, 'pos');
  b.wire(opacity, 'out', render, 'color');
  b.wire(rect, 'shape', render, 'shape');
  b.wire(scaleExpr, 'out', render, 'scale');
};
