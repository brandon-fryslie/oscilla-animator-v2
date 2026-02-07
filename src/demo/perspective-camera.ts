/**
 * Perspective Camera Demo - 3D grid with animated camera
 *
 * Grid of ellipses viewed through a perspective camera with animated yaw.
 * Per-element warm gradient (red→yellow) that shifts with time.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchPerspectiveCamera: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', { displayName: 'Time', role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 12000);
  b.setPortDefault(time, 'periodBMs', 8000);

  // Camera with animated yaw: phaseA [0,1) → degrees [0,360)
  const yawDeg = b.addBlock('Adapter_PhaseToDegrees');
  b.wire(time, 'phaseA', yawDeg, 'in');
  const camera = b.addBlock('Camera');
  b.wire(yawDeg, 'out', camera, 'yawDeg');

  const ellipse = b.addBlock('Ellipse');
  b.setPortDefault(ellipse, 'rx', 0.03);
  b.setPortDefault(ellipse, 'ry', 0.03);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 100);
  b.wire(ellipse, 'shape', array, 'element');

  const grid = b.addBlock('GridLayoutUV');
  b.setPortDefault(grid, 'rows', 10);
  b.setPortDefault(grid, 'cols', 10);
  b.wire(array, 'elements', grid, 'elements');

  // Per-element hue: warm range (0.0→0.15 = red→yellow), shifting
  const hueRange = b.addBlock('Const');
  b.setConfig(hueRange, 'value', 0.15);

  const hueScaled = b.addBlock('Multiply');
  b.wire(array, 't', hueScaled, 'a');
  b.wire(hueRange, 'out', hueScaled, 'b');

  const hueAnimated = b.addBlock('Add');
  b.wire(hueScaled, 'out', hueAnimated, 'a');
  b.wire(time, 'phaseB', hueAnimated, 'b');

  const color = b.addBlock('MakeColorHSL');
  b.wire(hueAnimated, 'out', color, 'h');

  const render = b.addBlock('RenderInstances2D');
  b.wire(grid, 'position', render, 'pos');
  b.wire(color, 'color', render, 'color');
};
