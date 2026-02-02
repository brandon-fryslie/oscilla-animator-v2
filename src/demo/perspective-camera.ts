/**
 * Perspective Camera Demo - 3D grid with animated camera
 *
 * Grid of ellipses viewed through a perspective camera with animated
 * tilt and yaw rotation. Demonstrates camera functionality.
 *
 * Simplified version using GridLayoutUV.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchPerspectiveCamera: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', { displayName: 'Time', role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 12000); // 12 second orbit
  b.setPortDefault(time, 'periodBMs', 4000);  // 4 second wave

  // Camera block
  const camera = b.addBlock('Camera');

  // Animated yaw: continuous 360° orbit around the scene
  const yawExpr = b.addBlock('Expression');
  b.setConfig(yawExpr, 'expression', 'phase * 360.0');
  b.addVarargConnection(yawExpr, 'refs', 'v1:blocks.time.outputs.phaseA', 0, 'phase');

  const yawDeg = b.addBlock('Adapter_ScalarToDeg');
  b.wire(yawExpr, 'out', yawDeg, 'in');
  b.wire(yawDeg, 'out', camera, 'yawDeg');

  // Grid of ellipses
  const ellipse = b.addBlock('Ellipse');
  b.setPortDefault(ellipse, 'rx', 0.03);
  b.setPortDefault(ellipse, 'ry', 0.03);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 100); // 10x10 grid
  b.wire(ellipse, 'shape', array, 'element');

  // Grid layout (XY positions) - using UV variant
  const grid = b.addBlock('GridLayoutUV');
  b.setPortDefault(grid, 'rows', 10);
  b.setPortDefault(grid, 'cols', 10);
  b.wire(array, 'elements', grid, 'elements');

  // Simple constant color
  const color = b.addBlock('Const');
  b.setConfig(color, 'value', { r: 0.5, g: 0.8, b: 1.0, a: 1.0 }); // Light blue

  // Render
  const render = b.addBlock('RenderInstances2D');
  b.wire(grid, 'position', render, 'pos');
  b.wire(color, 'out', render, 'color');
  b.wire(ellipse, 'shape', render, 'shape');
};
