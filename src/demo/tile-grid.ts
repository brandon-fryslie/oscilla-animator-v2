/**
 * Tile Grid - Rectangle mosaic with wave animation
 *
 * Grid of rectangles with diagonal color gradient and wave motion.
 * Demonstrates Rect primitive with Expression-based positioning.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchTileGrid: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 3000,
    periodBMs: 7000,
  }, { role: timeRootRole() });

  // Rectangles - wider than tall for tile effect
  const rect = b.addBlock('Rect', { width: 0.018, height: 0.012 });
  const array = b.addBlock('Array', { count: 400 }); // 20x20 grid
  b.wire(rect, 'shape', array, 'element');

  // Grid layout: arranges elements in a 20x20 grid
  const grid = b.addBlock('GridLayout', { rows: 20, cols: 20 });
  b.wire(array, 'elements', grid, 'elements');

  // Rainbow gradient color from element position + time
  const hue = b.addBlock('HueFromPhase', {});
  b.wire(time, 'phaseB', hue, 'phase');
  b.wire(array, 't', hue, 'id01');

  const color = b.addBlock('HsvToRgb', {});
  b.wire(hue, 'hue', color, 'hue');

  const render = b.addBlock('RenderInstances2D', {});
  b.wire(grid, 'position', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(rect, 'shape', render, 'shape');
};
