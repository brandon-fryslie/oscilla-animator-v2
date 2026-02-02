/**
 * Tile Grid - Rectangle mosaic with wave animation
 *
 * Grid of rectangles with simple color.
 * Demonstrates Rect primitive with grid layout.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchTileGrid: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', { role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 3000);
  b.setPortDefault(time, 'periodBMs', 7000);

  // Rectangles - wider than tall for tile effect
  const rect = b.addBlock('Rect');
  b.setPortDefault(rect, 'width', 0.018);
  b.setPortDefault(rect, 'height', 0.012);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 400); // 20x20 grid
  b.wire(rect, 'shape', array, 'element');

  // Grid layout: arranges elements in a 20x20 grid (using UV variant)
  const grid = b.addBlock('GridLayoutUV');
  b.setPortDefault(grid, 'rows', 20);
  b.setPortDefault(grid, 'cols', 20);
  b.wire(array, 'elements', grid, 'elements');

  // Simple constant color
  const color = b.addBlock('Const');
  b.setConfig(color, 'value', { r: 0.5, g: 0.8, b: 1.0, a: 1.0 }); // Light blue

  const render = b.addBlock('RenderInstances2D');
  b.wire(grid, 'position', render, 'pos');
  b.wire(color, 'out', render, 'color');
  b.wire(rect, 'shape', render, 'shape');
};

/**
 * Tile Grid UV - Rectangle mosaic with wave animation (UV layout variant)
 *
 * Grid of rectangles with simple color.
 * Uses GridLayoutUV for gauge-invariant placement basis instead of standard grid.
 * Demonstrates Rect primitive with grid layout.
 */
export const patchTileGridUV: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', { role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 3000);
  b.setPortDefault(time, 'periodBMs', 7000);

  // Rectangles - wider than tall for tile effect
  const rect = b.addBlock('Rect');
  b.setPortDefault(rect, 'width', 0.018);
  b.setPortDefault(rect, 'height', 0.012);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 400); // 20x20 grid
  b.wire(rect, 'shape', array, 'element');

  // Grid UV layout: arranges elements in a 20x20 grid with UV placement basis
  const grid = b.addBlock('GridLayoutUV');
  b.setPortDefault(grid, 'rows', 20);
  b.setPortDefault(grid, 'cols', 20);
  b.wire(array, 'elements', grid, 'elements');

  // Simple constant color
  const color = b.addBlock('Const');
  b.setConfig(color, 'value', { r: 0.5, g: 0.8, b: 1.0, a: 1.0 }); // Light blue

  const render = b.addBlock('RenderInstances2D');
  b.wire(grid, 'position', render, 'pos');
  b.wire(color, 'out', render, 'color');
  b.wire(rect, 'shape', render, 'shape');
};
