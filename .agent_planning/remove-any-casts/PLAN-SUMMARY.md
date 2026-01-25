# Plan Summary: Remove 'as any' Casts from Test Files

**Generated:** 2026-01-25T13:20:00Z
**Status:** Ready for Approval
**Total Sprints:** 6
**Total Scope:** ~210 'as any' casts across test files

## Executive Summary

This plan breaks down the removal of ~210 'as any' type casts from test files into 6 focused sprints. Each sprint targets a specific category with different challenges and approaches. All sprints are independent and can be executed in parallel or sequentially.

**Estimated Total Effort:** ~2.5 hours
**Risk Level:** Low (mostly mechanical replacements)
**Production Code Changes:** None required - all fixes stay in test files

## Sprint Overview

| Sprint | Category | Count | Status | Effort | Risk |
|--------|----------|-------|--------|--------|------|
| 1 | Branded type literals | ~35 | READY | 15m | Low |
| 2 | Schedule access | ~60 | READY | 30m | Low |
| 3 | Field kernel params | ~30 | READY | 20m | Low |
| 4 | Parser AST access | ~48 | READY | 45m | Medium |
| 5 | Mock patterns | ~20 | READY | 30m | Medium |
| 6 | CompilationInspector | ~15 | READY | 20-30m | Medium |

## Recommended Execution Sequence

**Phase 1 (Quick Wins - ~1 hour):**
1. Sprint 1: Branded type literals (15m)
2. Sprint 2: Schedule access (30m)
3. Sprint 3: Field kernel params (20m)
4. Then run full test suite

**Phase 2 (Medium Complexity - ~1.5 hours):**
5. Sprint 4: Parser AST access (45m)
6. Sprint 5: Mock patterns (30m)
7. Sprint 6: CompilationInspector (20-30m)

## Key Findings

- All factory functions for branded types already exist
- Schedule access can be solved with a single type assertion per file
- No complex type system changes needed
- Most sprints are mechanical find-and-replace operations
- No production code changes required

## Files Modified per Sprint

**Sprint 1:** 3 files (PatchStore, SelectionStore, expression-blocks tests)
**Sprint 2:** 4 files (event-blocks, stateful-primitives, EventEvaluator, integration tests)
**Sprint 3:** 1 file (field-kernel-contracts test)
**Sprint 4:** 1 file (parser test)
**Sprint 5:** 4 files (DebugMiniView, Sparkline, stroke-rendering, continuity-integration tests)
**Sprint 6:** 1 file (CompilationInspectorService test)

## Success Criteria

- ✅ All 210 'as any' casts either removed or documented
- ✅ All test suites pass with zero regressions
- ✅ Type safety improvements verified
- ✅ Any remaining casts have inline documentation explaining necessity

## Approval Checkboxes

- [ ] Approve all 6 sprints
- [ ] Approve Phase 1 only (first 3 sprints)
- [ ] Revise plan before starting
