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

  // Grid layout (using UV variant)
  const grid = b.addBlock('GridLayoutUV', { rows: 10, cols: 10 });
  b.wire(array, 'elements', grid, 'elements');

  // Simple constant color
  const color = b.addBlock('Const', { value: [0.7, 0.9, 0.8, 1.0] }); // Light cyan

  // Render the grid
  const render = b.addBlock('RenderInstances2D', {});
  b.wire(grid, 'position', render, 'pos');
  b.wire(color, 'out', render, 'color');
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
