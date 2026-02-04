/**
 * Mouse-Controlled Spiral - ExternalInput Demo
 *
 * Interactive spiral of 24 colored circles that responds to mouse input:
 * - Mouse X position controls rotation
 * - Mouse Y position controls expansion/contraction
 * - Left click makes circles grow
 *
 * Demonstrates ExternalInput blocks reading from external channels.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchMouseSpiral: PatchBuilder = (b) => {
  // Time root (required for every patch)
  const time = b.addBlock('InfiniteTimeRoot', { role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 4000);
  b.setPortDefault(time, 'periodBMs', 8000);

  // External inputs - mouse position and click state
  const mouseX = b.addBlock('ExternalInput');
  b.setConfig(mouseX, 'channel', 'mouse.x');

  const mouseY = b.addBlock('ExternalInput');
  b.setConfig(mouseY, 'channel', 'mouse.y');

  const clickState = b.addBlock('ExternalInput');
  b.setConfig(clickState, 'channel', 'mouse.button.left.held');

  // Create array of 24 circles
  const ellipse = b.addBlock('Ellipse');
  b.setPortDefault(ellipse, 'rx', 0.02);
  b.setPortDefault(ellipse, 'ry', 0.02);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 24);
  b.wire(ellipse, 'shape', array, 'element');

  // Use CircleLayoutUV for positioning
  const layout = b.addBlock('CircleLayoutUV');
  b.setPortDefault(layout, 'radius', 0.3);
  b.wire(array, 'elements', layout, 'elements');

  // Size: base size + click bonus
  const baseSize = b.addBlock('Const');
  b.setConfig(baseSize, 'value', 0.015);

  const clickBonus = b.addBlock('Multiply');

  const clickScale = b.addBlock('Const');
  b.setConfig(clickScale, 'value', 0.015);

  const finalSize = b.addBlock('Add');

  b.wire(clickState, 'value', clickBonus, 'a');
  b.wire(clickScale, 'out', clickBonus, 'b');
  b.wire(baseSize, 'out', finalSize, 'a');
  b.wire(clickBonus, 'out', finalSize, 'b');

  // Simple constant rainbow colors
  const color = b.addBlock('Const');
  b.setConfig(color, 'value', { r: 0.8, g: 0.6, b: 1.0, a: 1.0 }); // Purple

  // Render
  const render = b.addBlock('RenderInstances2D');
  b.wire(layout, 'position', render, 'pos');
  b.wire(color, 'out', render, 'color');
  b.wire(finalSize, 'out', render, 'scale');
};
