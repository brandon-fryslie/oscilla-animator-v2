/**
 * RenderAssembler Benchmarks
 *
 * Measures performance of topology grouping, buffer slicing, and caching.
 * Run with: npm run bench
 */
import { describe, bench } from 'vitest';
import {
  computeTopologyGroups,
  groupInstancesByTopology,
  // sliceInstanceBuffers - removed (function no longer exported)
  resetTopologyCacheCounters,
  topologyGroupCacheMisses,
} from '../RenderAssembler';
import {
  SHAPE_BANK_HEADER_WORDS,
  allocShapeBankWords,
  createShapeBankHeaderV1,
  createRuntimeState,
  resetFrameVolatileShapeBank,
  writeShapeBankHandleMetadata,
  writeShapeBankHeader,
} from '../RuntimeState';

const BENCH_STATE = createRuntimeState(0, 0, 0, 0, 1_000_000);

// ============================================================================
// Helpers
// ============================================================================

function createShapeBuffer(count: number, numTopologies: number, state: typeof BENCH_STATE = BENCH_STATE): Float32Array {
  if (!state.shapeBank) throw new Error('Benchmark state missing shapeBank');
  const buffer = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const topologyId = (i % numTopologies) + 1;
    const controlPointSlot = topologyId * 10;
    const handle = allocShapeBankWords(state.shapeBank, SHAPE_BANK_HEADER_WORDS);
    writeShapeBankHeader(
      state.shapeBank.data,
      handle,
      createShapeBankHeaderV1({
        kind: 1,
        topologyMode: 1,
        indexCount: 4,
        vertexCount: 4,
      }),
    );
    writeShapeBankHandleMetadata(state.shapeBank, handle, {
      topologyId,
      controlPointSlot,
    });
    buffer[i] = handle;
  }
  return buffer;
}

function createPositionBuffer(count: number): Float32Array {
  const buf = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    buf[i * 2] = Math.random();
    buf[i * 2 + 1] = Math.random();
  }
  return buf;
}

function createColorBuffer(count: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    buf[i * 4] = Math.floor(Math.random() * 255);
    buf[i * 4 + 1] = Math.floor(Math.random() * 255);
    buf[i * 4 + 2] = Math.floor(Math.random() * 255);
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

// Reset volatile allocator before creating one-shot benchmark buffers.
resetFrameVolatileShapeBank(BENCH_STATE);

// ============================================================================
// computeTopologyGroups Benchmarks
// ============================================================================

describe('computeTopologyGroups', () => {
  const buf100_5 = createShapeBuffer(100, 5);
  const buf500_10 = createShapeBuffer(500, 10);
  const buf1000_50 = createShapeBuffer(1000, 50);

  bench('100 instances / 5 topologies', () => {
    computeTopologyGroups(buf100_5, 100, BENCH_STATE);
  });

  bench('500 instances / 10 topologies', () => {
    computeTopologyGroups(buf500_10, 500, BENCH_STATE);
  });

  bench('1000 instances / 50 topologies', () => {
    computeTopologyGroups(buf1000_50, 1000, BENCH_STATE);
  });
});

// ============================================================================
// Cache Hit vs Miss Benchmarks
// ============================================================================

describe('topology cache: hit vs miss', () => {
  const buf = createShapeBuffer(500, 10);
  const missState = createRuntimeState(0, 0, 0, 0, 8_192);

  bench('cache hit (same buffer, same count)', () => {
    // After first call, all subsequent are cache hits
    groupInstancesByTopology(buf, 500, BENCH_STATE);
  });

  bench('cache miss (new buffer each time)', () => {
    // Each iteration builds a fresh handle buffer in an isolated state.
    resetFrameVolatileShapeBank(missState);
    const freshBuf = createShapeBuffer(500, 10, missState);
    resetTopologyCacheCounters();
    groupInstancesByTopology(freshBuf, 500, missState);
  });
});

describe('topology cache stability guard', () => {
  const buf = createShapeBuffer(5000, 32);
  // Warm cache once.
  groupInstancesByTopology(buf, 5000, BENCH_STATE);

  bench('stress cache hit does not recompute groups', () => {
    const missesBefore = topologyGroupCacheMisses;
    groupInstancesByTopology(buf, 5000, BENCH_STATE);
    if (topologyGroupCacheMisses !== missesBefore) {
      throw new Error('RenderAssembler cache regression: cache hit path recomputed topology groups');
    }
  });
});
