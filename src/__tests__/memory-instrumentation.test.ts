/**
 * Memory Instrumentation Integration Test
 *
 * Verifies the RenderBufferArena provides zero-allocation rendering after init.
 */
import { describe, test, expect } from 'vitest';

import { RenderBufferArena } from '../render/RenderBufferArena';

describe('RenderBufferArena Memory Instrumentation', () => {
  test('P0: Arena allocation tracking', () => {
    const arena = new RenderBufferArena(10_000);
    arena.init();

    // Allocate some buffers
    arena.allocF32(100);
    arena.allocVec2(50);
    arena.allocRGBA(200);

    const stats = arena.getFrameStats();
    expect(stats.allocCount).toBe(3);
    expect(stats.f32Used).toBe(100);
    expect(stats.vec2Used).toBe(50);
    expect(stats.rgbaUsed).toBe(200);
  });

  test('P1: Arena reset clears usage but preserves capacity', () => {
    const arena = new RenderBufferArena(10_000);
    arena.init();

    // Allocate buffers
    arena.allocF32(100);
    arena.allocVec2(50);

    const statsBeforeReset = arena.getFrameStats();
    expect(statsBeforeReset.f32Used).toBe(100);
    expect(statsBeforeReset.vec2Used).toBe(50);

    // Reset arena (simulates new frame)
    arena.reset();

    const statsAfterReset = arena.getFrameStats();
    expect(statsAfterReset.f32Used).toBe(0);
    expect(statsAfterReset.vec2Used).toBe(0);
    expect(statsAfterReset.allocCount).toBe(0);

    // Peak should still be tracked
    const peakStats = arena.getPeakStats();
    expect(peakStats.peakF32).toBe(100);
    expect(peakStats.peakVec2).toBe(50);
  });

  test('P2: Total bytes tracks pre-allocated memory', () => {
    const arena = new RenderBufferArena(1000);
    arena.init();

    // Expected bytes for 1000 elements:
    // f32:  1000 * 4 = 4,000 bytes
    // vec2: 1000 * 2 * 4 = 8,000 bytes
    // vec3: 1000 * 3 * 4 = 12,000 bytes
    // rgba: 1000 * 4 = 4,000 bytes
    // u32:  1000 * 4 = 4,000 bytes
    // u8:   1000 * 1 = 1,000 bytes
    // Total: 33,000 bytes

    const totalBytes = arena.getTotalBytes();
    expect(totalBytes).toBe(33_000);
  });

  test('P3: Arena throws on overflow', () => {
    const arena = new RenderBufferArena(100);
    arena.init();

    // Should work fine
    arena.allocF32(50);
    arena.allocF32(50);

    // Should throw - exceeds capacity
    expect(() => arena.allocF32(1)).toThrow(/overflow/i);
  });

  test('P4: Multiple frames track peak usage', () => {
    const arena = new RenderBufferArena(10_000);
    arena.init();

    // Frame 1: use 100 f32
    arena.allocF32(100);
    arena.reset();

    // Frame 2: use 200 f32
    arena.allocF32(200);
    arena.reset();

    // Frame 3: use 50 f32
    arena.allocF32(50);
    arena.reset();

    // Peak should be 200
    const peakStats = arena.getPeakStats();
    expect(peakStats.peakF32).toBe(200);
  });

  test('P5: Subarray views share backing buffer (zero-copy)', () => {
    const arena = new RenderBufferArena(1000);
    arena.init();

    const view1 = arena.allocF32(100);
    const view2 = arena.allocF32(100);

    // Views should be different subarrays
    expect(view1).not.toBe(view2);
    expect(view1.length).toBe(100);
    expect(view2.length).toBe(100);

    // But they should share the same underlying buffer
    // (views are contiguous in the backing buffer)
    expect(view1.buffer).toBe(view2.buffer);
  });

  test('P6: Arena not initialized throws', () => {
    const arena = new RenderBufferArena(1000);
    // Don't call init()

    expect(() => arena.allocF32(100)).toThrow(/not initialized/i);
    expect(() => arena.reset()).toThrow(/not initialized/i);
  });

  test('P7: Double init throws', () => {
    const arena = new RenderBufferArena(1000);
    arena.init();

    expect(() => arena.init()).toThrow(/init.*called twice/i);
  });

  test('P8: Full 50k capacity stress test', () => {
    const arena = new RenderBufferArena(50_000);
    arena.init();

    // Simulate a frame with 50k elements
    // Each element needs: position (vec2), depth (f32), color (rgba)
    // Note: f32 pool is shared for depth and size, so we can only do 50k total f32 allocs
    const positions = arena.allocVec2(50_000);
    const depths = arena.allocF32(25_000);
    const sizes = arena.allocF32(25_000);
    const colors = arena.allocRGBA(50_000);

    // Verify we got the right sizes
    expect(positions.length).toBe(100_000); // 50k * 2 floats
    expect(depths.length).toBe(25_000);
    expect(sizes.length).toBe(25_000);
    expect(colors.length).toBe(200_000); // 50k * 4 bytes

    // Verify we can write to them
    positions[0] = 0.5;
    positions[1] = 0.5;
    depths[0] = 0.0;
    colors[0] = 255;
    colors[1] = 0;
    colors[2] = 0;
    colors[3] = 255;
    sizes[0] = 1.0;

    // Verify stats
    const stats = arena.getFrameStats();
    expect(stats.vec2Used).toBe(50_000);
    expect(stats.f32Used).toBe(50_000); // 25k depths + 25k sizes
    expect(stats.rgbaUsed).toBe(50_000);

    // Reset and verify we can allocate again (zero-allocation reuse)
    arena.reset();

    const positions2 = arena.allocVec2(50_000);
    expect(positions2.length).toBe(100_000);

    // Same backing buffer, so first allocation's data should still be there
    // (unless we explicitly clear, which we don't)
    expect(positions2[0]).toBe(0.5);
    expect(positions2[1]).toBe(0.5);
  });

  test('P9: Strict mode frame lifecycle', () => {
    const arena = new RenderBufferArena(1000);
    arena.init();
    arena.enableStrictMode();

    expect(arena.isStrictModeEnabled()).toBe(true);
    expect(arena.isFrameInProgress()).toBe(false);

    arena.beginFrame();
    expect(arena.isFrameInProgress()).toBe(true);

    // Allocate during frame
    arena.allocF32(100);

    arena.endFrame();
    expect(arena.isFrameInProgress()).toBe(false);
  });
});
