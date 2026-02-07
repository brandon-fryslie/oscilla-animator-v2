/**
 * Tile Grid - Rectangle mosaic with per-element color
 *
 * 20x20 grid of rectangles. Each tile gets a unique hue from the spectrum,
 * slowly cycling over time.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchTileGrid: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', { role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 3000);
  b.setPortDefault(time, 'periodBMs', 15000);

  const rect = b.addBlock('Rect');
  b.setPortDefault(rect, 'width', 0.018);
  b.setPortDefault(rect, 'height', 0.012);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 400);
  b.wire(rect, 'shape', array, 'element');

  const grid = b.addBlock('GridLayoutUV');
  b.setPortDefault(grid, 'rows', 20);
  b.setPortDefault(grid, 'cols', 20);
  b.wire(array, 'elements', grid, 'elements');

  // Per-element cycling hue
  const hueAdd = b.addBlock('Add');
  b.wire(array, 't', hueAdd, 'a');
  b.wire(time, 'phaseA', hueAdd, 'b');

  const color = b.addBlock('MakeColorHSL');
  b.wire(hueAdd, 'out', color, 'h');

  const render = b.addBlock('RenderInstances2D');
  b.wire(grid, 'position', render, 'pos');
  b.wire(color, 'color', render, 'color');
};

/**
 * Tile Grid UV - Rectangle mosaic (UV layout variant)
 *
 * Same as Tile Grid but with per-element desaturated blue-to-cyan gradient.
 */
export const patchTileGridUV: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', { role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 3000);
  b.setPortDefault(time, 'periodBMs', 10000);

  const rect = b.addBlock('Rect');
  b.setPortDefault(rect, 'width', 0.018);
  b.setPortDefault(rect, 'height', 0.012);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 400);
  b.wire(rect, 'shape', array, 'element');

  const grid = b.addBlock('GridLayoutUV');
  b.setPortDefault(grid, 'rows', 20);
  b.setPortDefault(grid, 'cols', 20);
  b.wire(array, 'elements', grid, 'elements');

  // Per-element hue in the blue-cyan range (0.5–0.75), shifting with time
  // Multiply t by 0.25 to compress the hue range, then add 0.5 base + time offset
  const hueRange = b.addBlock('Const');
  b.setConfig(hueRange, 'value', 0.25);
  const hueBase = b.addBlock('Const');
  b.setConfig(hueBase, 'value', 0.5);

  const hueScaled = b.addBlock('Multiply');
  b.wire(array, 't', hueScaled, 'a');
  b.wire(hueRange, 'out', hueScaled, 'b');

  const hueOffset = b.addBlock('Add');
  b.wire(hueScaled, 'out', hueOffset, 'a');
  b.wire(hueBase, 'out', hueOffset, 'b');

  const hueAnimated = b.addBlock('Add');
  b.wire(hueOffset, 'out', hueAnimated, 'a');
  b.wire(time, 'phaseB', hueAnimated, 'b');

  const saturation = b.addBlock('Const');
  b.setConfig(saturation, 'value', 0.6);

  const color = b.addBlock('MakeColorHSL');
  b.wire(hueAnimated, 'out', color, 'h');
  b.wire(saturation, 'out', color, 's');

  const render = b.addBlock('RenderInstances2D');
  b.wire(grid, 'position', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(rect, 'shape', render, 'shape');
};
