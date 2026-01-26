/**
 * Memory Instrumentation Integration Test
 *
 * Verifies Sprint: memory-instrumentation implementation
 */
import { describe, test, expect } from 'vitest';

import { BufferPool } from '../runtime/BufferPool';
import { createRuntimeState } from '../runtime/RuntimeState';
import { recordPoolStats } from '../runtime/HealthMonitor';

describe('Memory Instrumentation', () => {
  test('P0: Pool allocation tracking', () => {
    const pool = new BufferPool();
    const state = createRuntimeState(1000);

    // Allocate some buffers
    pool.alloc('f32', 100);
    pool.alloc('vec2f32', 50);
    pool.alloc('rgba8', 200);

    // Release all buffers (this records frame stats internally)
    pool.releaseAll();

    // Record stats to health metrics AFTER release
    recordPoolStats(state, pool);

    // Verify allocations and releases are tracked
    expect(state.health.poolAllocs).toBe(3);
    expect(state.health.poolReleases).toBe(3);
  });

  test('P1: Total pooled bytes', () => {
    const pool = new BufferPool();
    const state = createRuntimeState(1000);

    // Allocate buffers with known sizes
    pool.alloc('f32', 100);      // 100 * 4 = 400 bytes
    pool.alloc('vec2f32', 50);    // 50 * 2 * 4 = 400 bytes
    pool.alloc('rgba8', 200);     // 200 * 4 = 800 bytes
    // Total: 1600 bytes

    // Release buffers (records stats)
    pool.releaseAll();

    // Record stats to health metrics
    recordPoolStats(state, pool);

    // Verify total bytes
    expect(state.health.pooledBytes).toBe(1600);
  });

  test('P2: Health metrics integration', () => {
    const pool = new BufferPool();
    const state = createRuntimeState(1000);

    // Allocate with different formats (creates 3 pool keys)
    pool.alloc('f32', 100);
    pool.alloc('vec2f32', 50);
    pool.alloc('rgba8', 200);

    // Release buffers (records stats)
    pool.releaseAll();

    // Record stats to health metrics
    recordPoolStats(state, pool);

    // Verify pool key count
    expect(state.health.poolKeyCount).toBe(3);

    // Get stats directly from pool
    const frameStats = pool.getFrameStats();
    expect(frameStats.allocs).toBe(3);
    expect(frameStats.releases).toBe(3);
  });

  test('Memory leak detection: imbalanced allocs/releases', () => {
    const pool = new BufferPool();
    const state = createRuntimeState(1000);

    // First frame: allocate 3 buffers
    pool.alloc('f32', 100);
    pool.alloc('vec2f32', 50);
    pool.alloc('rgba8', 200);

    pool.releaseAll();
    recordPoolStats(state, pool);

    // Normal case: balanced
    expect(state.health.poolAllocs).toBe(3);
    expect(state.health.poolReleases).toBe(3);

    // Second frame: allocate 5 buffers (simulating reuse from pool)
    // Note: 3 will be reused from pool, 2 will be new allocations
    pool.alloc('f32', 100);      // Reused
    pool.alloc('vec2f32', 50);   // Reused
    pool.alloc('rgba8', 200);    // Reused
    pool.alloc('f32', 50);       // New allocation
    pool.alloc('vec2f32', 25);   // New allocation

    pool.releaseAll();
    recordPoolStats(state, pool);

    // Stats should show 5 allocations and 5 releases
    expect(state.health.poolAllocs).toBe(5);
    expect(state.health.poolReleases).toBe(5);
  });
});
