import { describe, expect, it } from 'vitest';
import { AddressRegistry } from '../../graph/address-registry';
import { buildPatch } from '../../graph/Patch';
import { tokenizeExpression } from './referenceTokenizer';

describe('tokenizeExpression', () => {
  it('marks refs connected from canonical output addresses only', () => {
    const patch = buildPatch((builder) => {
      const sourceId = builder.addBlock('Const', { displayName: 'Source' });
      const targetId = builder.addBlock('Expression', { displayName: 'Target' });
      builder.wireCollect(sourceId, 'out', targetId, 'refs');
    });

    const registry = AddressRegistry.buildFromPatch(patch);
    const segments = tokenizeExpression(
      'source.out + source.id',
      registry,
      new Set(['v1:blocks.source.outputs.out']),
    );

    expect(segments).toEqual([
      expect.objectContaining({
        text: 'source.out',
        isReference: true,
        sourceAddress: 'v1:blocks.source.outputs.out',
        isConnected: true,
      }),
      expect.objectContaining({
        text: ' + ',
        isReference: false,
      }),
      expect.objectContaining({
        text: 'source.id',
        isReference: false,
      }),
    ]);
  });
});
