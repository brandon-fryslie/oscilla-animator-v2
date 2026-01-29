# Sprint: automated-leak-tests - CI-Enforced Memory Discipline

**Generated:** 2026-01-25
**Confidence:** HIGH: 1, MEDIUM: 2, LOW: 0
**Status:** PARTIALLY READY

## Sprint Goal

Add automated tests that detect memory leaks, ensuring they can't regress undetected.

## Scope

**Deliverables:**
- P0: Pool balance assertion test (HIGH)
- P1: Multi-frame heap stability test (MEDIUM)
- P2: Per-topology-group leak regression test (MEDIUM)

## Work Items

### P0: Pool Balance Assertion Test (HIGH)

**Acceptance Criteria:**
- [ ] Test runs 10 frames of animation
- [ ] After each frame, asserts `pool.allocs === pool.releases` (from Sprint 2 metrics)
- [ ] Test fails if any imbalance detected

**Technical Notes:**
- Location: `src/runtime/__tests__/BufferPool.test.ts` (new file)
- Use existing test infrastructure
- Mock or use real program IR

**Implementation Sketch:**
```typescript
describe('BufferPool memory discipline', () => {
  it('should balance allocs and releases each frame', () => {
    const pool = new BufferPool();

    for (let frame = 0; frame < 10; frame++) {
      // Simulate frame allocations
      pool.alloc('f32', 100);
      pool.alloc('vec2f32', 100);
      pool.alloc('rgba8', 100);

      // Simulate frame end
      pool.releaseAll();

      const stats = pool.getFrameStats();
      expect(stats.allocs).toBe(stats.releases);
    }
  });
});
```

### P1: Multi-Frame Heap Stability Test (MEDIUM)

**Acceptance Criteria:**
- [ ] Test runs 100+ frames
- [ ] Pool byte size at frame 100 ≈ frame 10 (within 10% tolerance)
- [ ] Catches unbounded growth

**Technical Notes:**
- Run real executeFrame with test patch
- Measure pooled bytes at intervals
- Allow initial ramp-up, then assert stability

#### Unknowns to Resolve
- What test patch exercises all code paths?
- How to measure JS heap (not just pool)?
- Is 100 frames enough to detect slow leaks?

#### Exit Criteria
- Test exists and runs in CI
- Catches the depthSortAndCompact leak if re-introduced

### P2: Topology Group Leak Regression Test (MEDIUM)

**Acceptance Criteria:**
- [ ] Test specifically exercises per-instance shapes path
- [ ] Verifies buffers in DrawOp are independent of pooled storage
- [ ] Fails if subarray views are returned without copy

**Technical Notes:**
- Call `assemblePerInstanceShapes` directly
- Modify pooled buffer after call
- Assert DrawOp data is unchanged

**Implementation Sketch:**
```typescript
it('should not retain pooled buffer views in DrawOp', () => {
  // Setup: create shapes, positions, colors
  const ops = assemblePerInstanceShapes(...);

  // After assembly, poison the pooled buffers
  ensureBufferCapacity(1000);
  pooledScreenPos.fill(NaN);

  // DrawOp data should be unaffected (was copied)
  for (const op of ops) {
    const pos = op.instances.position;
    expect(pos.some(v => Number.isNaN(v))).toBe(false);
  }
});
```

## Dependencies

- Sprint 2 (memory-instrumentation) for `getFrameStats()` API

## Risks

- **Risk:** Tests are flaky due to GC timing
  - **Mitigation:** Test pool-level metrics, not JS heap
  - **Fallback:** Use deterministic allocation counts
