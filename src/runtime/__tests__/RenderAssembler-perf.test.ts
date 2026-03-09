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
} from '../LegacyRenderAssembler';
import {
  SHAPE_BANK_HEADER_WORDS,
  allocShapeBankWords,
  createShapeBankHeaderV1,
  createRuntimeState,
  resetFrameVolatileShapeBank,
  writeShapeBankHandleMetadata,
  writeShapeBankHeader,
} from '../RuntimeState';

const TEST_STATE = createRuntimeState();

// Helper: create a handle buffer with N instances of given topologies
function createShapeBuffer(
  topologies: Array<{ topologyId: number; pointsFieldSlot: number; pointsCount: number; flags: number }>,
): Float32Array {
  const buffer = new Float32Array(topologies.length);
  if (!TEST_STATE.shapeBank) throw new Error('Test state missing shapeBank');
  for (let i = 0; i < topologies.length; i++) {
    const handle = allocShapeBankWords(TEST_STATE.shapeBank, SHAPE_BANK_HEADER_WORDS);
    writeShapeBankHeader(
      TEST_STATE.shapeBank.data,
      handle,
      createShapeBankHeaderV1({
        kind: 1,
        topologyMode: 1,
        indexCount: topologies[i].pointsCount,
        vertexCount: topologies[i].pointsCount,
        flags: topologies[i].flags,
      }),
    );
    writeShapeBankHandleMetadata(TEST_STATE.shapeBank, handle, {
      topologyId: topologies[i].topologyId,
      controlPointSlot: topologies[i].pointsFieldSlot,
    });
    buffer[i] = handle;
  }
  return buffer;
}

// Helper: create a uniform shape buffer (all same topology)
function createUniformShapeBuffer(count: number, topologyId: number = 1): Float32Array {
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
    resetFrameVolatileShapeBank(TEST_STATE);
  });

  it('cache hit: same buffer ref + same count → reuse (computed once)', () => {
    const buffer = createUniformShapeBuffer(5);

    const result1 = groupInstancesByTopology(buffer, 5, TEST_STATE);
    expect(topologyGroupCacheMisses).toBe(1);
    expect(topologyGroupCacheHits).toBe(0);

    const result2 = groupInstancesByTopology(buffer, 5, TEST_STATE);
    expect(topologyGroupCacheHits).toBe(1);
    expect(topologyGroupCacheMisses).toBe(1); // Still 1 from first call

    // Same object reference — cache hit returns same groups
    expect(result2).toBe(result1);
  });

  it('cache miss: new buffer reference → recompute', () => {
    const buffer1 = createUniformShapeBuffer(5);
    const buffer2 = createUniformShapeBuffer(5); // Different object, same content

    groupInstancesByTopology(buffer1, 5, TEST_STATE);
    expect(topologyGroupCacheMisses).toBe(1);

    groupInstancesByTopology(buffer2, 5, TEST_STATE);
    expect(topologyGroupCacheMisses).toBe(2);
  });

  it('cache miss: same buffer, different count → recompute', () => {
    // Buffer is big enough for 10 instances
    const buffer = createUniformShapeBuffer(10);

    const result1 = groupInstancesByTopology(buffer, 5, TEST_STATE);
    expect(topologyGroupCacheMisses).toBe(1);

    const result2 = groupInstancesByTopology(buffer, 7, TEST_STATE);
    expect(topologyGroupCacheMisses).toBe(2);

    // Different results since count differs
    expect(result2).not.toBe(result1);
  });

  it('cache updates on miss (new count replaces old entry)', () => {
    const buffer = createUniformShapeBuffer(10);

    groupInstancesByTopology(buffer, 5, TEST_STATE);
    groupInstancesByTopology(buffer, 7, TEST_STATE); // Miss, replaces cache entry

    // Now calling with 7 should hit
    const result = groupInstancesByTopology(buffer, 7, TEST_STATE);
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

    const groups = computeTopologyGroups(buffer, 5, TEST_STATE);

    expect(groups.size).toBe(2);
    expect(groups.get('1:10')!.instanceIndices).toEqual([0, 2, 4]);
    expect(groups.get('2:20')!.instanceIndices).toEqual([1, 3]);
  });

  it('computeTopologyGroups preserves integer handle identity for numeric shape buffers', () => {
    const handleA = allocShapeBankWords(TEST_STATE.shapeBank!, SHAPE_BANK_HEADER_WORDS);
    writeShapeBankHeader(
      TEST_STATE.shapeBank!.data,
      handleA,
      createShapeBankHeaderV1({
        kind: 1,
        topologyMode: 1,
        indexCount: 4,
        vertexCount: 4,
        flags: 1,
      }),
    );
    writeShapeBankHandleMetadata(TEST_STATE.shapeBank!, handleA, {
      topologyId: 7,
      controlPointSlot: 11,
    });

    const handleB = allocShapeBankWords(TEST_STATE.shapeBank!, SHAPE_BANK_HEADER_WORDS);
    writeShapeBankHeader(
      TEST_STATE.shapeBank!.data,
      handleB,
      createShapeBankHeaderV1({
        kind: 1,
        topologyMode: 1,
        indexCount: 3,
        vertexCount: 3,
        flags: 0,
      }),
    );
    writeShapeBankHandleMetadata(TEST_STATE.shapeBank!, handleB, {
      topologyId: 9,
      controlPointSlot: 13,
    });

    const handleBuffer = new Float32Array([handleA, handleB, handleA, handleA]);
    const groups = computeTopologyGroups(handleBuffer, handleBuffer.length, TEST_STATE);

    expect(groups.size).toBe(2);
    expect(groups.get('7:11')!.instanceIndices).toEqual([0, 2, 3]);
    expect(groups.get('9:13')!.instanceIndices).toEqual([1]);
  });

  it('computeTopologyGroups rejects non-integer numeric handles', () => {
    const handleA = allocShapeBankWords(TEST_STATE.shapeBank!, SHAPE_BANK_HEADER_WORDS);
    writeShapeBankHeader(
      TEST_STATE.shapeBank!.data,
      handleA,
      createShapeBankHeaderV1({
        kind: 1,
        topologyMode: 1,
        indexCount: 4,
        vertexCount: 4,
        flags: 1,
      }),
    );
    writeShapeBankHandleMetadata(TEST_STATE.shapeBank!, handleA, {
      topologyId: 7,
      controlPointSlot: 11,
    });

    const corruptedHandles = new Float32Array([handleA, handleA + 0.5]);
    expect(() => computeTopologyGroups(corruptedHandles, 2, TEST_STATE)).toThrow(/must be an integer/i);
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
    const state = createRuntimeState();

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
