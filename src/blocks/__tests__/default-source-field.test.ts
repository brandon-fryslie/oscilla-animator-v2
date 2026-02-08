/**
 * DefaultSource Field Cardinality Tests
 *
 * Verifies that DefaultSource correctly produces field-cardinality outputs
 * for blocks like RenderInstances2D that require field inputs.
 *
 * TODO(oscilla-animator-v2-cpc): Remove this test file when cardinality
 * typevars are fully implemented and DefaultSource no longer needs to
 * manually handle field outputs.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';
import { compileFrontend } from '../../compiler/frontend';

describe('DefaultSource field cardinality', () => {
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
      // Shape port removed - automatically looked up from instance
      // color is unconnected — DefaultSource should provide a field-cardinality color
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
      // Shape port removed - automatically looked up from instance
      // color unconnected — should get a field-cardinality DefaultSource
    });

    const result = compile(patch);
    if (result.kind === 'error') {
      console.error('Compile errors:', JSON.stringify(result.errors, null, 2));
    }
    expect(result.kind).toBe('ok');
  });
});
