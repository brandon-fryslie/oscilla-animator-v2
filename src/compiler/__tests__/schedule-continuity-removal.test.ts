import { describe, expect, it } from 'vitest';

import { buildPatch } from '../../graph';
import { compile } from '../compile';

describe('canonical schedule continuity removal', () => {
  it('omits continuityMapBuild and continuityApply steps', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const ellipse = b.addBlock('Ellipse');
      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);
      b.wire(ellipse, 'shape', array, 'element');
      const layout = b.addBlock('GridLayoutUV');
      b.setPortDefault(layout, 'rows', 2);
      b.setPortDefault(layout, 'cols', 2);
      b.wire(array, 'elements', layout, 'elements');
      const colorSignal = b.addBlock('Const');
      b.setConfig(colorSignal, 'value', { r: 1, g: 0.25, b: 0.1, a: 1 });
      const colorField = b.addBlock('Broadcast');
      b.wire(colorSignal, 'out', colorField, 'one');
      const render = b.addBlock('RenderInstances2D');
      b.wire(layout, 'controlPoints', render, 'controlPoints');
      b.wire(colorField, 'field', render, 'color');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const kinds = result.program.schedule.steps.map((step) => step.kind);
    expect(kinds).not.toContain('continuityMapBuild');
    expect(kinds).not.toContain('continuityApply');
  });
});
