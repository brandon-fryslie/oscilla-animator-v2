/**
 * Unit tests for the pure focus model: the single-path derivation, the deterministic
 * single-step traversal, and perspective rotation at pivots. These assert the
 * *contract* (which blocks are on a selection's focused path, where one arrow step
 * lands, how rotating a pivot re-roots the path), never the rendering.
 */
import { describe, expect, it } from 'vitest';

import {
  computeFocusPath,
  rotatePerspective,
  stepChain,
  DEFAULT_PERSPECTIVE,
} from '../chainFocus';
import type { PillarEdge } from '../../../pillars/types/graph';

/** Terse edge builder; role is irrelevant to path membership but required by the type. */
function edge(id: string, source: string, target: string): PillarEdge {
  return { id, source, target, inputSlot: 'primary', role: 'primary' };
}

// a → b → c (linear), with a side branch a → d → c and a second feeder e → b.
// b is a fan-in pivot (feeders a, e); a is a fan-out pivot (consumers b, d);
// c is a fan-in pivot (feeders b, d).
const edges: readonly PillarEdge[] = [
  edge('e0', 'a', 'b'),
  edge('e1', 'b', 'c'),
  edge('e2', 'a', 'd'),
  edge('e3', 'd', 'c'),
  edge('e4', 'e', 'b'),
];

describe('computeFocusPath', () => {
  it('follows the first branch at each pivot by default', () => {
    // From b: upstream picks the first feeder (a, edge e0 before e4); downstream
    // reaches c. The other feeder e is NOT on the followed path.
    expect(computeFocusPath(edges, 'b', DEFAULT_PERSPECTIVE)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('follows one downstream branch from a fan-out, not both', () => {
    // From a: downstream picks the first consumer (b, edge e0 before e2), then c.
    // The d branch is off the followed path.
    expect(computeFocusPath(edges, 'a', DEFAULT_PERSPECTIVE)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('returns just the block itself when it has no edges', () => {
    expect(computeFocusPath([edge('e0', 'a', 'b')], 'lonely', DEFAULT_PERSPECTIVE)).toEqual(
      new Set(['lonely']),
    );
  });

  it('terminates on a cycle', () => {
    const cyclic = [edge('e0', 'x', 'y'), edge('e1', 'y', 'x')];
    expect(computeFocusPath(cyclic, 'x', DEFAULT_PERSPECTIVE)).toEqual(new Set(['x', 'y']));
  });
});

describe('rotatePerspective', () => {
  it('re-roots the upstream branch at a fan-in selection', () => {
    // b's default focus follows feeder a. Rotating b (a fan-in pivot, b is the
    // selection) advances to the next feeder, e.
    const rotated = rotatePerspective(edges, 'b', DEFAULT_PERSPECTIVE, 'b');
    expect(computeFocusPath(edges, 'b', rotated)).toEqual(new Set(['e', 'b', 'c']));
  });

  it('re-roots the downstream branch at a fan-out selection', () => {
    // a's default focus follows consumer b→c. Rotating a (a fan-out pivot) advances
    // to the next consumer, d→c.
    const rotated = rotatePerspective(edges, 'a', DEFAULT_PERSPECTIVE, 'a');
    expect(computeFocusPath(edges, 'a', rotated)).toEqual(new Set(['a', 'd', 'c']));
  });

  it('rotates a downstream pivot reached along the path, not just the selection', () => {
    // Select a source feeding a fan-out mid; rotating mid flips which leaf is lit.
    const fan = [
      edge('e0', 'src', 'mid'),
      edge('e1', 'mid', 'leafA'),
      edge('e2', 'mid', 'leafB'),
    ];
    expect(computeFocusPath(fan, 'src', DEFAULT_PERSPECTIVE)).toEqual(
      new Set(['src', 'mid', 'leafA']),
    );
    const rotated = rotatePerspective(fan, 'src', DEFAULT_PERSPECTIVE, 'mid');
    expect(computeFocusPath(fan, 'src', rotated)).toEqual(new Set(['src', 'mid', 'leafB']));
  });

  it('wraps back to the first branch after the last', () => {
    const rotatedOnce = rotatePerspective(edges, 'a', DEFAULT_PERSPECTIVE, 'a');
    const rotatedTwice = rotatePerspective(edges, 'a', rotatedOnce, 'a');
    expect(computeFocusPath(edges, 'a', rotatedTwice)).toEqual(
      computeFocusPath(edges, 'a', DEFAULT_PERSPECTIVE),
    );
  });

  it('is a no-op (same reference) when the block is not a pivot on the path', () => {
    // c is a fan-in, but with b selected c is reached downstream — its other feeder d
    // is not part of b's followed walk, so right-clicking c rotates nothing.
    const result = rotatePerspective(edges, 'b', DEFAULT_PERSPECTIVE, 'c');
    expect(result).toBe(DEFAULT_PERSPECTIVE);
  });
});

describe('stepChain', () => {
  it('steps downstream to the consumer', () => {
    expect(stepChain(edges, 'b', 'downstream', DEFAULT_PERSPECTIVE)).toBe('c');
  });

  it('steps upstream to the first feeder in edge order', () => {
    // b is fed by a (e0) and e (e4); the default perspective picks a.
    expect(stepChain(edges, 'b', 'upstream', DEFAULT_PERSPECTIVE)).toBe('a');
  });

  it('follows the rotated branch under a non-default perspective', () => {
    const rotated = rotatePerspective(edges, 'a', DEFAULT_PERSPECTIVE, 'a');
    // a's downstream choice is now its second consumer, d.
    expect(stepChain(edges, 'a', 'downstream', rotated)).toBe('d');
  });

  it('returns null at the end of the chain', () => {
    expect(stepChain(edges, 'c', 'downstream', DEFAULT_PERSPECTIVE)).toBeNull();
    expect(stepChain(edges, 'a', 'upstream', DEFAULT_PERSPECTIVE)).toBeNull();
  });
});
