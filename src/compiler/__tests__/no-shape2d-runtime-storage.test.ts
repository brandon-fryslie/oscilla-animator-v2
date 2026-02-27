import { describe, expect, it } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import type { Step } from '../ir/types';

function compileProgram() {
  const patch = buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot');

    const ellipse = b.addBlock('Ellipse');
    b.setPortDefault(ellipse, 'rx', 0.03);
    b.setPortDefault(ellipse, 'ry', 0.03);

    const array = b.addBlock('Array');
    b.setPortDefault(array, 'count', 6);

    const layout = b.addBlock('GridLayoutUV');
    b.setPortDefault(layout, 'rows', 2);
    b.setPortDefault(layout, 'cols', 3);

    const color = b.addBlock('Const');
    b.setConfig(color, 'value', { r: 0.8, g: 0.6, b: 0.2, a: 1.0 });

    const render = b.addBlock('RenderInstances2D');

    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');
    b.wire(layout, 'controlPoints', render, 'controlPoints');
    b.wire(color, 'out', render, 'color');
  });

  const result = compile(patch);
  if (result.kind !== 'ok') {
    throw new Error(result.errors.map((e) => `[${e.code}] ${e.message}`).join('\n'));
  }
  return result.program;
}

describe('compiler runtime storage gate', () => {
  it('emits numeric-only runtime slot storage (no shape2d class)', () => {
    const program = compileProgram();

    // [LAW:one-source-of-truth] Handle payloads travel through canonical numeric
    // runtime slots; shape2d storage-class must not be reintroduced.
    expect(program.runtimeSlots.every((slot) => slot.storage !== 'shape2d')).toBe(true);
    expect(program.slotMeta.every((slot) => slot.storage !== 'shape2d')).toBe(true);

    const steps = program.schedule.steps as readonly Step[];
    for (const step of steps) {
      if (step.kind !== 'evalOne') continue;
      const lookup = program.runtimeAddressTable?.slotLookup.get(step.target);
      expect(lookup?.storage).not.toBe('shape2d');
    }
  });
});
