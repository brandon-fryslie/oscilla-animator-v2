/**
 * Domain Test - Slow spiral for continuity testing
 *
 * 50 large ellipses with rotating motion and animated per-element rainbow.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchDomainTest: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', { role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 8000);
  b.setPortDefault(time, 'periodBMs', 20000);

  const ellipse = b.addBlock('Ellipse');
  b.setPortDefault(ellipse, 'rx', 0.025);
  b.setPortDefault(ellipse, 'ry', 0.025);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 50);
  b.wire(ellipse, 'shape', array, 'element');

  const circleLayout = b.addBlock('CircleLayoutUV');
  b.setPortDefault(circleLayout, 'radius', 0.35);
  b.wire(array, 'elements', circleLayout, 'elements');
  b.wire(time, 'phaseA', circleLayout, 'phase');

  // Per-element animated hue: rainbow shifts over time
  const hueAdd = b.addBlock('Add');
  b.wire(array, 't', hueAdd, 'a');
  b.wire(time, 'phaseB', hueAdd, 'b');

  const color = b.addBlock('MakeColorHSL');
  b.wire(hueAdd, 'out', color, 'h');

  const render = b.addBlock('RenderInstances2D');
  b.wire(circleLayout, 'position', render, 'pos');
  b.wire(color, 'color', render, 'color');
};
