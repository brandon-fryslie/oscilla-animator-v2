import { describe, it, expect } from 'vitest';
import { AddressRegistry } from '../../../graph/address-registry';
import { tokenizeExpression } from '../referenceTokenizer';
import type { Patch } from '../../../graph/Patch';

function createPatchWithBlocks(blocks: any[]): Patch {
  return {
    blocks: new Map(blocks.map((block) => [block.id, block])),
    edges: [],
  } as unknown as Patch;
}

describe('tokenizeExpression', () => {
  it('tokenizes pi and tau as constant segments with greek display labels', () => {
    const patch = createPatchWithBlocks([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const segments = tokenizeExpression('sin(pi) + tau', registry, new Set());

    const pi = segments.find((segment) => segment.constantName === 'pi');
    const tau = segments.find((segment) => segment.constantName === 'tau');

    expect(pi?.isConstant).toBe(true);
    expect(pi?.constantDisplay).toBe('π');
    expect(tau?.isConstant).toBe(true);
    expect(tau?.constantDisplay).toBe('τ');
  });

  it('keeps unresolved block.port text as plain segment instead of constant', () => {
    const patch = createPatchWithBlocks([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const segments = tokenizeExpression('foo.pi + pi', registry, new Set());

    const unresolvedRef = segments.find((segment) => segment.text === 'foo.pi');
    const piConstant = segments.find((segment) => segment.constantName === 'pi');

    expect(unresolvedRef).toBeDefined();
    expect(unresolvedRef?.isReference).toBe(false);
    expect(unresolvedRef?.isConstant).toBe(false);
    expect(piConstant?.isConstant).toBe(true);
  });
});

