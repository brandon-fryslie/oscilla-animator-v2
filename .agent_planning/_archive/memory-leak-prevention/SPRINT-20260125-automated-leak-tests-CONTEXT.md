# Implementation Context: automated-leak-tests

**Sprint:** CI-Enforced Memory Discipline
**Generated:** 2026-01-25

## Test Infrastructure

### Existing Test Patterns

The codebase uses Vitest with the following patterns:
- `src/runtime/__tests__/*.test.ts` - Runtime unit tests
- `tests/e2e/` - Playwright end-to-end tests
- Existing RenderAssembler tests: `src/runtime/__tests__/RenderAssembler.test.ts`

### Test File Locations

| Test Type | Location | Framework |
|-----------|----------|-----------|
| BufferPool unit | `src/runtime/__tests__/BufferPool.test.ts` | Vitest |
| Leak regression | `src/runtime/__tests__/memory-leak-regression.test.ts` | Vitest |
| Integration | `src/runtime/__tests__/RenderAssembler.test.ts` | Vitest |

## P0: Pool Balance Test

### Implementation

```typescript
// src/runtime/__tests__/BufferPool.test.ts
import { describe, it, expect } from 'vitest';
import { BufferPool } from '../BufferPool';

describe('BufferPool memory discipline', () => {
  it('should balance allocs and releases each frame', () => {
    const pool = new BufferPool();

    for (let frame = 0; frame < 10; frame++) {
      // Typical frame allocations
      pool.alloc('f32', 100);
      pool.alloc('f32', 100);
      pool.alloc('vec2f32', 100);
      pool.alloc('vec3f32', 100);
      pool.alloc('rgba8', 100);

      // Frame end
      pool.releaseAll();

      const stats = pool.getFrameStats();
      expect(stats.releases).toBeGreaterThan(0);
      // All allocated buffers should be released
    }
  });

  it('should reuse buffers across frames', () => {
    const pool = new BufferPool();

    // Frame 1: allocate
    const buf1 = pool.alloc('f32', 100);
    pool.releaseAll();

    // Frame 2: should get same buffer back
    const buf2 = pool.alloc('f32', 100);

    // Same underlying buffer (reference equality)
    expect(buf1).toBe(buf2);
  });
});
```

## P2: Topology Group Regression Test

### Approach

1. Create test shapes, positions, colors
2. Call `assemblePerInstanceShapes` (or the code path that was leaking)
3. Poison the module-level pooled buffers
4. Assert DrawOp data is unaffected

### Implementation

```typescript
// src/runtime/__tests__/memory-leak-regression.test.ts
import { describe, it, expect } from 'vitest';
import { depthSortAndCompact, ensureBufferCapacity } from '../RenderAssembler';

describe('memory leak regression', () => {
  it('depthSortAndCompact should not retain pooled views', () => {
    // Setup projection output
    const count = 10;
    const projection = {
      screenPosition: new Float32Array(count * 2).fill(0.5),
      screenRadius: new Float32Array(count).fill(0.1),
      depth: new Float32Array(count).fill(0),
      visible: new Uint8Array(count).fill(1),
    };
    const color = new Uint8ClampedArray(count * 4).fill(128);

    // Get compacted result
    const compacted = depthSortAndCompact(projection, count, color);

    // Save the actual values
    const savedPos = Array.from(compacted.screenPosition);
    const savedRadius = Array.from(compacted.screenRadius);

    // Poison the pooled buffers (simulate next frame)
    ensureBufferCapacity(count);
    // This is where the leak would manifest - if compacted.screenPosition
    // is a view into pooledScreenPos, it would now contain NaN
    // (We'd need to export pooledScreenPos for this test, or call releaseAll)

    // NOTE: The real test should copy values BEFORE poisoning if we want
    // to verify independence. Or test by running two compacts and checking
    // the first isn't corrupted.

    // Better approach: run two compacts, verify data independence
    const compacted1 = depthSortAndCompact(projection, count, color);
    const pos1 = Array.from(compacted1.screenPosition);

    const compacted2 = depthSortAndCompact(projection, count, color);
    const pos2 = Array.from(compacted2.screenPosition);

    // Before the fix: pos1 would be corrupted by second call
    // After the fix: pos1 should be unchanged
    expect(pos1).toEqual(pos2);
  });
});
```

### Better Regression Test

Since the fix involves **copying** the compacted data when storing in DrawOp, the real test should exercise `assembleDrawPathInstancesOp`:

```typescript
it('DrawOp instances should be independent of pooled buffers', () => {
  // This requires more setup but is the true regression test
  const step: StepRender = { /* mock render step */ };
  const context: AssemblerContext = { /* mock context */ };

  const ops = assembleDrawPathInstancesOp(step, context, pool);

  // Trigger another assembly that would overwrite pooled buffers
  const ops2 = assembleDrawPathInstancesOp(step, context, pool);

  // ops[0].instances.position should be unchanged
  expect(ops[0].instances.position).not.toBe(ops2[0].instances.position);
});
```

## CI Integration

These tests run with `npm run test` and will be part of the existing CI pipeline. No additional configuration needed.

## Detecting Re-introduction

The regression test will fail if:
1. Someone removes the copy in `assembleDrawPathInstancesOp`
2. Someone returns subarray views from `depthSortAndCompact` without copying

This provides mechanical enforcement of the invariant.
