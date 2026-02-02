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
  const time = b.addBlock('InfiniteTimeRoot', { displayName: 'Time', role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 4000);
  b.setPortDefault(time, 'periodBMs', 7000);

  // Rectangle shape
  const rect = b.addBlock('Rect');
  b.setPortDefault(rect, 'width', 0.03);
  b.setPortDefault(rect, 'height', 0.015);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 400);
  b.wire(rect, 'shape', array, 'element');

  // Circle layout instead of golden spiral
  const layout = b.addBlock('CircleLayoutUV');
  b.setPortDefault(layout, 'radius', 0.45);
  b.wire(array, 'elements', layout, 'elements');

  // Simple constant color
  const color = b.addBlock('Const');
  b.setConfig(color, 'value', { r: 1.0, g: 0.6, b: 0.4, a: 1.0 }); // Warm salmon

  // Animated scale: pulsing
  const scaleExpr = b.addBlock('Expression');
  b.setConfig(scaleExpr, 'expression', '1.0 + 0.5 * sin(phase * 6.28 + 1.57)'); // quarter-phase offset
  b.addVarargConnection(scaleExpr, 'refs', 'v1:blocks.time.outputs.phaseA', 0, 'phase');

  // Render with rect shape and animated scale
  const render = b.addBlock('RenderInstances2D');
  b.wire(layout, 'position', render, 'pos');
  b.wire(color, 'out', render, 'color');
  b.wire(rect, 'shape', render, 'shape');
  b.wire(scaleExpr, 'out', render, 'scale');
};
