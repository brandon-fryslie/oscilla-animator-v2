# Index: Compilation Pipeline Cleanup Planning

**Issue:** oscilla-animator-v2-k0v
**Epic:** Phase 1 Unified Plan (P3)
**Status:** PLANNING COMPLETE → Ready for Implementation
**Date:** 2026-01-19

---

## Quick Summary

The beads issue "Passes 5-10" is a **miscount** - there are only **8 compilation passes**, and **all are fully implemented and working**. The remaining work is minor code cleanup:

1. Remove 4 unused state API stubs (old APIs replaced by working state slot system)
2. Document Pass 8 decision (exists but not needed, Pass 6 handles everything)
3. Resolve seed management TODO (document or implement)

**Estimated Effort:** 1.5 hours
**Test Status:** 372 passing, 0 failures
**Blockers:** None

---

## Planning Documents

### Core Planning (in priority order)
1. **[CONTEXT-20260119.md](./CONTEXT-20260119.md)** - Start here for background
   - Current state (all 8 passes implemented)
   - What remains (cleanup only)
   - Investigation findings

2. **[PLAN-20260119.md](./PLAN-20260119.md)** - Step-by-step implementation
   - Task 1: Document Pass 8 (30 min)
   - Task 2: Remove unused APIs (45 min)
   - Task 3: Resolve seed TODO (15 min)
   - Task 4: Update beads issue (10 min)

3. **[DOD-20260119.md](./DOD-20260119.md)** - Acceptance criteria
   - Functional criteria
   - Technical criteria
   - Documentation criteria
   - Verification commands

---

## Key Findings from Investigation

### Discovery #1: "Passes 5-10" is a Miscount
- There are only **8 passes** total (not 10)
- All 8 are implemented:
  1. Normalization
  2. Type Graph
  3. Time Topology
  4. Dependency Graph
  5. SCC Validation
  6. Block Lowering
  7. Schedule Construction
  8. Link Resolution (exists but not used)

### Discovery #2: State APIs Are NOT Stubs
- **Working APIs:** allocStateSlot(), sigStateRead(), stepStateWrite()
- **Used by:** UnitDelay (12 tests passing), Hash
- **Unused stubs:** declareState, readState, writeState, getTimepointMarkers
- **Action:** Remove unused stubs to eliminate confusion

### Discovery #3: Pass 8 Exists But Isn't Used
- Pass 8 implementation exists (657 lines, fully coded)
- BUT not exported or called
- Reason: Pass 6 handles all input resolution
- Action: Keep as reference, document why not used

---

## Implementation Checklist

### Pre-Implementation
- [x] Investigation complete (Plan agent)
- [x] Planning documents created
- [x] Current state verified (372 tests passing)
- [ ] Ready to start implementation

### Task 1: Document Pass 8
- [ ] Update index.ts export comment
- [ ] Add header comment to pass8-link-resolution.ts
- [ ] Verify TypeScript compiles
- [ ] Commit changes

### Task 2: Remove Unused APIs
- [ ] Grep verify no usage
- [ ] Remove from IRBuilder interface
- [ ] Remove from IRBuilderImpl implementation
- [ ] Run tests (expect 372 passing)
- [ ] Commit changes

### Task 3: Resolve Seed TODO
- [ ] Investigate seed usage
- [ ] Choose approach (implement, document, or defer)
- [ ] Update code/comments
- [ ] Verify randomId tests pass
- [ ] Commit changes

### Task 4: Update Issue
- [ ] Update beads description
- [ ] Close issue after verification

---

## File Locations

### Files to Modify (5 files)
1. `src/compiler/passes-v2/index.ts` (line 40-41: update comment)
2. `src/compiler/passes-v2/pass8-link-resolution.ts` (line 1-20: add header)
3. `src/compiler/ir/IRBuilder.ts` (remove 4 method signatures)
4. `src/compiler/ir/IRBuilderImpl.ts` (lines 642-666: remove 4 implementations)
5. `src/compiler/passes-v2/pass6-block-lowering.ts` (line 368: resolve TODO)

### Files to Reference (read only)
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md` - Spec
- `src/compiler/compile.ts` - Pipeline orchestration
- `src/blocks/state-blocks.ts` - UnitDelay, Hash implementations
- `src/runtime/Materializer.ts` - How randomId uses seed

---

## Timeline Estimate

```
Task 1: Document Pass 8        → 30 min
Task 2: Remove unused APIs      → 45 min
Task 3: Resolve seed TODO       → 15 min
Task 4: Update beads issue      → 10 min
                        Total:    1.5 hours
```

---

## Verification Strategy

**Before changes:**
```bash
npm test  # Baseline: 372 passing, 4 skipped, 0 failures
```

**After each task:**
```bash
npm run typecheck  # Must pass
npm test           # Must show same results
git diff           # Review changes
```

**Final verification:**
```bash
npm run build      # Must succeed
npm test           # Must show 372 passing, 0 failures
```

---

## Success Criteria

**Complete when ALL true:**
- ✅ No unused code in IRBuilder
- ✅ Pass 8 decision documented
- ✅ All TODOs resolved
- ✅ 372 tests passing
- ✅ Beads issue closed

---

## Related Work

### Completed Dependencies
- ✅ Domain Unification (2026-01-09)
- ✅ Graph Normalization Adapters (2026-01-12)
- ✅ Domain→Instance Migration (2026-01-19)

### Follow-Up Work (separate tasks)
- 📋 Primitives Catalog (Lag, Phasor, SampleAndHold)
- 📋 Type System (oscilla-animator-v2-jon)
- 📋 Time Model (oscilla-animator-v2-1ex)

---

## Navigation

**Up:** `.agent_planning/` (all planning)
**Roadmap:** `.agent_planning/ROADMAP.md` (lines 74-84)
**Spec:** `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md`
**Code:** `src/compiler/passes-v2/` (compilation passes)
**Tests:** `src/compiler/__tests__/` (integration tests)

---

## Document Status

| Document | Status | Last Updated |
|----------|--------|--------------|
| INDEX.md | ✅ Current | 2026-01-19 |
| CONTEXT-20260119.md | ✅ Current | 2026-01-19 |
| PLAN-20260119.md | ✅ Current | 2026-01-19 |
| DOD-20260119.md | ✅ Current | 2026-01-19 |
| COMPLETION-20260119.md | ❌ Not Created | Pending |

---

## Notes for Implementer

**Key insight:** This is **not** a big implementation task. All 8 passes work correctly. This is code hygiene - removing dead code and clarifying documentation.

**Don't overthink it:** The investigation is done. Just follow the plan step by step.

**If stuck:** Re-read CONTEXT.md for background, check DOD.md for what "done" looks like.

**Test confidence:** With 372 passing tests and zero failures, you have comprehensive verification that nothing breaks.

---

## Quick Start

1. **Read:** CONTEXT-20260119.md (understand current state)
2. **Follow:** PLAN-20260119.md task 1 (start with documentation)
3. **Check:** DOD-20260119.md (verify each criterion)
4. **Complete:** Update this INDEX with completion date

**Expected outcome:** Clean codebase, no confusion about "stub APIs" or "missing passes."
