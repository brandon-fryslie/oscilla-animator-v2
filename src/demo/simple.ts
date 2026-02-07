/**
 * Simple Demo - Minimum viable patch
 *
 * 4 circles in a rotating circle layout with per-element rainbow that shifts over time.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchSimple: PatchBuilder = (b) => {
  const timeRoot = b.addBlock('InfiniteTimeRoot', { role: timeRootRole() });
  b.setPortDefault(timeRoot, 'periodAMs', 4000);
  b.setPortDefault(timeRoot, 'periodBMs', 12000);

  const ellipse = b.addBlock('Ellipse');
  b.setPortDefault(ellipse, 'rx', 0.04);
  b.setPortDefault(ellipse, 'ry', 0.04);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 4);
  b.wire(ellipse, 'shape', array, 'element');

  const layout = b.addBlock('CircleLayoutUV');
  b.setPortDefault(layout, 'radius', 0.2);
  b.wire(array, 'elements', layout, 'elements');
  b.wire(timeRoot, 'phaseA', layout, 'phase');

  // Per-element rainbow: hue = normalizedIndex + time
  const hueAdd = b.addBlock('Add');
  b.wire(array, 't', hueAdd, 'a');
  b.wire(timeRoot, 'phaseB', hueAdd, 'b');

  const color = b.addBlock('MakeColorHSL');
  b.wire(hueAdd, 'out', color, 'h');

  const render = b.addBlock('RenderInstances2D');
  b.wire(layout, 'position', render, 'pos');
  b.wire(color, 'color', render, 'color');
};
