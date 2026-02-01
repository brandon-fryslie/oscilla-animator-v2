/**
 * Domain Test - Slow spiral for continuity testing
 *
 * 50 large ellipses for observing element identity during count changes.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchDomainTest: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 8000,
    periodBMs: 8000,
  }, { role: timeRootRole() });

  const ellipse = b.addBlock('Ellipse', { rx: 0.025, ry: 0.025 });
  const array = b.addBlock('Array', { count: 50 });
  b.wire(ellipse, 'shape', array, 'element');

  // Circle layout instead of golden spiral
  const circleLayout = b.addBlock('CircleLayoutUV', { radius: 0.35 });
  b.wire(array, 'elements', circleLayout, 'elements');

  // Simple constant color
  const color = b.addBlock('Const', { value: { r: 0.8, g: 0.6, b: 1.0, a: 1.0 } }); // Purple

  const render = b.addBlock('RenderInstances2D', {});
  b.wire(circleLayout, 'position', render, 'pos');
  b.wire(color, 'out', render, 'color');
  b.wire(ellipse, 'shape', render, 'shape');
};
