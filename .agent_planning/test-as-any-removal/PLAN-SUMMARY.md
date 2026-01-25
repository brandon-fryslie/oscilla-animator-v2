# Plan Summary: Remove 'as any' casts from test files
**Task:** oscilla-animator-v2-ar5
**Target:** Remove 112 remaining 'as any' casts across test files
**Status:** READY FOR IMPLEMENTATION

## Overview

5 sprints to systematically eliminate all type casts from test files:

| Sprint | Focus | Instances | Status | Effort |
|--------|-------|-----------|--------|--------|
| 1 | Trivial fixes (SigExprId + block mocks) | 15 | HIGH | 30 min |
| 2 | Field kernel types | 36 | HIGH | 1 hour |
| 3 | React props + mock canvas | 15 | HIGH | 45 min |
| 4 | Builder + Inspector internals | 19 | MEDIUM | 1-2 hours |
| 5 | Misc stragglers | 17 | HIGH | 30 min |
| **TOTAL** | | **112 casts** | | **3.5-4.5 hours** |

## Execution Strategy

### Immediate (Sprints 1-3): 96 casts, ~2.25 hours
All three sprints are fully HIGH confidence and can be executed immediately or in parallel:

1. **Sprint 1 (30 min):** Use existing `sigExprId()` and `signalType()` factories
2. **Sprint 2 (1 hour):** Create `testFieldType()` helper and apply consistently
3. **Sprint 3 (45 min):** Create test helpers for props access and mock canvas

### Design Decisions Needed (Sprint 4): 19 casts, 1-2 hours
Requires brief user input on two design questions:
- **SigRef.id:** Should it be a public property or test-only accessor?
- **CompilationInspector:** Should we add generic accessor `getPassOutput<T>()` or keep pragmatic cast?

Recommendations provided in sprint plan, but user choice preferred.

### Cleanup (Sprint 5): 17 casts, 30 min
Opportunistic fixes in remaining files using patterns from earlier sprints.

## Key Implementation Points

### Sprint 1 & 2 - Factory Functions
These already exist and are ready to use:
- `sigExprId(n)` from `src/compiler/ir/Indices.ts` (line 101)
- `signalType(payload)` from `src/core/canonical-types.ts`
- `signalTypeField(payload, instanceId)` from `src/core/canonical-types.ts`

### Sprint 3 - New Test Helpers
Need to create:
```typescript
// For React props access
function getDataAttr(element: ReactElement, attrName: string): string | undefined

// For canvas mocks
function createMockCanvas2DContext(): CanvasRenderingContext2D
```

### Sprint 4 - Design Input
Two API changes to discuss:
1. Add `id: SigExprId` property to `SigRef` interface (breaking for typed objects, but test-safe)
2. Add `getPassOutput<T>(name: string): T | undefined` to `InspectionSnapshot` (backward compatible)

## Confidence Assessment

- **Sprints 1-3, 5:** HIGH confidence - patterns fully understood, fixes mechanical
- **Sprint 4:** MEDIUM confidence - correct approach but needs design validation

## Files Generated

```
.agent_planning/test-as-any-removal/
├── EVALUATION-2026-01-25-073032.md          # Scope analysis
├── SPRINT-2026-01-25-trivial-fixes-PLAN.md  # Sprint 1
├── SPRINT-2026-01-25-field-kernel-types-PLAN.md  # Sprint 2
├── SPRINT-2026-01-25-react-mocks-PLAN.md    # Sprint 3
├── SPRINT-2026-01-25-builder-inspector-PLAN.md  # Sprint 4
├── SPRINT-2026-01-25-misc-stragglers-PLAN.md   # Sprint 5
└── PLAN-SUMMARY.md                          # This file
```

## Recommendation

**Execute Sprints 1-3 immediately** (straightforward, no dependencies). These remove 96 casts and complete ~85% of the work in ~2.25 hours.

**Before Sprint 4:** Brief design discussion on SigRef and CompilationInspector approaches (5-10 minutes to clarify preferences).

**Sprint 5:** Cleanup pass to catch any remaining stragglers.

All work is test-only, so no risk to production code. Tests are already passing - this is pure type-level improvement.
