import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch } from '../../graph';

describe('Debug', () => {
  it('shows compile errors', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const constBlock = b.addBlock('Const');
      b.setConfig(constBlock, 'value', 5);
      const delayBlock = b.addBlock('UnitDelay');
      b.wire(constBlock, 'out', delayBlock, 'in');
    });

    const result = compile(patch);
    console.log('Result:', JSON.stringify(result, null, 2));
  });
});
