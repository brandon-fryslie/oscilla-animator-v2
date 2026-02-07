import { describe, it, expect } from 'vitest';
import { BufferPool } from '../BufferPool';

describe('BufferPool', () => {
  it('returns inUse=0 after releaseAll', () => {
    const pool = new BufferPool();

    pool.alloc('f32', 10);
    pool.alloc('f32', 10);
    pool.alloc('vec2f32', 5);

    const before = pool.getStats();
    expect(before.inUse).toBe(3);

    pool.releaseAll();

    const after = pool.getStats();
    expect(after.inUse).toBe(0);
    expect(after.pooled).toBe(3);
  });

  it('reuses buffers from the pool', () => {
    const pool = new BufferPool();

    const a = pool.alloc('f32', 10);
    pool.releaseAll();

    const b = pool.alloc('f32', 10);
    expect(b).toBe(a); // same buffer object, reused
  });

  it('prunes stale keys after threshold', () => {
    const pool = new BufferPool();

    // Alloc a key that will become stale
    pool.alloc('f32', 999);
    pool.releaseAll();

    // Run 300 frames without using that key, but use a different key
    for (let i = 0; i < 300; i++) {
      pool.alloc('f32', 1);
      pool.releaseAll();
    }

    // After pruning, the stale key (f32:999) should be gone
    const stats = pool.getStats();
    // Only the f32:1 key should remain
    expect(stats.poolKeys).toBe(1);
  });

  it('reset clears everything', () => {
    const pool = new BufferPool();

    pool.alloc('f32', 10);
    pool.alloc('vec2f32', 5);
    pool.releaseAll();

    pool.reset();

    const stats = pool.getStats();
    expect(stats.pooled).toBe(0);
    expect(stats.inUse).toBe(0);
    expect(stats.poolKeys).toBe(0);

    const frameStats = pool.getFrameStats();
    expect(frameStats.pooledBytes).toBe(0);
  });

  it('tracks frame stats accurately', () => {
    const pool = new BufferPool();

    pool.alloc('f32', 10);
    pool.alloc('f32', 20);
    pool.releaseAll();

    const stats = pool.getFrameStats();
    expect(stats.allocs).toBe(2);
    expect(stats.releases).toBe(2);
    expect(stats.pooledBytes).toBeGreaterThan(0);
    expect(stats.poolKeys).toBe(2);
  });
});
