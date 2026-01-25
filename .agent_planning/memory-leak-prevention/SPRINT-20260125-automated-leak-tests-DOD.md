# Definition of Done: automated-leak-tests

**Sprint:** CI-Enforced Memory Discipline
**Generated:** 2026-01-25

## Completion Criteria

### P0: Pool Balance Test

- [ ] Test file exists: `src/runtime/__tests__/BufferPool.test.ts`
- [ ] Test verifies allocs === releases after each frame
- [ ] Test passes in CI

**Verification:** `npm run test -- BufferPool` passes

### P1: Heap Stability Test

- [ ] Test runs 100+ frames
- [ ] Asserts pool size stabilizes (no unbounded growth)
- [ ] Test passes in CI

**Verification:** `npm run test` passes; test output shows stable metrics

### P2: Topology Group Regression Test

- [ ] Test exercises assemblePerInstanceShapes directly
- [ ] Test poisons pooled buffers after assembly
- [ ] Test asserts DrawOp data is independent

**Verification:** Test catches the original bug if re-introduced

## Testing Checklist

- [ ] All new tests pass locally
- [ ] All new tests pass in CI
- [ ] No flaky failures over 10 runs
- [ ] Tests document what they verify

## Exit Criteria Met When

P0 complete, P1 or P2 complete. Both P1 and P2 preferred but one is acceptable for MVP.
