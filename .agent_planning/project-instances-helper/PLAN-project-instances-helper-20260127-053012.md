# Implementation Plan: Extract projectInstances + depthSortAndCompact Pattern

**Date:** 2026-01-27 05:30:12  
**Status:** Ready to Implement  
**Scale:** Single Sprint (1-2 sessions)  
**Priority:** P2 (Code Quality / Refactoring)  
**Risk Level:** Low  

---

## Executive Summary

Extract the repeated `projectInstances() → depthSortAndCompact() → copy buffers` pattern into reusable helper functions. This refactoring improves code quality, memory safety, and maintainability by consolidating duplicate logic and making memory ownership explicit.

**Key benefits:**
- Eliminates 8-10 lines of duplicated copy logic at each call site
- Enforces memory safety (auto-copy prevents pooled buffer corruption)
- Provides clear, high-level API for common rendering operations
- Reduces maintenance burden for future changes (rotation/scale2 additions, etc.)

**Scope:**
- **Helper #1**: `projectAndCompact()` - Full pipeline (project → compact → copy) for single-group case
- **Helper #2**: `compactAndCopy()` - Compact + copy only, for multi-group case
- Refactor 2 production call sites in RenderAssembler.ts
- Export both helpers from `src/runtime/index.ts`

---

## Sprint Structure

**Single sprint** - All work items are cohesive and should be completed together.

**Estimated effort:** 2-4 hours
- P0: Create `projectAndCompact()` helper (45 min)
- P1: Create `compactAndCopy()` helper (30 min)
- P2: Refactor single-group call site (30 min)
- P3: Refactor multi-group call site (45 min)
- P4: Update exports (15 min)
- P5: Verify tests + add coverage (30 min)

---

## Work Items

### P0: Create `projectAndCompact()` helper
**Owner:** TBD  
**Estimate:** 45 minutes  
**Dependencies:** None  

**Description:**
Create a helper function that combines the full pipeline: `projectInstances()` → `depthSortAndCompact()` → copy all buffers. This is the high-level API for the single-group path (uniform shapes).

**Acceptance criteria:**
- Function signature matches evaluation spec (section 7.2)
- Auto-copies all buffers (screenPosition, screenRadius, depth, color, rotation?, scale2?)
- Returns owned copies (safe for storage in DrawOp)
- Includes comprehensive JSDoc explaining memory contract
- Handles optional `rotation` and `scale2` parameters correctly
- Preserves `pool` parameter for memory management control

**Implementation notes:**
- Insert after `depthSortAndCompact()` definition (~line 283 in RenderAssembler.ts)
- Use exact copy logic from existing call sites (lines 1210-1218)
- Mark as `export` (per user decision)

**Verification:**
- TypeScript compiles without errors
- Function signature matches documented contract
- JSDoc is clear and complete

---

### P1: Create `compactAndCopy()` helper
**Owner:** TBD  
**Estimate:** 30 minutes  
**Dependencies:** None  

**Description:**
Create a helper function that wraps `depthSortAndCompact()` + copy logic. This is for the multi-group path where projection has already been done and we just need to compact + copy per-group.

**Acceptance criteria:**
- Takes `ProjectionOutput` + count + color + optional rotation/scale2
- Calls `depthSortAndCompact()` 
- Auto-copies all returned buffers
- Returns same structure as `projectAndCompact()` (owned copies)
- Includes JSDoc explaining when to use this vs. `projectAndCompact()`

**Implementation notes:**
- Insert after `projectAndCompact()` definition
- Signature: `compactAndCopy(projection: ProjectionOutput, count: number, color: Uint8ClampedArray, rotation?: Float32Array, scale2?: Float32Array)`
- Use identical copy logic from existing multi-group path (lines 838-846)

**Verification:**
- TypeScript compiles without errors
- Function signature is clear and minimal
- JSDoc explains use case (multi-group path)

---

### P2: Refactor `assembleDrawPathInstancesOp` to use `projectAndCompact()`
**Owner:** TBD  
**Estimate:** 30 minutes  
**Dependencies:** P0  

**Description:**
Replace lines 1200-1218 in `assembleDrawPathInstancesOp` with a single call to `projectAndCompact()`. This is the single-group path (uniform shapes).

**Acceptance criteria:**
- Replace 3-step pattern (project, compact, copy) with single helper call
- Pass all parameters correctly (positionBuffer, scale, count, colorBuffer, camera, rotation, scale2, pool)
- Remove the manual copy block (lines 1210-1218)
- Verify tests pass (level6/7/9)
- No functional changes (behavior identical)

**Implementation notes:**
- Before:
  ```typescript
  const projection = projectInstances(positionBuffer, scale, count, context.resolvedCamera, pool);
  const compacted = depthSortAndCompact(projection, count, colorBuffer, rotation, scale2);
  const compactedCopy = { /* 8 lines of copy logic */ };
  ```
- After:
  ```typescript
  const compactedCopy = projectAndCompact(
    positionBuffer, scale, count, colorBuffer, context.resolvedCamera, rotation, scale2, pool
  );
  ```

**Verification:**
- `npm run test` passes (all tests)
- `npm run typecheck` passes
- Visual inspection: DrawOp rendering is identical

---

### P3: Refactor `assemblePerInstanceShapes` to use `compactAndCopy()`
**Owner:** TBD  
**Estimate:** 45 minutes  
**Dependencies:** P1  

**Description:**
Replace lines 826-846 in `assemblePerInstanceShapes` with a call to `compactAndCopy()`. This is the multi-group path where projection happens once, then compaction per-group.

**Acceptance criteria:**
- Replace `depthSortAndCompact()` + copy block with single helper call
- Preserve existing projection logic (lines 780, 803-823 remain unchanged)
- Pass groupProjection, count, color, rotation?, scale2? to helper
- Remove manual copy block (lines 838-846)
- Verify tests pass

**Implementation notes:**
- Before:
  ```typescript
  const compacted = depthSortAndCompact(groupProjection, group.instanceIndices.length, color, rotation, scale2);
  const compactedCopy = { /* 8 lines of copy logic */ };
  ```
- After:
  ```typescript
  const compactedCopy = compactAndCopy(groupProjection, group.instanceIndices.length, color, rotation, scale2);
  ```

**Verification:**
- `npm run test` passes
- `npm run typecheck` passes
- Visual inspection: Multi-topology rendering is identical

---

### P4: Update exports in `src/runtime/index.ts`
**Owner:** TBD  
**Estimate:** 15 minutes  
**Dependencies:** P0, P1  

**Description:**
Export both new helpers from the public runtime API. Add type exports if needed.

**Acceptance criteria:**
- `projectAndCompact` is exported
- `compactAndCopy` is exported
- Existing exports remain unchanged
- No breaking changes to public API

**Implementation notes:**
- Add to `src/runtime/index.ts`:
  ```typescript
  export { projectAndCompact, compactAndCopy } from './RenderAssembler';
  ```
- Verify `src/index.ts` re-exports runtime (if applicable)

**Verification:**
- TypeScript compiles without errors
- Imports from `@/runtime` work correctly
- No circular dependency warnings

---

### P5: Verify tests + add coverage (optional)
**Owner:** TBD  
**Estimate:** 30 minutes  
**Dependencies:** P2, P3, P4  

**Description:**
Run full test suite to verify no regressions. Optionally add a direct test for `projectAndCompact()` helper in level7 tests.

**Acceptance criteria:**
- All existing tests pass (`npm run test`)
- No new warnings or errors
- Type checking passes (`npm run typecheck`)
- (Optional) Add test in `level7-depth-culling.test.ts` that uses `projectAndCompact()` directly

**Implementation notes:**
- Run: `npm run test`
- Run: `npm run typecheck`
- Optional: Add test case in level7 that calls `projectAndCompact()` and verifies output

**Verification:**
- Test suite is green
- No regressions in rendering behavior
- Coverage for new helpers is adequate (via existing integration tests)

---

## Design Decisions

### Decision 1: Two Helpers (not one)

**Rationale:** The single-group and multi-group paths have different execution models:
- **Single-group**: Projects once, compacts once → `projectAndCompact()` wraps full pipeline
- **Multi-group**: Projects once for full batch, then compacts per-group in loop → `compactAndCopy()` just wraps compact + copy

Attempting to use a single helper would force restructuring the multi-group path (project per-group instead of once), which changes execution model and may impact performance.

**Verdict:** Create two helpers with clear, distinct use cases.

---

### Decision 2: Auto-copy (owned buffers)

**Rationale:** Current code ALWAYS copies after `depthSortAndCompact()` because it returns views into pooled buffers. Forgetting to copy is a subtle bug that corrupts data on next frame.

By making copy automatic, we:
- Eliminate common error (forgetting to copy)
- Provide clear ownership semantics (returned buffers are owned by caller)
- Simplify call sites (1 call instead of 3)

**Trade-off:** Adds allocation overhead (6 typed arrays per call), but existing code already copies, so net performance impact is zero.

**Verdict:** Auto-copy is the right default. Helpers return owned buffers.

---

### Decision 3: Export both helpers (public API)

**Rationale:** User decision was to export. Benefits:
- Other rendering backends can use these helpers
- Tests can import and use directly
- Signals "recommended API" vs. low-level primitives

**Trade-off:** Commits to memory contract (auto-copy is now API contract). This is acceptable because it's the safe default.

**Verdict:** Export both `projectAndCompact()` and `compactAndCopy()` from `src/runtime/index.ts`.

---

### Decision 4: Keep original functions exported

**Rationale:** Original `projectInstances()` and `depthSortAndCompact()` remain exported for:
- Tests that want low-level control
- Advanced use cases (e.g., projection without compaction)
- Backward compatibility

This is an **additive change**, not a breaking change.

**Verdict:** Keep both low-level and high-level APIs available. Document when to use each.

---

## Memory Contract Documentation

### `projectAndCompact()` Contract

**Returns:** OWNED copies of all buffers (safe for persistent storage)

**Memory lifecycle:**
1. Calls `projectInstances()` → allocates from pool (or direct if no pool)
2. Calls `depthSortAndCompact()` → returns views into module-level pooled buffers
3. **Copies all views** → caller receives owned buffers
4. Pooled buffers may be reused on next call (safe because we copied)

**Caller responsibility:** None. Returned buffers are owned by caller.

---

### `compactAndCopy()` Contract

**Returns:** OWNED copies of all buffers (safe for persistent storage)

**Memory lifecycle:**
1. Takes `ProjectionOutput` (already allocated by caller)
2. Calls `depthSortAndCompact()` → returns views into module-level pooled buffers
3. **Copies all views** → caller receives owned buffers
4. Pooled buffers may be reused on next call (safe because we copied)

**Caller responsibility:** Caller must provide valid `ProjectionOutput` (from prior call to `projectInstances()`).

---

## Testing Strategy

### Integration Tests (Existing)

**Coverage:** Existing tests in `level6-mode-toggle.test.ts`, `level7-depth-culling.test.ts`, and `level9-continuity-decoupling.test.ts` already exercise projection + compaction.

**Approach:** If refactoring is correct, existing tests will pass without modification.

**Verification:**
- Run `npm run test` after each work item (P2, P3, P4)
- Verify no regressions

---

### Unit Test (Optional - P5)

**Test case:** Add test in `level7-depth-culling.test.ts` that directly calls `projectAndCompact()` and verifies output.

**Example:**
```typescript
it('projectAndCompact returns owned copies', () => {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
  const color = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
  const result = projectAndCompact(positions, 0.05, 2, color, orthoCam);
  
  expect(result.count).toBe(2);
  expect(result.screenPosition).toBeInstanceOf(Float32Array);
  // Verify buffers are OWNED (not views)
  // (Hard to test directly, but can verify structure)
});
```

**Priority:** Low (integration tests provide adequate coverage)

---

## Rollback Plan

**If tests fail or regressions are found:**

1. **Revert work items P2-P4** (restore original call sites)
2. **Keep helpers in place** (P0, P1) but mark as `@internal`
3. **Debug issue** before attempting refactor again

**Rollback cost:** Low (changes are localized to RenderAssembler.ts + exports)

**Mitigation:** Test after each work item (P2, P3) to catch issues early

---

## Success Criteria

**Sprint complete when:**
- [ ] Both helpers (`projectAndCompact`, `compactAndCopy`) are implemented and exported
- [ ] Both production call sites are refactored to use helpers
- [ ] All tests pass (`npm run test`)
- [ ] Type checking passes (`npm run typecheck`)
- [ ] No regressions in rendering behavior
- [ ] Code review approved (verify copy logic is identical)

**Definition of Done:** See `DOD-project-instances-helper-20260127-053012.md`

---

## Related Documents

- **Evaluation:** `.agent_planning/project-instances-helper/EVALUATION-20260127-122400.md`
- **Context:** `.agent_planning/project-instances-helper/CONTEXT-project-instances-helper-20260127-053012.md`
- **Definition of Done:** `.agent_planning/project-instances-helper/DOD-project-instances-helper-20260127-053012.md`

---

## Notes

- This is a **quality-of-life refactoring**, not a functional change
- **Risk is low** because copy logic is identical to existing code
- **Net performance impact is zero** (existing code already copies)
- Refactoring improves **memory safety** and **maintainability**
- Follows **SINGLE ENFORCER** principle: memory contract is enforced at helper boundary
