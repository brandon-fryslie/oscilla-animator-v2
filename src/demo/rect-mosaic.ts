/**
 * Rect Mosaic - Animated rectangle spiral
 *
 * Rectangles in a circle layout with animated scale.
 * Demonstrates Rect topology + scale through shape2d pipeline.
 * Simplified to use CircleLayoutUV.
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

  // Circle layout instead of golden spiral
  const layout = b.addBlock('CircleLayoutUV', { radius: 0.45 });
  b.wire(array, 'elements', layout, 'elements');

  // Simple constant color
  const color = b.addBlock('Const', { value: { r: 1.0, g: 0.6, b: 0.4, a: 1.0 } }); // Warm salmon

  // Animated scale: pulsing
  const scaleExpr = b.addBlock('Expression', {
    expression: '1.0 + 0.5 * sin(in0 * 6.28 + 1.57)', // quarter-phase offset
  });
  b.wire(time, 'phaseA', scaleExpr, 'in0');

  // Render with rect shape and animated scale
  const render = b.addBlock('RenderInstances2D', {});
  b.wire(layout, 'position', render, 'pos');
  b.wire(color, 'out', render, 'color');
  b.wire(rect, 'shape', render, 'shape');
  b.wire(scaleExpr, 'out', render, 'scale');
};
