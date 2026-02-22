/**
 * DefaultSource Field Cardinality Tests
 *
 * Verifies that DefaultSource (oneOnly acceptance) works correctly with the
 * cardinality adapter system — Broadcast adapters are auto-inserted at
 * one→many boundaries by the fixpoint solver.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';
import { compileFrontend } from '../../compiler/frontend';

describe('DefaultSource field cardinality (via adapter system)', () => {
  it('frontend compiles RenderInstances2D with default sources on field inputs', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const arr = b.addBlock('Array');
      b.setPortDefault(arr, 'count', 4);
      const ellipse = b.addBlock('Ellipse');
      b.wire(ellipse, 'shape', arr, 'element'); // Wire shape to Array element
      const grid = b.addBlock('GridLayoutUV');
      b.wire(arr, 'elements', grid, 'elements');
      const render = b.addBlock('RenderInstances2D');
      b.wire(grid, 'position', render, 'pos');
      // color is unconnected — DefaultSource (oneOnly) + Broadcast adapter
    });

    const result = compileFrontend(patch);
    if (!result.backendReady) {
      console.error('Frontend errors:', JSON.stringify(result.errors, null, 2));
    }
    expect(result.backendReady).toBe(true);
  });

  it('full compilation succeeds with default sources on field inputs', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const arr = b.addBlock('Array');
      b.setPortDefault(arr, 'count', 4);
      const ellipse = b.addBlock('Ellipse');
      b.wire(ellipse, 'shape', arr, 'element'); // Wire shape to Array element
      const grid = b.addBlock('GridLayoutUV');
      b.wire(arr, 'elements', grid, 'elements');
      const render = b.addBlock('RenderInstances2D');
      b.wire(grid, 'position', render, 'pos');
      // color unconnected — should get a oneOnly DefaultSource + Broadcast adapter
    });

    const result = compile(patch);
    if (result.kind === 'error') {
      console.error('Compile errors:', JSON.stringify(result.errors, null, 2));
    }
    expect(result.kind).toBe('ok');
  });
});
