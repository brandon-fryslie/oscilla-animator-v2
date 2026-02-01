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
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 12000,  // 12 second orbit
    periodBMs: 4000,   // 4 second wave
  }, { role: timeRootRole() });

  // Camera block
  const camera = b.addBlock('Camera', {});

  // Animated yaw: continuous 360° orbit around the scene
  const yawExpr = b.addBlock('Expression', {
    expression: 'in0 * 360.0',
  });
  const yawDeg = b.addBlock('Adapter_ScalarToDeg', {});
  b.wire(time, 'phaseA', yawExpr, 'in0');
  b.wire(yawExpr, 'out', yawDeg, 'in');
  b.wire(yawDeg, 'out', camera, 'yawDeg');

  // Grid of ellipses
  const ellipse = b.addBlock('Ellipse', { rx: 0.03, ry: 0.03 });
  const array = b.addBlock('Array', { count: 100 }); // 10x10 grid
  b.wire(ellipse, 'shape', array, 'element');

  // Grid layout (XY positions) - using UV variant
  const grid = b.addBlock('GridLayoutUV', { rows: 10, cols: 10 });
  b.wire(array, 'elements', grid, 'elements');

  // Simple constant color
  const color = b.addBlock('Const', { value: { r: 0.5, g: 0.8, b: 1.0, a: 1.0 } }); // Light blue

  // Render
  const render = b.addBlock('RenderInstances2D', {});
  b.wire(grid, 'position', render, 'pos');
  b.wire(color, 'out', render, 'color');
  b.wire(ellipse, 'shape', render, 'shape');
};
