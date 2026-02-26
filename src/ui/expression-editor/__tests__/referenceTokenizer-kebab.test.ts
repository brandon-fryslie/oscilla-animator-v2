import { describe, it, expect } from 'vitest';
import { tokenizeExpression } from '../referenceTokenizer';
import type { AddressRegistry } from '../../../graph/address-registry';

describe('tokenizeExpression kebab-case references', () => {
  it('recognizes block.port references with hyphenated block names', () => {
    const addressRegistry = {
      resolveShorthand: (shorthand: string) => {
        if (shorthand === 'make-x.out') {
          return { kind: 'output', blockId: 'make-x', portId: 'out' } as const;
        }
        return null;
      },
    } as unknown as AddressRegistry;

    const segments = tokenizeExpression(
      'sin(make-x.out) + pi',
      addressRegistry,
      new Set(['make-x.out']),
    );

    const ref = segments.find((segment) => segment.text === 'make-x.out');
    expect(ref).toBeDefined();
    expect(ref?.isReference).toBe(true);
    expect(ref?.isConnected).toBe(true);
  });
});
