# Evaluation: Domain Transformation System (Adapters/Lenses)

**Date**: 2026-02-02
**Epic**: oscilla-animator-v2-8m2
**Verdict**: CONTINUE

## Current State

### Completed Work
| Sprint | Status | Evidence |
|--------|--------|----------|
| Sprint 1: Data Model & Addressing | COMPLETE | LensAttachment type, InputPort.lenses, LensAddress all implemented |
| Sprint 2: Normalization Pass | COMPLETE | pass2-adapters refactored to Phase 1 (expandExplicitLenses) + Phase 2 (autoInsertAdapters) |
| AdapterSpec restructure (vqkj) | COMPLETE | AdapterSpec lives on BlockDef, old adapters.ts deleted |

### Sprint 3 Implementation (Partially Done)
Sprint 3 (oscilla-animator-v2-lrc) is marked in_progress. The evaluator found substantial implementation already exists:
- PatchStore lens CRUD methods exist
- Context menus partially wired
- Port info popover has lens section
- lensUtils.ts exists with helper functions
- Amber visual indicator on ports

### Beads Status Discrepancy
- oscilla-animator-v2-mtc (Sprint 2) is still marked `in_progress` but work appears complete (all tests pass)
- oscilla-animator-v2-lrc (Sprint 3) is `in_progress` — partially implemented

## Critical Gaps Found

### 1. Phase 1 (expandExplicitLenses) — ZERO test coverage
All 9 tests in pass2-adapters.test.ts only test Phase 2 (auto-insertion). No test ever creates a Patch with InputPort.lenses populated and verifies expansion. **The core lens feature path is unverified.**

### 2. Doc comment contradiction in normalize-adapters.ts
Header says Phase 2 is "Type Validation" with "no auto-fix" but actual Phase 2 is autoInsertAdapters() which does insert. Misleading.

### 3. Debug console.log in production
lensUtils.ts:111,119,128 has leftover console.log statements.

### 4. Broken diagnostic action
actionExecutor.ts:229 — "Add Adapter" creates orphan block (TODO for edge rewiring).

### 5. typesMatch() too shallow
lensUtils.ts:85-96 — only checks payload.kind and unit.kind, so angle{radians} matches angle{degrees}. Incorrect lens suggestions in menus.

### 6. JSON.stringify for structural comparison
adapter-spec.ts:139,191 — fragile if property ordering varies.

## Remaining Work

### What's left for Sprint 3 completion:
- Fix critical gaps 1-5 above
- Verify all DoD criteria from SPRINT3-EDITOR-INTEGRATION-DOD.md
- Close stale beads

### Sprint 4: UI Visualization (PLANNED)
- AdapterIndicator component on edges
- Edge styling for lensed connections

### Sprint 5: Context Menu & Editing (MERGED into Sprint 3)
- Already partially in Sprint 3 scope

## Recommendations

1. **Clean up Sprint 3**: Fix gaps, add Phase 1 tests, close stale beads
2. **Update planning docs**: STATUS.md is stale
3. **Sprint 4 may be optional**: Core functionality works without edge indicators
