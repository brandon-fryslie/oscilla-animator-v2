/**
 * Golden Spiral - Main demo patch
 *
 * 5000 ellipses in a circle layout.
 * Simplified version using CircleLayoutUV.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchGoldenSpiral: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', { role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 4000);
  b.setPortDefault(time, 'periodBMs', 120000);

  const ellipse = b.addBlock('Ellipse');
  b.setPortDefault(ellipse, 'rx', 0.02);
  b.setPortDefault(ellipse, 'ry', 0.02);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 5000);
  b.wire(ellipse, 'shape', array, 'element');

  // Circle layout instead of golden spiral
  const circleLayout = b.addBlock('CircleLayoutUV');
  b.setPortDefault(circleLayout, 'radius', 0.35);
  b.wire(array, 'elements', circleLayout, 'elements');

  // Simple constant color
  const color = b.addBlock('Const');
  b.setConfig(color, 'value', { r: 0.9, g: 0.7, b: 0.5, a: 1.0 }); // Warm yellow

  const render = b.addBlock('RenderInstances2D');
  b.wire(circleLayout, 'position', render, 'pos');
  b.wire(color, 'out', render, 'color');
  b.wire(ellipse, 'shape', render, 'shape');
};
