import { describe, expect, it } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import { SCALAR_INSTANCE_ID } from '../ir/Indices';

describe('dynamic instance count lowering', () => {
  it('does not emit fast-path instanceCount provenance for runtime-owned dynamic counts', () => {
    let arrayBlockId = '';
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      const cast = b.addBlock('Adapter_CastFloatToInt');
      const array = b.addBlock('Array');
      arrayBlockId = array;
      const ellipse = b.addBlock('Ellipse');
      const layout = b.addBlock('GridLayoutUV');
      const render = b.addBlock('RenderInstances2D');

      b.setPortDefault(array, 'count', 32);
      b.wire(time, 'phaseA', cast, 'in');
      b.wire(cast, 'out', array, 'count');
      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(layout, 'controlPoints', render, 'controlPoints');
    });
    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    const portKey = `${arrayBlockId}:count`;
    expect(result.program.instanceCountProvenance?.has(portKey) ?? false).toBe(false);
  });
});
