/**
 * Rect Mosaic - Animated rectangle spiral
 *
 * 400 rectangles in a rotating circle layout with pulsing scale
 * and per-element green-to-teal gradient that shifts over time.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchRectMosaic: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', { displayName: 'Time', role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 4000);
  b.setPortDefault(time, 'periodBMs', 7000);

  const rect = b.addBlock('Rect');
  b.setPortDefault(rect, 'width', 0.03);
  b.setPortDefault(rect, 'height', 0.015);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 400);
  b.wire(rect, 'shape', array, 'element');

  const layout = b.addBlock('CircleLayoutUV');
  b.setPortDefault(layout, 'radius', 0.45);
  b.wire(array, 'elements', layout, 'elements');
  b.wire(time, 'phaseA', layout, 'phase');

  // Per-element green-to-teal (hue 0.25→0.5), shifting with time
  const hueRange = b.addBlock('Const');
  b.setConfig(hueRange, 'value', 0.25);
  const hueBase = b.addBlock('Const');
  b.setConfig(hueBase, 'value', 0.25);

  const hueScaled = b.addBlock('Multiply');
  b.wire(array, 't', hueScaled, 'a');
  b.wire(hueRange, 'out', hueScaled, 'b');

  const hueOffset = b.addBlock('Add');
  b.wire(hueScaled, 'out', hueOffset, 'a');
  b.wire(hueBase, 'out', hueOffset, 'b');

  const hueAnimated = b.addBlock('Add');
  b.wire(hueOffset, 'out', hueAnimated, 'a');
  b.wire(time, 'phaseB', hueAnimated, 'b');

  const color = b.addBlock('MakeColorHSL');
  b.wire(hueAnimated, 'out', color, 'h');

  // Pulsing scale
  const scaleExpr = b.addBlock('Expression');
  b.setConfig(scaleExpr, 'expression', '1.0 + 0.5 * sin(phase * 6.28 + 1.57)');
  b.addVarargConnection(scaleExpr, 'refs', 'v1:blocks.time.outputs.phaseA', 0, 'phase');

  const render = b.addBlock('RenderInstances2D');
  b.wire(layout, 'position', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(scaleExpr, 'out', render, 'scale');
};
