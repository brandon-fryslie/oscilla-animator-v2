# Project Instances Helper - Planning Documents

**Initiative:** Extract projectInstances + depthSortAndCompact pattern into reusable helpers  
**Date:** 2026-01-27  
**Status:** Ready to Implement  
**Scale:** Single Sprint (2-4 hours)

---

## Quick Start

**Read in this order:**
1. `EVALUATION-20260127-122400.md` - Detailed analysis of duplication (optional background)
2. `PLAN-project-instances-helper-20260127-053012.md` - Sprint plan with work items
3. `DOD-project-instances-helper-20260127-053012.md` - Acceptance criteria
4. `CONTEXT-project-instances-helper-20260127-053012.md` - Implementation details (code snippets, line numbers)

---

## Executive Summary

### Problem
The `projectInstances() → depthSortAndCompact() → copy buffers` pattern is repeated at 2 production sites in RenderAssembler.ts. Each site has 8-10 lines of identical copy logic. Forgetting to copy causes memory corruption (pooled buffer reuse).

### Solution
Extract into two reusable helpers:
1. **`projectAndCompact()`** - Full pipeline for single-group case
2. **`compactAndCopy()`** - Compact + copy only, for multi-group case

Both helpers auto-copy to enforce memory safety.

### Benefits
- Eliminates code duplication (reduces 16+ lines to 2 calls)
- Enforces memory safety (auto-copy prevents corruption)
- Provides clear, high-level API for common operations
- Reduces maintenance burden for future changes

---

## Work Items

- **P0:** Create `projectAndCompact()` helper (45 min)
- **P1:** Create `compactAndCopy()` helper (30 min)
- **P2:** Refactor `assembleDrawPathInstancesOp` (30 min)
- **P3:** Refactor `assemblePerInstanceShapes` (45 min)
- **P4:** Update exports in `src/runtime/index.ts` (15 min)
- **P5:** Verify tests + add coverage (30 min)

**Total estimate:** 2-4 hours

---

## Key Decisions

1. **Two helpers (not one):** Single-group and multi-group paths have different execution models
2. **Auto-copy (owned buffers):** Eliminates common error (forgetting to copy)
3. **Export both (public API):** Useful for other rendering backends and tests
4. **Keep original functions:** Non-breaking change (additive only)

---

## Risk Assessment

**Risk Level:** Low

- Changes are localized to RenderAssembler.ts
- Copy logic is identical to existing code (zero functional changes)
- Existing tests verify correctness (no test modifications needed)
- Easy rollback (revert call site changes, keep helpers as internal)

---

## Files to Modify

- `src/runtime/RenderAssembler.ts` - Add helpers, refactor 2 call sites
- `src/runtime/index.ts` - Export helpers

---

## Success Criteria

- [ ] Both helpers implemented and exported
- [ ] Both call sites refactored
- [ ] All tests pass (`npm run test`)
- [ ] Type checking passes (`npm run typecheck`)
- [ ] No visual regressions in rendering
- [ ] Code review approved

---

## Related Documents

- **Spec reference:** `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md`
- **Architectural principles:** `.claude/CLAUDE.md` (SINGLE ENFORCER, ONE SOURCE OF TRUTH)
- **Runtime system:** `src/runtime/README.md`

---

## Questions?

See `CONTEXT-project-instances-helper-20260127-053012.md` for detailed implementation guidance, code snippets, and line-by-line refactoring instructions.
