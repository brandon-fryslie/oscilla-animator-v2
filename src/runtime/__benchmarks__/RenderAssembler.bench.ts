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
  sliceInstanceBuffers,
  resetTopologyCacheCounters,
} from '../RenderAssembler';
import { SHAPE2D_WORDS, writeShape2D } from '../RuntimeState';

// ============================================================================
// Helpers
// ============================================================================

function createShapeBuffer(count: number, numTopologies: number): Uint32Array {
  const buffer = new Uint32Array(count * SHAPE2D_WORDS);
  for (let i = 0; i < count; i++) {
    writeShape2D(buffer, i, {
      topologyId: (i % numTopologies) + 1,
      pointsFieldSlot: ((i % numTopologies) + 1) * 10,
      pointsCount: 4,
      styleRef: 0,
      flags: 0,
    });
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

// ============================================================================
// computeTopologyGroups Benchmarks
// ============================================================================

describe('computeTopologyGroups', () => {
  const buf100_5 = createShapeBuffer(100, 5);
  const buf500_10 = createShapeBuffer(500, 10);
  const buf1000_50 = createShapeBuffer(1000, 50);

  bench('100 instances / 5 topologies', () => {
    computeTopologyGroups(buf100_5, 100);
  });

  bench('500 instances / 10 topologies', () => {
    computeTopologyGroups(buf500_10, 500);
  });

  bench('1000 instances / 50 topologies', () => {
    computeTopologyGroups(buf1000_50, 1000);
  });
});

// ============================================================================
// sliceInstanceBuffers Benchmarks
// ============================================================================

describe('sliceInstanceBuffers', () => {
  const pos500 = createPositionBuffer(500);
  const col500 = createColorBuffer(500);
  const pos1000 = createPositionBuffer(1000);
  const col1000 = createColorBuffer(1000);

  // Contiguous indices (subarray path)
  const contiguous100 = Array.from({ length: 100 }, (_, i) => i + 50);
  const contiguous500 = Array.from({ length: 500 }, (_, i) => i);

  // Non-contiguous indices (copy path) — every other
  const nonContiguous100 = Array.from({ length: 100 }, (_, i) => i * 2);
  const nonContiguous500 = Array.from({ length: 500 }, (_, i) => i * 2);

  bench('100 contiguous (subarray)', () => {
    sliceInstanceBuffers(pos500, col500, contiguous100);
  });

  bench('100 non-contiguous (copy)', () => {
    sliceInstanceBuffers(pos500, col500, nonContiguous100);
  });

  bench('500 contiguous (subarray)', () => {
    sliceInstanceBuffers(pos1000, col1000, contiguous500);
  });

  bench('500 non-contiguous (copy)', () => {
    sliceInstanceBuffers(pos1000, col1000, nonContiguous500);
  });
});

// ============================================================================
// Cache Hit vs Miss Benchmarks
// ============================================================================

describe('topology cache: hit vs miss', () => {
  const buf = createShapeBuffer(500, 10);

  bench('cache hit (same buffer, same count)', () => {
    // After first call, all subsequent are cache hits
    groupInstancesByTopology(buf, 500);
  });

  bench('cache miss (new buffer each time)', () => {
    // Each iteration creates a new buffer → always miss
    const freshBuf = createShapeBuffer(500, 10);
    resetTopologyCacheCounters();
    groupInstancesByTopology(freshBuf, 500);
  });
});
