/**
 * Golden Spiral - Main demo patch
 *
 * 5000 ellipses in a circle layout.
 * Simplified version using CircleLayoutUV.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchGoldenSpiral: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 4000,
    periodBMs: 120000,
  }, { role: timeRootRole() });

  const ellipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
  const array = b.addBlock('Array', { count: 5000 });
  b.wire(ellipse, 'shape', array, 'element');

  // Circle layout instead of golden spiral
  const circleLayout = b.addBlock('CircleLayoutUV', { radius: 0.35 });
  b.wire(array, 'elements', circleLayout, 'elements');

  // Simple constant color
  const color = b.addBlock('Const', { value: [0.9, 0.7, 0.5, 1.0] }); // Warm yellow

  const render = b.addBlock('RenderInstances2D', {});
  b.wire(circleLayout, 'position', render, 'pos');
  b.wire(color, 'out', render, 'color');
  b.wire(ellipse, 'shape', render, 'shape');
};
