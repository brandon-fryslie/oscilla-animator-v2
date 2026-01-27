# Definition of Done: Extract projectInstances + depthSortAndCompact Pattern

**Date:** 2026-01-27 05:30:12  
**Sprint:** Single Sprint  
**Related Plan:** `PLAN-project-instances-helper-20260127-053012.md`

---

## Acceptance Criteria

### 1. Code Quality

- [ ] **P0: `projectAndCompact()` helper exists**
  - Function is defined in `src/runtime/RenderAssembler.ts`
  - Signature matches spec (evaluation section 7.2)
  - Auto-copies all buffers (screenPosition, screenRadius, depth, color, rotation?, scale2?)
  - Returns owned copies (caller can store safely)
  - Handles optional `rotation` and `scale2` correctly
  - Preserves `pool` parameter

- [ ] **P1: `compactAndCopy()` helper exists**
  - Function is defined in `src/runtime/RenderAssembler.ts`
  - Takes `ProjectionOutput` + count + color + optional rotation/scale2
  - Auto-copies all buffers
  - Returns same structure as `projectAndCompact()`

- [ ] **P2: Single-group call site refactored**
  - `assembleDrawPathInstancesOp` (lines 1200-1218) uses `projectAndCompact()`
  - Manual projection + compact + copy block is removed
  - Function behavior is identical to before

- [ ] **P3: Multi-group call site refactored**
  - `assemblePerInstanceShapes` (lines 826-846) uses `compactAndCopy()`
  - Manual compact + copy block is removed
  - Projection logic (lines 780, 803-823) remains unchanged
  - Function behavior is identical to before

- [ ] **P4: Exports are updated**
  - `projectAndCompact` is exported from `src/runtime/index.ts`
  - `compactAndCopy` is exported from `src/runtime/index.ts`
  - No breaking changes to existing exports

---

### 2. Documentation

- [ ] **`projectAndCompact()` has comprehensive JSDoc**
  - Explains what the function does (high-level API for project → compact → copy)
  - Documents all parameters with types and descriptions
  - Explains memory contract: returns OWNED copies (safe for storage)
  - Notes when to use this vs. low-level functions
  - Example:
    ```typescript
    /**
     * Project world-space instances and depth-sort/compact in one step.
     *
     * This is the high-level API combining projectInstances() + depthSortAndCompact().
     * Returns OWNED copies of all buffers (safe for persistent storage).
     *
     * Preferred over manual projection + compaction for typical rendering use.
     *
     * @param worldPositions - World-space positions (vec3 stride, READ-ONLY)
     * @param worldRadius - Uniform world-space radius
     * @param count - Instance count
     * @param color - Per-instance RGBA colors
     * @param camera - Resolved camera parameters (determines projection mode)
     * @param rotation - Optional per-instance rotations (will be copied)
     * @param scale2 - Optional per-instance anisotropic scale (will be copied)
     * @param pool - Buffer pool for intermediate allocation (optional)
     * @returns All buffers as OWNED copies (safe for immediate storage in DrawOp)
     */
    ```

- [ ] **`compactAndCopy()` has comprehensive JSDoc**
  - Explains use case (for multi-group path where projection already done)
  - Documents all parameters
  - Explains memory contract (returns OWNED copies)
  - Notes when to use this vs. `projectAndCompact()`

- [ ] **Low-level functions have updated JSDoc (if needed)**
  - `projectInstances()` notes that high-level helper exists
  - `depthSortAndCompact()` notes that high-level helper exists
  - Memory contract warnings remain in place

---

### 3. Testing

- [ ] **All existing tests pass**
  - Run `npm run test` → all tests green
  - No new failures or warnings
  - Existing integration tests verify correctness

- [ ] **Type checking passes**
  - Run `npm run typecheck` → no errors
  - Helper signatures are type-safe
  - Call sites type-check correctly

- [ ] **(Optional) Direct test for `projectAndCompact()` added**
  - Add test in `level7-depth-culling.test.ts` or similar
  - Verifies helper returns correct structure
  - Verifies buffers are owned copies

---

### 4. Behavior Verification

- [ ] **Single-group rendering is identical**
  - Visual inspection: uniform shapes render correctly
  - No regressions in depth sorting
  - No visual artifacts or glitches

- [ ] **Multi-group rendering is identical**
  - Visual inspection: per-instance topologies render correctly
  - No regressions in group-level compaction
  - No visual artifacts or glitches

- [ ] **Memory safety is preserved**
  - No buffer corruption across frames
  - DrawOps contain owned copies (not views into pooled buffers)
  - No memory leaks introduced

---

### 5. Code Review

- [ ] **Copy logic is identical to original**
  - Helper copy blocks match lines 1210-1218 and 838-846 exactly
  - All buffer types copied correctly (Float32Array, Uint8ClampedArray)
  - Optional `rotation` and `scale2` handled correctly (conditional copy)

- [ ] **No functional changes**
  - Refactoring is pure code reorganization
  - Behavior is byte-for-byte identical
  - No performance regressions

- [ ] **Follows architectural principles**
  - **SINGLE ENFORCER**: Memory contract enforced at helper boundary
  - **ONE SOURCE OF TRUTH**: Copy logic in one place (helpers), not duplicated
  - No violations of one-way dependencies
  - No shared mutable globals introduced

---

### 6. Performance

- [ ] **No measurable performance regression**
  - Frame time is unchanged (helpers add no overhead)
  - Allocation count is unchanged (existing code already copies)
  - No new GC pressure

- [ ] **Memory usage is stable**
  - No leaks introduced
  - Buffer pool behavior unchanged
  - Module-level pooled buffers still reused correctly

---

### 7. Public API

- [ ] **Helpers are exported correctly**
  - Can import `{ projectAndCompact, compactAndCopy }` from `@/runtime`
  - Type definitions are exported
  - No breaking changes to existing API

- [ ] **Low-level functions remain available**
  - `projectInstances()` still exported
  - `depthSortAndCompact()` still exported
  - Tests and advanced use cases can use low-level API

---

## Verification Checklist

### Before Merge

- [ ] Run full test suite: `npm run test`
- [ ] Run type checker: `npm run typecheck`
- [ ] Visual inspection: Start dev server, verify rendering
- [ ] Code review: Verify copy logic is identical
- [ ] Memory profiler: No leaks or unusual allocations (optional)

### After Merge

- [ ] Monitor for regressions in next session
- [ ] Verify no issues reported by users
- [ ] Mark related technical debt as resolved (if tracked)

---

## Success Metrics

**Quantitative:**
- Lines of code reduced: ~16 lines (8 per call site, 2 call sites)
- Net LOC change: ~+80 (helpers) - 16 (call sites) = **+64 LOC** (acceptable for abstraction)
- Test coverage: Unchanged (existing tests verify correctness)
- Performance: Unchanged (zero net overhead)

**Qualitative:**
- Code is more maintainable (single copy block vs. duplicated)
- Memory safety is improved (auto-copy prevents common error)
- API is clearer (high-level vs. low-level distinction)
- Future changes are easier (rotation/scale2 additions, etc.)

---

## Rollback Criteria

**Rollback immediately if:**
- Any test fails after refactor
- Visual regressions detected
- Memory corruption or leaks observed
- Performance regression >5% detected

**Rollback process:**
1. Revert commits for P2, P3, P4
2. Keep helpers (P0, P1) but mark as `@internal`
3. File bug report with details
4. Debug before re-attempting

---

## Related Documents

- **Plan:** `.agent_planning/project-instances-helper/PLAN-project-instances-helper-20260127-053012.md`
- **Evaluation:** `.agent_planning/project-instances-helper/EVALUATION-20260127-122400.md`
- **Context:** `.agent_planning/project-instances-helper/CONTEXT-project-instances-helper-20260127-053012.md`

---

## Notes

- This is a **refactoring** (no functional changes)
- **Risk is low** (changes are localized, tests verify correctness)
- Focus on **memory safety** and **maintainability**
- No breaking changes to public API (additive only)
