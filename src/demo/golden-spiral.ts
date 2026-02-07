/**
 * Golden Spiral - Main demo patch
 *
 * 5000 ellipses in a slowly rotating circle layout.
 * Static rainbow gradient across all elements — each element a unique hue.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchGoldenSpiral: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', { role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 30000);
  b.setPortDefault(time, 'periodBMs', 120000);

  const ellipse = b.addBlock('Ellipse');
  b.setPortDefault(ellipse, 'rx', 0.02);
  b.setPortDefault(ellipse, 'ry', 0.02);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 5000);
  b.wire(ellipse, 'shape', array, 'element');

  const circleLayout = b.addBlock('CircleLayoutUV');
  b.setPortDefault(circleLayout, 'radius', 0.35);
  b.wire(array, 'elements', circleLayout, 'elements');
  b.wire(time, 'phaseA', circleLayout, 'phase');

  // Per-element hue: each element gets its own slice of the spectrum
  const color = b.addBlock('MakeColorHSL');
  b.wire(array, 't', color, 'h');

  const render = b.addBlock('RenderInstances2D');
  b.wire(circleLayout, 'position', render, 'pos');
  b.wire(color, 'color', render, 'color');
};
