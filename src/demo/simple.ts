/**
 * Simple Demo - Minimum viable patch
 *
 * 4 circles in a circle layout. The simplest possible working patch.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchSimple: PatchBuilder = (b) => {
  const timeRoot = b.addBlock('InfiniteTimeRoot', { role: timeRootRole() });
  b.setPortDefault(timeRoot, 'periodAMs', 4000);
  b.setPortDefault(timeRoot, 'periodBMs', 120000);

  const ellipse = b.addBlock('Ellipse');
  b.setPortDefault(ellipse, 'rx', 0.04);
  b.setPortDefault(ellipse, 'ry', 0.04);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 4);
  b.wire(ellipse, 'shape', array, 'element');

  const layout = b.addBlock('CircleLayoutUV');
  b.setPortDefault(layout, 'radius', 0.2);
  b.wire(array, 'elements', layout, 'elements');

  // Color: signal→field requires explicit Broadcast
  const colorSig = b.addBlock('Const');
  b.setConfig(colorSig, 'value', { r: 0.4, g: 0.6, b: 1.0, a: 1.0 });
  const colorField = b.addBlock('Broadcast');
  b.wire(colorSig, 'out', colorField, 'signal');

  const render = b.addBlock('RenderInstances2D');
  b.wire(layout, 'position', render, 'pos');
  b.wire(colorField, 'field', render, 'color');
  b.wire(ellipse, 'shape', render, 'shape');
};
