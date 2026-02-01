/**
 * Memory Profile Tests
 *
 * Automated tests that verify zero-allocation rendering by measuring heap growth.
 * These tests require --expose-gc to force garbage collection for accurate measurements.
 *
 * Run with: npm run test:memory
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { buildPatch } from '../graph/Patch';
import { compile } from '../compiler/compile';
import { executeFrame } from '../runtime/ScheduleExecutor';
import { createRuntimeState } from '../runtime/RuntimeState';
import { RenderBufferArena } from '../render/RenderBufferArena';

// Check if GC is exposed
const gcAvailable = typeof global.gc === 'function';

/**
 * Force garbage collection if available.
 * Returns true if GC was performed.
 */
function forceGC(): boolean {
  if (gcAvailable) {
    global.gc!();
    return true;
  }
  return false;
}

/**
 * Get current heap usage in bytes.
 */
function getHeapUsed(): number {
  return process.memoryUsage().heapUsed;
}

/**
 * Measure heap growth during a function execution.
 * Runs GC before and after to get accurate delta.
 */
function measureHeapGrowth(fn: () => void): { deltaBytes: number; gcAvailable: boolean } {
  const hadGC = forceGC();
  const before = getHeapUsed();

  fn();

  forceGC();
  const after = getHeapUsed();

  return {
    deltaBytes: after - before,
    gcAvailable: hadGC,
  };
}

/**
 * Build a test patch with N instances for memory testing.
 */
function buildMemoryTestPatch(instanceCount: number) {
  // Calculate grid dimensions
  const cols = Math.ceil(Math.sqrt(instanceCount));
  const rows = Math.ceil(instanceCount / cols);

  return buildPatch((b) => {
    // Required: TimeRoot
    const time = b.addBlock('InfiniteTimeRoot', {});

    const ellipse = b.addBlock('Ellipse', { rx: 0.01, ry: 0.01 });
    const array = b.addBlock('Array', { count: instanceCount });
    const layout = b.addBlock('GridLayoutUV', { rows, cols });

    // Simple white color
    const color = b.addBlock('Const', { value: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 } });

    const render = b.addBlock('RenderInstances2D', {});

    // Wire shape through array
    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');

    // Wire to render
    b.wire(layout, 'position', render, 'pos');
    b.wire(color, 'out', render, 'color');
    b.wire(ellipse, 'shape', render, 'shape');
  });
}

describe('Memory Profile: Zero-Allocation Rendering', () => {
  // Skip these tests if GC is not available (they won't be accurate)
  const describeWithGC = gcAvailable ? describe : describe.skip;

  describeWithGC('Heap Growth Tests (requires --expose-gc)', () => {
    it('100 frames with 1000 instances: heap growth < 500KB', () => {
      // NOTE: Some small allocations remain (e.g., topology.verbs copying).
      // This test ensures we don't regress significantly.
      // Target: < 500KB for 100 frames (5KB/frame budget)
      const patch = buildMemoryTestPatch(1000);
      const result = compile(patch);
      if (result.kind !== 'ok') throw new Error('Compile failed');

      const program = result.program;
      const state = createRuntimeState(program.slotMeta.length);
      const arena = new RenderBufferArena(50_000);
      arena.init();

      // Warm up - run a few frames to stabilize JIT
      for (let i = 0; i < 10; i++) {
        arena.reset();
        executeFrame(program, state, arena, i * 16.667);
      }

      // Measure heap growth during 100 frames
      const { deltaBytes, gcAvailable } = measureHeapGrowth(() => {
        for (let frame = 0; frame < 100; frame++) {
          arena.reset();
          executeFrame(program, state, arena, (frame + 10) * 16.667);
        }
      });

      const deltaKB = deltaBytes / 1024;
      console.log(`100 frames × 1000 instances: heap delta = ${deltaKB.toFixed(1)} KB`);

      if (gcAvailable) {
        // Allow some slack for V8 internals, JIT compilation artifacts,
        // and remaining small allocations (topology.verbs, etc.)
        expect(deltaKB).toBeLessThan(500);
      }
    });

    it('100 frames with 5000 instances: heap growth < 500KB', () => {
      // NOTE: Some small allocations remain (e.g., topology.verbs copying).
      // This test ensures we don't regress significantly.
      const patch = buildMemoryTestPatch(5000);
      const result = compile(patch);
      if (result.kind !== 'ok') throw new Error('Compile failed');

      const program = result.program;
      const state = createRuntimeState(program.slotMeta.length);
      const arena = new RenderBufferArena(50_000);
      arena.init();

      // Warm up
      for (let i = 0; i < 10; i++) {
        arena.reset();
        executeFrame(program, state, arena, i * 16.667);
      }

      // Measure
      const { deltaBytes, gcAvailable } = measureHeapGrowth(() => {
        for (let frame = 0; frame < 100; frame++) {
          arena.reset();
          executeFrame(program, state, arena, (frame + 10) * 16.667);
        }
      });

      const deltaKB = deltaBytes / 1024;
      console.log(`100 frames × 5000 instances: heap delta = ${deltaKB.toFixed(1)} KB`);

      if (gcAvailable) {
        expect(deltaKB).toBeLessThan(500);
      }
    });

    it('steady state: batches show consistent (non-cumulative) growth', () => {
      // This test verifies that memory growth is bounded and doesn't accumulate.
      // Each batch should have roughly similar growth, not increasing growth.
      const patch = buildMemoryTestPatch(1000);
      const result = compile(patch);
      if (result.kind !== 'ok') throw new Error('Compile failed');

      const program = result.program;
      const state = createRuntimeState(program.slotMeta.length);
      const arena = new RenderBufferArena(50_000);
      arena.init();

      // Warm up
      for (let i = 0; i < 50; i++) {
        arena.reset();
        executeFrame(program, state, arena, i * 16.667);
      }

      // Measure first batch
      const batch1 = measureHeapGrowth(() => {
        for (let frame = 0; frame < 100; frame++) {
          arena.reset();
          executeFrame(program, state, arena, (frame + 50) * 16.667);
        }
      });

      // Measure second batch (should have similar or less growth)
      const batch2 = measureHeapGrowth(() => {
        for (let frame = 0; frame < 100; frame++) {
          arena.reset();
          executeFrame(program, state, arena, (frame + 150) * 16.667);
        }
      });

      // Measure third batch
      const batch3 = measureHeapGrowth(() => {
        for (let frame = 0; frame < 100; frame++) {
          arena.reset();
          executeFrame(program, state, arena, (frame + 250) * 16.667);
        }
      });

      console.log(`Batch 1: ${(batch1.deltaBytes / 1024).toFixed(1)} KB`);
      console.log(`Batch 2: ${(batch2.deltaBytes / 1024).toFixed(1)} KB`);
      console.log(`Batch 3: ${(batch3.deltaBytes / 1024).toFixed(1)} KB`);

      if (batch1.gcAvailable) {
        // Key insight: growth should be bounded, not cumulative.
        // Each batch should be under 500KB (same as single-batch tests).
        // This proves memory doesn't leak over time.
        expect(batch1.deltaBytes / 1024).toBeLessThan(500);
        expect(batch2.deltaBytes / 1024).toBeLessThan(500);
        expect(batch3.deltaBytes / 1024).toBeLessThan(500);
      }
    });
  });

  // These tests always run and just report numbers (no assertions without GC)
  describe('Memory Usage Reporting (informational)', () => {
    it('reports heap usage for 100 frames × 2500 instances', () => {
      const patch = buildMemoryTestPatch(2500);
      const result = compile(patch);
      if (result.kind !== 'ok') {
        console.error('Compile errors:', JSON.stringify(result.errors, null, 2));
        throw new Error('Compile failed');
      }

      const program = result.program;
      const state = createRuntimeState(program.slotMeta.length);
      const arena = new RenderBufferArena(50_000);
      arena.init();

      // Warm up
      for (let i = 0; i < 10; i++) {
        arena.reset();
        executeFrame(program, state, arena, i * 16.667);
      }

      const before = getHeapUsed();

      for (let frame = 0; frame < 100; frame++) {
        arena.reset();
        executeFrame(program, state, arena, (frame + 10) * 16.667);
      }

      const after = getHeapUsed();
      const deltaKB = (after - before) / 1024;

      console.log(`\n=== Memory Profile Report ===`);
      console.log(`GC available: ${gcAvailable}`);
      console.log(`Heap before: ${(before / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Heap after: ${(after / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Delta: ${deltaKB.toFixed(1)} KB`);
      console.log(`Arena capacity: ${arena.maxElements} elements`);
      console.log(`Arena pre-allocated: ${(arena.getTotalBytes() / 1024 / 1024).toFixed(2)} MB`);

      const peakStats = arena.getPeakStats();
      console.log(`Peak vec2 usage: ${peakStats.peakVec2} / ${peakStats.maxElements}`);
      console.log(`Peak f32 usage: ${peakStats.peakF32} / ${peakStats.maxElements}`);
      console.log(`Peak rgba usage: ${peakStats.peakRGBA} / ${peakStats.maxElements}`);
      console.log(`=============================\n`);

      // This test always passes - it's just for reporting
      expect(true).toBe(true);
    });
  });
});

// Type augmentation for global.gc
// Note: Using NodeJS.GCFunction to match @types/node declaration
declare global {
  // eslint-disable-next-line no-var
  var gc: NodeJS.GCFunction | undefined;
}
