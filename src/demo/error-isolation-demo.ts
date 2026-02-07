/**
 * Error Isolation Demo
 *
 * Demonstrates that disconnected broken blocks don't stop compilation.
 * The main grid animates with per-element purple-to-pink gradient.
 *
 * Check the diagnostic console for W_BLOCK_UNREACHABLE_ERROR warnings.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchErrorIsolationDemo: PatchBuilder = (b) => {
  // ========================================================================
  // WORKING RENDER PIPELINE
  // ========================================================================

  const time = b.addBlock('InfiniteTimeRoot', { role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 2000);
  b.setPortDefault(time, 'periodBMs', 10000);

  const circle = b.addBlock('Ellipse');
  b.setPortDefault(circle, 'rx', 0.03);
  b.setPortDefault(circle, 'ry', 0.03);

  const array = b.addBlock('Array');
  b.setPortDefault(array, 'count', 100);
  b.wire(circle, 'shape', array, 'element');

  const grid = b.addBlock('GridLayoutUV');
  b.setPortDefault(grid, 'rows', 10);
  b.setPortDefault(grid, 'cols', 10);
  b.wire(array, 'elements', grid, 'elements');

  // Per-element purple-to-pink (hue 0.75→0.95), shifting with time
  const hueRange = b.addBlock('Const');
  b.setConfig(hueRange, 'value', 0.2);
  const hueBase = b.addBlock('Const');
  b.setConfig(hueBase, 'value', 0.75);

  const hueScaled = b.addBlock('Multiply');
  b.wire(array, 't', hueScaled, 'a');
  b.wire(hueRange, 'out', hueScaled, 'b');

  const hueOffset = b.addBlock('Add');
  b.wire(hueScaled, 'out', hueOffset, 'a');
  b.wire(hueBase, 'out', hueOffset, 'b');

  const hueAnimated = b.addBlock('Add');
  b.wire(hueOffset, 'out', hueAnimated, 'a');
  b.wire(time, 'phaseA', hueAnimated, 'b');

  const color = b.addBlock('MakeColorHSL');
  b.wire(hueAnimated, 'out', color, 'h');

  const render = b.addBlock('RenderInstances2D');
  b.wire(grid, 'position', render, 'pos');
  b.wire(color, 'color', render, 'color');

  // ========================================================================
  // BROKEN DISCONNECTED BLOCKS - These should NOT stop compilation
  // ========================================================================

  const brokenExpr1 = b.addBlock('Expression');
  b.setConfig(brokenExpr1, 'expression', 'this is not valid +++');

  const brokenExpr2 = b.addBlock('Expression');
  b.setConfig(brokenExpr2, 'expression', 'in0 +');

  const brokenExpr = b.addBlock('Expression');
  b.setConfig(brokenExpr, 'expression', '*** invalid ***');

  const unusedAdd = b.addBlock('Add');
  b.wire(brokenExpr, 'out', unusedAdd, 'a');
};
