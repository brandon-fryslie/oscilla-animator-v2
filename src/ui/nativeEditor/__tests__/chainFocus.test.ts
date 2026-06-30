/**
 * Unit tests for the pure chain-focus model: transitive reachability and the
 * deterministic single-step traversal. These assert the *contract* (which blocks
 * are on a selection's chain, where one arrow step lands), never the rendering.
 */
import { describe, expect, it } from 'vitest';

import { computeChainSet, stepChain } from '../chainFocus';
import type { PillarEdge } from '../../../pillars/types/graph';

/** Terse edge builder; role is irrelevant to chain membership but required by the type. */
function edge(id: string, source: string, target: string): PillarEdge {
  return { id, source, target, inputSlot: 'primary', role: 'primary' };
}

// a → b → c (linear), with a side branch a → d → c and a leaf e → b.
const edges: readonly PillarEdge[] = [
  edge('e0', 'a', 'b'),
  edge('e1', 'b', 'c'),
  edge('e2', 'a', 'd'),
  edge('e3', 'd', 'c'),
  edge('e4', 'e', 'b'),
];

describe('computeChainSet', () => {
  it('includes the selected block, all transitive feeders, and all transitive consumers', () => {
    // From b: upstream {a, e}, self {b}, downstream {c}. d is on neither side of b.
    expect(computeChainSet(edges, 'b')).toEqual(new Set(['a', 'e', 'b', 'c']));
  });

  it('reaches across multiple branch paths to a shared sink', () => {
    // From a: downstream fans out through both b and d to c. e feeds b but is a
    // feeder-of-a-consumer, not on a's own up/downstream chain, so it stays off.
    expect(computeChainSet(edges, 'a')).toEqual(new Set(['a', 'b', 'd', 'c']));
  });

  it('returns just the block itself when it has no edges', () => {
    expect(computeChainSet([edge('e0', 'a', 'b')], 'lonely')).toEqual(new Set(['lonely']));
  });

  it('terminates on a cycle', () => {
    const cyclic = [edge('e0', 'x', 'y'), edge('e1', 'y', 'x')];
    expect(computeChainSet(cyclic, 'x')).toEqual(new Set(['x', 'y']));
  });
});

describe('stepChain', () => {
  it('steps downstream to the consumer', () => {
    expect(stepChain(edges, 'b', 'downstream')).toBe('c');
  });

  it('steps upstream to the first feeder in edge order', () => {
    // b is fed by a (e0) and e (e4); edge order picks a.
    expect(stepChain(edges, 'b', 'upstream')).toBe('a');
  });

  it('returns null at the end of the chain', () => {
    expect(stepChain(edges, 'c', 'downstream')).toBeNull();
    expect(stepChain(edges, 'a', 'upstream')).toBeNull();
  });
});
