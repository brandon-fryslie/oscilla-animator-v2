import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';
import { compileFrontend } from '../../compiler/frontend';

function buildRenderPatch(
  wireScale: (b: any, renderId: string) => void
) {
  return buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot');

    const arr = b.addBlock('Array');
    b.setPortDefault(arr, 'count', 16);
    const ellipse = b.addBlock('Ellipse');
    b.wire(ellipse, 'shape', arr, 'element');

    const grid = b.addBlock('GridLayoutUV');
    b.wire(arr, 'elements', grid, 'elements');

    const render = b.addBlock('RenderInstances2D');
    b.wire(grid, 'position', render, 'pos');

    wireScale(b, render);
  });
}

describe('field float generators', () => {
  it('NoisyBroadcast compiles when output cardinality is inferred from downstream many topology', () => {
    const patch = buildRenderPatch((b, render) => {
      const value = b.addBlock('Const');
      b.setConfig(value, 'value', 0.5);
      const noisy = b.addBlock('NoisyBroadcast');
      b.wire(value, 'out', noisy, 'value');
      b.wire(noisy, 'out', render, 'scale');
    });

    const frontend = compileFrontend(patch);
    if (!frontend.backendReady) {
      console.error('Frontend errors:', JSON.stringify(frontend.errors, null, 2));
    }
    expect(frontend.backendReady).toBe(true);

    const compiled = compile(patch);
    if (compiled.kind === 'error') {
      console.error('Compile errors:', JSON.stringify(compiled.errors, null, 2));
    }
    expect(compiled.kind).toBe('ok');
  });

  it('FloatRangeField compiles with no value input and inherits count from downstream topology', () => {
    const patch = buildRenderPatch((b, render) => {
      const range = b.addBlock('FloatRangeField');
      b.wire(range, 'out', render, 'scale');
    });

    const frontend = compileFrontend(patch);
    if (!frontend.backendReady) {
      console.error('Frontend errors:', JSON.stringify(frontend.errors, null, 2));
    }
    expect(frontend.backendReady).toBe(true);

    const compiled = compile(patch);
    if (compiled.kind === 'error') {
      console.error('Compile errors:', JSON.stringify(compiled.errors, null, 2));
    }
    expect(compiled.kind).toBe('ok');
  });
});
