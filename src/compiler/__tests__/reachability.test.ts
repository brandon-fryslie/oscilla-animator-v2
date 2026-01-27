/**
 * Tests for reachability analysis
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { computeRenderReachableBlocks } from '../reachability';
import type { Block, BlockIndex, NormalizedEdge } from '../ir/patches';
import { registerBlock } from '../../blocks/registry';

// Register test block types before running tests
beforeAll(() => {
  registerBlock({
    type: 'TestRenderBlock',
    form: 'primitive',
    capability: 'render',
    inputs: {},
    outputs: {},
    lower: () => ({ outputsById: {} }),
  });

  registerBlock({
    type: 'TestPureBlock',
    form: 'primitive',
    capability: 'pure',
    inputs: {},
    outputs: {},
    lower: () => ({ outputsById: {} }),
  });
});

describe('computeRenderReachableBlocks', () => {
  it('returns empty set for no render blocks', () => {
    const blocks: Block[] = [
      { id: 'b1', type: 'TestPureBlock', params: {}, ports: {} },
      { id: 'b2', type: 'TestPureBlock', params: {}, ports: {} },
    ];
    const edges: NormalizedEdge[] = [];

    const reachable = computeRenderReachableBlocks(blocks, edges);

    expect(reachable.size).toBe(0);
  });

  it('returns render block only if no inputs', () => {
    const blocks: Block[] = [
      { id: 'render', type: 'TestRenderBlock', params: {}, ports: {} },
      { id: 'disconnected', type: 'TestPureBlock', params: {}, ports: {} },
    ];
    const edges: NormalizedEdge[] = [];

    const reachable = computeRenderReachableBlocks(blocks, edges);

    expect(reachable.size).toBe(1);
    expect(reachable.has(0 as BlockIndex)).toBe(true); // render block at index 0
  });

  it('traces through single edge', () => {
    const blocks: Block[] = [
      { id: 'source', type: 'TestPureBlock', params: {}, ports: {} },
      { id: 'render', type: 'TestRenderBlock', params: {}, ports: {} },
    ];
    const edges: NormalizedEdge[] = [
      {
        fromBlock: 0 as BlockIndex,
        toBlock: 1 as BlockIndex,
        from: { blockId: 'source', slotId: 'out' },
        to: { blockId: 'render', slotId: 'in' },
        role: 'userWire',
      } as NormalizedEdge,
    ];

    const reachable = computeRenderReachableBlocks(blocks, edges);

    expect(reachable.size).toBe(2);
    expect(reachable.has(0 as BlockIndex)).toBe(true); // source
    expect(reachable.has(1 as BlockIndex)).toBe(true); // render
  });

  it('traces through chain', () => {
    const blocks: Block[] = [
      { id: 'b1', type: 'TestPureBlock', params: {}, ports: {} },
      { id: 'b2', type: 'TestPureBlock', params: {}, ports: {} },
      { id: 'b3', type: 'TestPureBlock', params: {}, ports: {} },
      { id: 'render', type: 'TestRenderBlock', params: {}, ports: {} },
    ];
    const edges: NormalizedEdge[] = [
      {
        fromBlock: 0 as BlockIndex,
        toBlock: 1 as BlockIndex,
        from: { blockId: 'b1', slotId: 'out' },
        to: { blockId: 'b2', slotId: 'in' },
        role: 'userWire',
      } as NormalizedEdge,
      {
        fromBlock: 1 as BlockIndex,
        toBlock: 2 as BlockIndex,
        from: { blockId: 'b2', slotId: 'out' },
        to: { blockId: 'b3', slotId: 'in' },
        role: 'userWire',
      } as NormalizedEdge,
      {
        fromBlock: 2 as BlockIndex,
        toBlock: 3 as BlockIndex,
        from: { blockId: 'b3', slotId: 'out' },
        to: { blockId: 'render', slotId: 'in' },
        role: 'userWire',
      } as NormalizedEdge,
    ];

    const reachable = computeRenderReachableBlocks(blocks, edges);

    expect(reachable.size).toBe(4);
    expect(reachable.has(0 as BlockIndex)).toBe(true);
    expect(reachable.has(1 as BlockIndex)).toBe(true);
    expect(reachable.has(2 as BlockIndex)).toBe(true);
    expect(reachable.has(3 as BlockIndex)).toBe(true);
  });

  it('traces through diamond', () => {
    const blocks: Block[] = [
      { id: 'source', type: 'TestPureBlock', params: {}, ports: {} },
      { id: 'left', type: 'TestPureBlock', params: {}, ports: {} },
      { id: 'right', type: 'TestPureBlock', params: {}, ports: {} },
      { id: 'render', type: 'TestRenderBlock', params: {}, ports: {} },
    ];
    const edges: NormalizedEdge[] = [
      {
        fromBlock: 0 as BlockIndex,
        toBlock: 1 as BlockIndex,
        from: { blockId: 'source', slotId: 'out' },
        to: { blockId: 'left', slotId: 'in' },
        role: 'userWire',
      } as NormalizedEdge,
      {
        fromBlock: 0 as BlockIndex,
        toBlock: 2 as BlockIndex,
        from: { blockId: 'source', slotId: 'out' },
        to: { blockId: 'right', slotId: 'in' },
        role: 'userWire',
      } as NormalizedEdge,
      {
        fromBlock: 1 as BlockIndex,
        toBlock: 3 as BlockIndex,
        from: { blockId: 'left', slotId: 'out' },
        to: { blockId: 'render', slotId: 'in1' },
        role: 'userWire',
      } as NormalizedEdge,
      {
        fromBlock: 2 as BlockIndex,
        toBlock: 3 as BlockIndex,
        from: { blockId: 'right', slotId: 'out' },
        to: { blockId: 'render', slotId: 'in2' },
        role: 'userWire',
      } as NormalizedEdge,
    ];

    const reachable = computeRenderReachableBlocks(blocks, edges);

    expect(reachable.size).toBe(4);
    expect(reachable.has(0 as BlockIndex)).toBe(true); // source
    expect(reachable.has(1 as BlockIndex)).toBe(true); // left
    expect(reachable.has(2 as BlockIndex)).toBe(true); // right
    expect(reachable.has(3 as BlockIndex)).toBe(true); // render
  });

  it('excludes disconnected subgraph', () => {
    const blocks: Block[] = [
      { id: 'connected', type: 'TestPureBlock', params: {}, ports: {} },
      { id: 'render', type: 'TestRenderBlock', params: {}, ports: {} },
      { id: 'disconnected1', type: 'TestPureBlock', params: {}, ports: {} },
      { id: 'disconnected2', type: 'TestPureBlock', params: {}, ports: {} },
    ];
    const edges: NormalizedEdge[] = [
      {
        fromBlock: 0 as BlockIndex,
        toBlock: 1 as BlockIndex,
        from: { blockId: 'connected', slotId: 'out' },
        to: { blockId: 'render', slotId: 'in' },
        role: 'userWire',
      } as NormalizedEdge,
      // disconnected subgraph
      {
        fromBlock: 2 as BlockIndex,
        toBlock: 3 as BlockIndex,
        from: { blockId: 'disconnected1', slotId: 'out' },
        to: { blockId: 'disconnected2', slotId: 'in' },
        role: 'userWire',
      } as NormalizedEdge,
    ];

    const reachable = computeRenderReachableBlocks(blocks, edges);

    expect(reachable.size).toBe(2);
    expect(reachable.has(0 as BlockIndex)).toBe(true); // connected
    expect(reachable.has(1 as BlockIndex)).toBe(true); // render
    expect(reachable.has(2 as BlockIndex)).toBe(false); // disconnected1
    expect(reachable.has(3 as BlockIndex)).toBe(false); // disconnected2
  });

  it('handles multiple render blocks', () => {
    const blocks: Block[] = [
      { id: 'source1', type: 'TestPureBlock', params: {}, ports: {} },
      { id: 'render1', type: 'TestRenderBlock', params: {}, ports: {} },
      { id: 'source2', type: 'TestPureBlock', params: {}, ports: {} },
      { id: 'render2', type: 'TestRenderBlock', params: {}, ports: {} },
      { id: 'disconnected', type: 'TestPureBlock', params: {}, ports: {} },
    ];
    const edges: NormalizedEdge[] = [
      {
        fromBlock: 0 as BlockIndex,
        toBlock: 1 as BlockIndex,
        from: { blockId: 'source1', slotId: 'out' },
        to: { blockId: 'render1', slotId: 'in' },
        role: 'userWire',
      } as NormalizedEdge,
      {
        fromBlock: 2 as BlockIndex,
        toBlock: 3 as BlockIndex,
        from: { blockId: 'source2', slotId: 'out' },
        to: { blockId: 'render2', slotId: 'in' },
        role: 'userWire',
      } as NormalizedEdge,
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
