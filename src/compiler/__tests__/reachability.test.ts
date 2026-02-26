/**
 * Tests for reachability analysis
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { computeRenderReachableBlocks } from '../reachability';
import type { BlockIndex, NormalizedEdge } from '../ir/patches';
import type { CompilerGraphBlock } from '../ir/CompilerGraph';
import { registerBlock } from '../../blocks/registry';

// Register test block types before running tests
beforeAll(() => {
  registerBlock({
    type: 'TestRenderBlock',
    form: 'primitive',
    capability: 'render',
    label: 'Test Render',
    category: 'test',
    inputs: {},
    outputs: {},
    lower: () => ({ outputsById: {}, effects: {} }),
  });

  registerBlock({
    type: 'TestPureBlock',
    form: 'primitive',
    capability: 'pure',
    label: 'Test Pure',
    category: 'test',
    inputs: {},
    outputs: {},
    lower: () => ({ outputsById: {}, effects: {} }),
  });
});

describe('computeRenderReachableBlocks', () => {
  it('returns empty set for no render blocks', () => {
    const blocks: CompilerGraphBlock[] = [
      { id: 'b1' as any, type: 'TestPureBlock' } as any,
      { id: 'b2' as any, type: 'TestPureBlock' } as any,
    ];
    const edges: NormalizedEdge[] = [];

    const reachable = computeRenderReachableBlocks(blocks, edges);

    expect(reachable.size).toBe(0);
  });

  it('returns render block only if no inputs', () => {
    const blocks: CompilerGraphBlock[] = [
      { id: 'render' as any, type: 'TestRenderBlock' } as any,
      { id: 'disconnected' as any, type: 'TestPureBlock' } as any,
    ];
    const edges: NormalizedEdge[] = [];

    const reachable = computeRenderReachableBlocks(blocks, edges);

    expect(reachable.size).toBe(1);
    expect(reachable.has(0 as BlockIndex)).toBe(true); // render block at index 0
  });

  it('traces through single edge', () => {
    const blocks: CompilerGraphBlock[] = [
      { id: 'source' as any, type: 'TestPureBlock' } as any,
      { id: 'render' as any, type: 'TestRenderBlock' } as any,
    ];
    const edges: NormalizedEdge[] = [
      {
        fromBlock: 0 as BlockIndex,
        fromPort: 'out' as any,
        toBlock: 1 as BlockIndex,
        toPort: 'in' as any,
        alias: 'source.out',
      },
    ];

    const reachable = computeRenderReachableBlocks(blocks, edges);

    expect(reachable.size).toBe(2);
    expect(reachable.has(0 as BlockIndex)).toBe(true); // source
    expect(reachable.has(1 as BlockIndex)).toBe(true); // render
  });

  it('traces through chain', () => {
    const blocks: CompilerGraphBlock[] = [
      { id: 'b1' as any, type: 'TestPureBlock' } as any,
      { id: 'b2' as any, type: 'TestPureBlock' } as any,
      { id: 'b3' as any, type: 'TestPureBlock' } as any,
      { id: 'render' as any, type: 'TestRenderBlock' } as any,
    ];
    const edges: NormalizedEdge[] = [
      {
        fromBlock: 0 as BlockIndex,
        fromPort: 'out' as any,
        toBlock: 1 as BlockIndex,
        toPort: 'in' as any,
        alias: 'b1.out',
      },
      {
        fromBlock: 1 as BlockIndex,
        fromPort: 'out' as any,
        toBlock: 2 as BlockIndex,
        toPort: 'in' as any,
        alias: 'b2.out',
      },
      {
        fromBlock: 2 as BlockIndex,
        fromPort: 'out' as any,
        toBlock: 3 as BlockIndex,
        toPort: 'in' as any,
        alias: 'b3.out',
      },
    ];

    const reachable = computeRenderReachableBlocks(blocks, edges);

    expect(reachable.size).toBe(4);
    expect(reachable.has(0 as BlockIndex)).toBe(true);
    expect(reachable.has(1 as BlockIndex)).toBe(true);
    expect(reachable.has(2 as BlockIndex)).toBe(true);
    expect(reachable.has(3 as BlockIndex)).toBe(true);
  });

  it('traces through diamond', () => {
    const blocks: CompilerGraphBlock[] = [
      { id: 'source' as any, type: 'TestPureBlock' } as any,
      { id: 'left' as any, type: 'TestPureBlock' } as any,
      { id: 'right' as any, type: 'TestPureBlock' } as any,
      { id: 'render' as any, type: 'TestRenderBlock' } as any,
    ];
    const edges: NormalizedEdge[] = [
      {
        fromBlock: 0 as BlockIndex,
        fromPort: 'out' as any,
        toBlock: 1 as BlockIndex,
        toPort: 'in' as any,
        alias: 'source.out',
      },
      {
        fromBlock: 0 as BlockIndex,
        fromPort: 'out' as any,
        toBlock: 2 as BlockIndex,
        toPort: 'in' as any,
        alias: 'source.out',
      },
      {
        fromBlock: 1 as BlockIndex,
        fromPort: 'out' as any,
        toBlock: 3 as BlockIndex,
        toPort: 'in1' as any,
        alias: 'left.out',
      },
      {
        fromBlock: 2 as BlockIndex,
        fromPort: 'out' as any,
        toBlock: 3 as BlockIndex,
        toPort: 'in2' as any,
        alias: 'right.out',
      },
    ];

    const reachable = computeRenderReachableBlocks(blocks, edges);

    expect(reachable.size).toBe(4);
    expect(reachable.has(0 as BlockIndex)).toBe(true); // source
    expect(reachable.has(1 as BlockIndex)).toBe(true); // left
    expect(reachable.has(2 as BlockIndex)).toBe(true); // right
    expect(reachable.has(3 as BlockIndex)).toBe(true); // render
  });

  it('excludes disconnected subgraph', () => {
    const blocks: CompilerGraphBlock[] = [
      { id: 'connected' as any, type: 'TestPureBlock' } as any,
      { id: 'render' as any, type: 'TestRenderBlock' } as any,
      { id: 'disconnected1' as any, type: 'TestPureBlock' } as any,
      { id: 'disconnected2' as any, type: 'TestPureBlock' } as any,
    ];
    const edges: NormalizedEdge[] = [
      {
        fromBlock: 0 as BlockIndex,
        fromPort: 'out' as any,
        toBlock: 1 as BlockIndex,
        toPort: 'in' as any,
        alias: 'connected.out',
      },
      // disconnected subgraph
      {
        fromBlock: 2 as BlockIndex,
        fromPort: 'out' as any,
        toBlock: 3 as BlockIndex,
        toPort: 'in' as any,
        alias: 'disconnected1.out',
      },
    ];

    const reachable = computeRenderReachableBlocks(blocks, edges);

    expect(reachable.size).toBe(2);
    expect(reachable.has(0 as BlockIndex)).toBe(true); // connected
    expect(reachable.has(1 as BlockIndex)).toBe(true); // render
    expect(reachable.has(2 as BlockIndex)).toBe(false); // disconnected1
    expect(reachable.has(3 as BlockIndex)).toBe(false); // disconnected2
  });

  it('handles multiple render blocks', () => {
    const blocks: CompilerGraphBlock[] = [
      { id: 'source1' as any, type: 'TestPureBlock' } as any,
      { id: 'render1' as any, type: 'TestRenderBlock' } as any,
      { id: 'source2' as any, type: 'TestPureBlock' } as any,
      { id: 'render2' as any, type: 'TestRenderBlock' } as any,
      { id: 'disconnected' as any, type: 'TestPureBlock' } as any,
    ];
    const edges: NormalizedEdge[] = [
      {
        fromBlock: 0 as BlockIndex,
        fromPort: 'out' as any,
        toBlock: 1 as BlockIndex,
        toPort: 'in' as any,
        alias: 'source1.out',
      },
      {
        fromBlock: 2 as BlockIndex,
        fromPort: 'out' as any,
        toBlock: 3 as BlockIndex,
        toPort: 'in' as any,
        alias: 'source2.out',
      },
    ];

    const reachable = computeRenderReachableBlocks(blocks, edges);

    expect(reachable.size).toBe(4);
    expect(reachable.has(0 as BlockIndex)).toBe(true); // source1
    expect(reachable.has(1 as BlockIndex)).toBe(true); // render1
    expect(reachable.has(2 as BlockIndex)).toBe(true); // source2
    expect(reachable.has(3 as BlockIndex)).toBe(true); // render2
    expect(reachable.has(4 as BlockIndex)).toBe(false); // disconnected
  });
});
