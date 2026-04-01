/**
 * C1 Phase 1: Topological Sort — Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { topoSort } from '../topo-sort';
import type { NormalizedPatch } from '../../ir/NormalizedPatch';
import type { BlockIndex } from '../../ir/BlockIndex';
import type { PortId } from '../../../types/compiler';

function makePatch(blockCount: number, edges: [number, number][]): NormalizedPatch {
  const blocks = Array.from({ length: blockCount }, (_, i) => ({
    id: `b${i}`,
    type: 'Test',
    params: {},
  }));

  return {
    graph: { blocks, edges: [] },
    blockIndex: new Map(),
    blocks,
    edges: edges.map(([from, to]) => ({
      fromBlock: from as BlockIndex,
      fromPort: 'out' as PortId,
      toBlock: to as BlockIndex,
      toPort: 'in' as PortId,
      alias: 'test',
    })),
  };
}

describe('topoSort', () => {
  it('sorts a linear chain', () => {
    const patch = makePatch(3, [[0, 1], [1, 2]]);
    const result = topoSort(patch);
    expect(result).toEqual([0, 1, 2]);
  });

  it('sorts a diamond graph', () => {
    // 0 → 1, 0 → 2, 1 → 3, 2 → 3
    const patch = makePatch(4, [[0, 1], [0, 2], [1, 3], [2, 3]]);
    const result = topoSort(patch);
    // 0 must come first, 3 must come last
    expect(result[0]).toBe(0);
    expect(result[3]).toBe(3);
    // 1 and 2 can be in either order
    expect(result.sort()).toEqual([0, 1, 2, 3]);
  });

  it('handles isolated nodes', () => {
    const patch = makePatch(3, []);
    const result = topoSort(patch);
    expect(result).toHaveLength(3);
  });

  it('throws on cycle', () => {
    const patch = makePatch(3, [[0, 1], [1, 2], [2, 0]]);
    expect(() => topoSort(patch)).toThrow('Cycle detected');
  });
});
