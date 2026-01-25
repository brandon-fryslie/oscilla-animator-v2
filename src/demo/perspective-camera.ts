/**
 * Perspective Camera Demo - 3D grid with animated camera
 *
 * Grid of ellipses viewed through a perspective camera with animated
 * tilt and yaw rotation. Demonstrates foreshortening and depth sorting.
 *
 * Adding a Camera block is simple:
 *   1. Add Camera block (defaults to perspective)
 *   2. Wire animated values to tiltDeg/yawDeg for camera motion
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchPerspectiveCamera: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 12000,  // 12 second orbit
    periodBMs: 4000,   // 4 second wave for Z animation
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

  // Grid layout (XY positions)
  const grid = b.addBlock('GridLayout', { rows: 10, cols: 10 });
  b.wire(array, 'elements', grid, 'elements');

  // Animated Z: per-element wave based on position in grid
  // z = 0.15 * sin(2π * (id01 + phaseB))
  const zWave = b.addBlock('Pulse', { base: 0.0, amplitude: 0.15, spread: 2.0 });
  b.wire(array, 't', zWave, 'id01');
  b.wire(time, 'phaseB', zWave, 'phase');

  // Apply Z to positions
  const posWithZ = b.addBlock('SetZ', {});
  b.wire(grid, 'position', posWithZ, 'pos');
  b.wire(zWave, 'value', posWithZ, 'z');

  // Rainbow color based on grid position (static colors)
  const hue = b.addBlock('HueFromPhase', {});
  b.wire(array, 't', hue, 'id01');

  const color = b.addBlock('HsvToRgb', {});
  b.wire(hue, 'hue', color, 'hue');

  // Render with Z-animated positions
  const render = b.addBlock('RenderInstances2D', {});
  b.wire(posWithZ, 'out', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(ellipse, 'shape', render, 'shape');
};
