/**
 * Debug test to understand TestSignal compilation errors
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch } from '../../graph';

describe('Debug TestSignal', () => {
  it('minimal TestSignal usage', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const valueBlock = b.addBlock('Const', { value: 42 });
      const testSig = b.addBlock('TestSignal', {});
      b.wire(valueBlock, 'out', testSig, 'value');
    });

    const result = compile(patch);

    if (result.kind === 'error') {
      console.error('Compile errors:', JSON.stringify(result.errors, null, 2));
    }

    expect(result.kind).toBe('ok');
  });
});
