/**
 * C1 Phase 2: Harvester — Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { harvest } from '../harvester';
import { registerC1Block, getC1Block } from '../../../blocks-v2';
import type { NormalizedPatch } from '../../ir/NormalizedPatch';
import type { BlockIndex } from '../../ir/BlockIndex';

// Import block registrations for the test
import '../../../blocks-v2/all';

function makePatch(blocks: { id: string; type: string; params: Record<string, unknown> }[]): NormalizedPatch {
  return {
    graph: { blocks, edges: [] },
    blockIndex: new Map(),
    blocks,
    edges: [],
  };
}

describe('harvest', () => {
  it('collects globals from InfiniteTimeRoot', () => {
    const patch = makePatch([{ id: 'time', type: 'InfiniteTimeRoot', params: {} }]);
    const topoOrder = [0 as BlockIndex];
    const manifest = harvest(topoOrder, patch, new Map());

    expect(manifest.globals['sys:time']).toBeDefined();
    expect(manifest.globals['sys:time'].type).toBe('f32');
    expect(manifest.globals['sys:time'].isDynamic).toBe(true);
  });

  it('collects domain from RenderInstances2D', () => {
    const patch = makePatch([{
      id: 'render', type: 'RenderInstances2D',
      params: { domainId: 'particles', capacity: 128 },
    }]);
    const topoOrder = [0 as BlockIndex];
    const manifest = harvest(topoOrder, patch, new Map());

    expect(manifest.domains['particles']).toBeDefined();
    expect(manifest.domains['particles'].capacity).toBe(128);
    expect(manifest.domains['particles'].fields['pos_x']).toBeDefined();
  });

  it('merges contributions from multiple blocks', () => {
    const patch = makePatch([
      { id: 'time', type: 'InfiniteTimeRoot', params: {} },
      { id: 'render', type: 'RenderInstances2D', params: { domainId: 'dots', capacity: 64 } },
    ]);
    const topoOrder = [0 as BlockIndex, 1 as BlockIndex];
    const manifest = harvest(topoOrder, patch, new Map());

    // Time block contributes sys:time
    expect(manifest.globals['sys:time']).toBeDefined();
    // Render block contributes domain + camera + shape
    expect(manifest.domains['dots']).toBeDefined();
    expect(manifest.globals['sys:camera']).toBeDefined();
    expect(manifest.shapeBank['dots_quad']).toBeDefined();
  });

  it('skips blocks without manifestRequirements', () => {
    const patch = makePatch([{ id: 'sin', type: 'Sin', params: {} }]);
    const topoOrder = [0 as BlockIndex];
    const manifest = harvest(topoOrder, patch, new Map());

    expect(Object.keys(manifest.globals)).toHaveLength(0);
  });

  it('allows idempotent same-spec declarations', () => {
    // Two blocks declaring the same sys:time (same spec) should be fine
    const patch = makePatch([
      { id: 'time1', type: 'InfiniteTimeRoot', params: {} },
      { id: 'time2', type: 'InfiniteTimeRoot', params: {} },
    ]);
    const topoOrder = [0 as BlockIndex, 1 as BlockIndex];
    // Should not throw
    const manifest = harvest(topoOrder, patch, new Map());
    expect(manifest.globals['sys:time']).toBeDefined();
  });
});
