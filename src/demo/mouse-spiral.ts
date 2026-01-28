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
  b.addBlock('InfiniteTimeRoot', {
    periodAMs: 4000,
    periodBMs: 8000,
  }, { role: timeRootRole() });

  // External inputs - mouse position and click state
  const mouseX = b.addBlock('ExternalInput', { channel: 'mouse.x' });
  const mouseY = b.addBlock('ExternalInput', { channel: 'mouse.y' });
  const clickState = b.addBlock('ExternalInput', { channel: 'mouse.button.left.held' });

  // Create array of 24 circles
  const ellipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
  const array = b.addBlock('Array', { count: 24 });
  b.wire(ellipse, 'shape', array, 'element');

  // Convert mouse X (0-1) to rotation (0-2π)
  const twoPi = b.addBlock('Const', { value: 6.283185307179586 });
  const mouseRotation = b.addBlock('Multiply', {});
  b.wire(mouseX, 'value', mouseRotation, 'a');
  b.wire(twoPi, 'out', mouseRotation, 'b');

  // Spiral radius: base + index spread + mouse Y influence
  // Base offset so spiral is always visible (centered at ~0.25 from origin)
  const radiusBaseOffset = b.addBlock('Const', { value: 0.1 });
  const radiusIndexSpread = b.addBlock('Multiply', {});
  const radiusIndexScale = b.addBlock('Const', { value: 0.01 }); // 0 to 0.23 spread
  const radiusWithIndex = b.addBlock('Add', {});

  const radiusMouseInfluence = b.addBlock('Multiply', {});
  const radiusMouseScale = b.addBlock('Const', { value: 0.2 }); // Mouse adds 0 to 0.2
  const totalRadius = b.addBlock('Add', {});

  b.wire(array, 't', radiusIndexSpread, 'a');
  b.wire(radiusIndexScale, 'out', radiusIndexSpread, 'b');
  b.wire(radiusBaseOffset, 'out', radiusWithIndex, 'a');
  b.wire(radiusIndexSpread, 'out', radiusWithIndex, 'b');

  b.wire(mouseY, 'value', radiusMouseInfluence, 'a');
  b.wire(radiusMouseScale, 'out', radiusMouseInfluence, 'b');
  b.wire(radiusWithIndex, 'out', totalRadius, 'a');
  b.wire(radiusMouseInfluence, 'out', totalRadius, 'b');

  // Spiral angle: index spacing + mouse rotation
  const angleSpacing = b.addBlock('Const', { value: 1.0472 }); // ~60 degrees for tighter spiral
  const angleBase = b.addBlock('Multiply', {});
  const totalAngle = b.addBlock('Add', {});

  b.wire(array, 't', angleBase, 'a');
  b.wire(angleSpacing, 'out', angleBase, 'b');
  b.wire(angleBase, 'out', totalAngle, 'a');
  b.wire(mouseRotation, 'out', totalAngle, 'b');

  // Convert polar to cartesian
  const pos = b.addBlock('FieldPolarToCartesian', {});
  b.wire(totalRadius, 'out', pos, 'radius');
  b.wire(totalAngle, 'out', pos, 'angle');

  // Size: base size + click bonus (made bigger so it's visible)
  const baseSize = b.addBlock('Const', { value: 0.015 });
  const clickBonus = b.addBlock('Multiply', {});
  const clickScale = b.addBlock('Const', { value: 0.015 });
  const finalSize = b.addBlock('Add', {});

  b.wire(clickState, 'value', clickBonus, 'a');
  b.wire(clickScale, 'out', clickBonus, 'b');
  b.wire(baseSize, 'out', finalSize, 'a');
  b.wire(clickBonus, 'out', finalSize, 'b');

  // Rainbow colors using instance index
  // HueFromPhase takes id01 (instance index 0-1) and phase (0-1 offset)
  const hue = b.addBlock('HueFromPhase', {});
  const color = b.addBlock('HsvToRgb', { sat: 1.0, val: 1.0 });

  b.wire(array, 't', hue, 'id01');  // Instance index provides the hue variation
  b.wire(hue, 'hue', color, 'hue');

  // Render
  const render = b.addBlock('RenderInstances2D', {});
  b.wire(pos, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(ellipse, 'shape', render, 'shape');
  b.wire(finalSize, 'out', render, 'scale');
};
