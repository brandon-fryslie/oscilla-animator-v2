/**
 * Error Isolation Demo
 *
 * Demonstrates that blocks with errors that are NOT connected to the render
 * pipeline don't break compilation. The main animation runs while warnings
 * are emitted for the broken disconnected blocks.
 *
 * Check the diagnostic console for W_BLOCK_UNREACHABLE_ERROR warnings.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchErrorIsolationDemo: PatchBuilder = (b) => {
  // ========================================================================
  // WORKING RENDER PIPELINE - A simple animated grid
  // ========================================================================

  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 2000,
    periodBMs: 10000,
  }, { role: timeRootRole() });

  // Create a grid of circles
  const circle = b.addBlock('Ellipse', { rx: 0.03, ry: 0.03 });
  const array = b.addBlock('Array', { count: 100 });
  b.wire(circle, 'shape', array, 'element');

  // Grid layout
  const grid = b.addBlock('GridLayout', {
    columns: 10,
    width: 0.8,
    height: 0.8,
  });
  b.wire(array, 'idx', grid, 'idx');
  b.wire(array, 'count', grid, 'count');

  // Animated color based on position and time
  const hue = b.addBlock('HueFromPhase', {});
  const color = b.addBlock('HsvToRgb', { sat: 0.7, val: 0.9 });
  b.wire(array, 't', hue, 'id01');
  b.wire(time, 'phaseA', hue, 'phase');
  b.wire(hue, 'hue', color, 'hue');

  // Render the grid
  const render = b.addBlock('RenderInstances2D', {});
  b.wire(grid, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(circle, 'shape', render, 'shape');

  // ========================================================================
  // BROKEN DISCONNECTED BLOCKS - These should NOT stop compilation
  // ========================================================================

  // Expression block with invalid syntax - NOT connected to render
  // This will produce a warning, not an error
  b.addBlock('Expression', {
    expression: 'this is not valid +++',
    // label: 'Broken Expression 1',
  });

  // Another broken expression - also disconnected
  b.addBlock('Expression', {
    expression: 'in0 +',  // Incomplete syntax
    // label: 'Broken Expression 2',
  });

  // A small disconnected subgraph with an error
  const brokenExpr = b.addBlock('Expression', {
    expression: '*** invalid ***',
    // label: 'Broken Subgraph Source',
  });
  const unusedAdd = b.addBlock('Add', {});
  b.wire(brokenExpr, 'out', unusedAdd, 'a');
  // This whole subgraph is disconnected from render - won't fail compilation

  // ========================================================================
  // This demo proves:
  // 1. The animation runs despite broken blocks
  // 2. Warnings appear in diagnostics for unreachable errors
  // 3. Only blocks feeding into render affect compilation success
  // ========================================================================
};
