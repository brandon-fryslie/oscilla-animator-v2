/**
 * Mouse-Controlled Spiral - ExternalInput Demo
 *
 * 24 circles responding to mouse input with per-element rainbow colors
 * that shift over time. Click to grow circles.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchMouseSpiral: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', { role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 4000);
  b.setPortDefault(time, 'periodBMs', 6000);

  const mouseX = b.addBlock('ExternalInput');
  b.setConfig(mouseX, 'channel', 'mouse.x');

  const mouseY = b.addBlock('ExternalInput');
  b.setConfig(mouseY, 'channel', 'mouse.y');

  const clickState = b.addBlock('ExternalInput');
  b.setConfig(clickState, 'channel', 'mouse.button.left.held');

  const ellipse = b.addBlock('Ellipse');
  b.setPortDefault(ellipse, 'rx', 0.02);
  b.setPortDefault(ellipse, 'ry', 0.02);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 24);
  b.wire(ellipse, 'shape', array, 'element');

  const layout = b.addBlock('CircleLayoutUV');
  b.setPortDefault(layout, 'radius', 0.3);
  b.wire(array, 'elements', layout, 'elements');
  b.wire(time, 'phaseA', layout, 'phase');

  // Click-responsive scale
  const baseSize = b.addBlock('Const');
  b.setConfig(baseSize, 'value', 0.015);
  const clickScale = b.addBlock('Const');
  b.setConfig(clickScale, 'value', 0.015);
  const clickBonus = b.addBlock('Multiply');
  b.wire(clickState, 'value', clickBonus, 'a');
  b.wire(clickScale, 'out', clickBonus, 'b');
  const finalSize = b.addBlock('Add');
  b.wire(baseSize, 'out', finalSize, 'a');
  b.wire(clickBonus, 'out', finalSize, 'b');

  // Per-element animated rainbow
  const hueAdd = b.addBlock('Add');
  b.wire(array, 't', hueAdd, 'a');
  b.wire(time, 'phaseB', hueAdd, 'b');

  const color = b.addBlock('MakeColorHSL');
  b.wire(hueAdd, 'out', color, 'h');

  const render = b.addBlock('RenderInstances2D');
  b.wire(layout, 'position', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(finalSize, 'out', render, 'scale');
};
