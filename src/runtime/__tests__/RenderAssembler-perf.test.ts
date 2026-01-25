/**
 * RenderAssembler Performance Optimization Tests
 *
 * Tests for:
 * - Topology group caching (WeakMap)
 * - Buffer view optimization (subarray for contiguous indices)
 * - Assembler timing instrumentation
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  groupInstancesByTopology,
  computeTopologyGroups,
  isContiguous,
  topologyGroupCacheHits,
  topologyGroupCacheMisses,
  resetTopologyCacheCounters,
} from '../RenderAssembler';
import { SHAPE2D_WORDS, writeShape2D, createRuntimeState } from '../RuntimeState';

// Helper: create a shape buffer with N instances of given topologies
function createShapeBuffer(topologies: Array<{ topologyId: number; pointsFieldSlot: number; pointsCount: number; flags: number }>): Uint32Array {
  const buffer = new Uint32Array(topologies.length * SHAPE2D_WORDS);
  for (let i = 0; i < topologies.length; i++) {
    writeShape2D(buffer, i, {
      topologyId: topologies[i].topologyId,
      pointsFieldSlot: topologies[i].pointsFieldSlot,
      pointsCount: topologies[i].pointsCount,
      styleRef: 0,
      flags: topologies[i].flags,
    });
  }
  return buffer;
}

// Helper: create a uniform shape buffer (all same topology)
function createUniformShapeBuffer(count: number, topologyId: number = 1): Uint32Array {
  const entries = Array.from({ length: count }, () => ({
    topologyId,
    pointsFieldSlot: 10,
    pointsCount: 4,
    flags: 0,
  }));
  return createShapeBuffer(entries);
}

describe('Topology Group Caching', () => {
  beforeEach(() => {
    resetTopologyCacheCounters();
  });

  it('cache hit: same buffer ref + same count → reuse (computed once)', () => {
    const buffer = createUniformShapeBuffer(5);

    const result1 = groupInstancesByTopology(buffer, 5);
    expect(topologyGroupCacheMisses).toBe(1);
    expect(topologyGroupCacheHits).toBe(0);

    const result2 = groupInstancesByTopology(buffer, 5);
    expect(topologyGroupCacheHits).toBe(1);
    expect(topologyGroupCacheMisses).toBe(1); // Still 1 from first call

    // Same object reference — cache hit returns same groups
    expect(result2).toBe(result1);
  });

  it('cache miss: new buffer reference → recompute', () => {
    const buffer1 = createUniformShapeBuffer(5);
    const buffer2 = createUniformShapeBuffer(5); // Different object, same content

    groupInstancesByTopology(buffer1, 5);
    expect(topologyGroupCacheMisses).toBe(1);

    groupInstancesByTopology(buffer2, 5);
    expect(topologyGroupCacheMisses).toBe(2);
  });

  it('cache miss: same buffer, different count → recompute', () => {
    // Buffer is big enough for 10 instances
    const buffer = createUniformShapeBuffer(10);

    const result1 = groupInstancesByTopology(buffer, 5);
    expect(topologyGroupCacheMisses).toBe(1);

    const result2 = groupInstancesByTopology(buffer, 7);
    expect(topologyGroupCacheMisses).toBe(2);

    // Different results since count differs
    expect(result2).not.toBe(result1);
  });

  it('cache updates on miss (new count replaces old entry)', () => {
    const buffer = createUniformShapeBuffer(10);

    groupInstancesByTopology(buffer, 5);
    groupInstancesByTopology(buffer, 7); // Miss, replaces cache entry

    // Now calling with 7 should hit
    const result = groupInstancesByTopology(buffer, 7);
    expect(topologyGroupCacheHits).toBe(1);
    expect(result.get('1:10')!.instanceIndices.length).toBe(7);
  });

  it('computeTopologyGroups produces correct groups', () => {
    const buffer = createShapeBuffer([
      { topologyId: 1, pointsFieldSlot: 10, pointsCount: 4, flags: 0 },
      { topologyId: 2, pointsFieldSlot: 20, pointsCount: 3, flags: 1 },
      { topologyId: 1, pointsFieldSlot: 10, pointsCount: 4, flags: 0 },
      { topologyId: 2, pointsFieldSlot: 20, pointsCount: 3, flags: 1 },
      { topologyId: 1, pointsFieldSlot: 10, pointsCount: 4, flags: 0 },
    ]);

    const groups = computeTopologyGroups(buffer, 5);

    expect(groups.size).toBe(2);
    expect(groups.get('1:10')!.instanceIndices).toEqual([0, 2, 4]);
    expect(groups.get('2:20')!.instanceIndices).toEqual([1, 3]);
  });
});

describe('Buffer View Optimization', () => {
  describe('isContiguous', () => {
    it('empty array → contiguous', () => {
      expect(isContiguous([])).toBe(true);
    });

    it('single element → contiguous', () => {
      expect(isContiguous([5])).toBe(true);
    });

    it('sequential indices → contiguous', () => {
      expect(isContiguous([3, 4, 5, 6])).toBe(true);
    });

    it('non-sequential indices → not contiguous', () => {
      expect(isContiguous([0, 3, 7])).toBe(false);
    });

    it('full range [0..N-1] → contiguous', () => {
      expect(isContiguous([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(true);
    });

    it('gap in middle → not contiguous', () => {
      expect(isContiguous([0, 1, 3, 4])).toBe(false);
    });
  });

  // NOTE: sliceInstanceBuffers tests removed - function is internal and not exported
});

describe('Assembler Timing Instrumentation', () => {
  it('HealthMetrics has assembler timing fields initialized', () => {
    const state = createRuntimeState(10);

    expect(state.health.assemblerGroupingMs).toHaveLength(10);
    expect(state.health.assemblerGroupingMs.every(v => v === 0)).toBe(true);
    expect(state.health.assemblerGroupingMsIndex).toBe(0);

    expect(state.health.assemblerSlicingMs).toHaveLength(10);
    expect(state.health.assemblerSlicingMsIndex).toBe(0);

    expect(state.health.assemblerTotalMs).toHaveLength(10);
    expect(state.health.assemblerTotalMsIndex).toBe(0);

    expect(state.health.topologyGroupCacheHits).toBe(0);
    expect(state.health.topologyGroupCacheMisses).toBe(0);
  });
});
