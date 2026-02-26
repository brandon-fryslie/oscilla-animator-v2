/**
 * DefaultSource event lowering tests.
 *
 * Ensures unconnected event inputs lower to eventNever via DefaultSource.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';

describe('DefaultSource event lowering', () => {
  it('lowers missing event inputs to eventNever', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      const arr = b.addBlock('Array');
      b.setPortDefault(arr, 'count', 4);
      const ellipse = b.addBlock('Ellipse');
      b.wire(ellipse, 'shape', arr, 'element');
      const grid = b.addBlock('GridLayoutUV');
      b.wire(arr, 'elements', grid, 'elements');
      const render = b.addBlock('RenderInstances2D');
      b.wire(grid, 'controlPoints', render, 'controlPoints');

      const sampleHold = b.addBlock('SampleHold');
      b.wire(time, 'tMs', sampleHold, 'value');
      b.wire(sampleHold, 'out', render, 'scale');
      // trigger intentionally unconnected → DefaultSource should lower to eventNever
    });

    const result = compile(patch);
    if (result.kind !== 'ok') {
      throw new Error(`Compile failed: ${JSON.stringify(result.errors, null, 2)}`);
    }

    const hasEventNever = result.program.valueExprs.nodes.some(
      (node) => node.kind === 'event' && node.eventKind === 'never'
    );
    expect(hasEventNever).toBe(true);
  });
});
