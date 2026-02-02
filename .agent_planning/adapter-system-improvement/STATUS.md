# Status: Adapter System Improvement (Lenses)

**Topic**: adapter-system-improvement
**Last Updated**: 2026-02-01
**Epic**: oscilla-animator-v2-8m2 / oscilla-animator-v2-o7a
**Status**: SPRINTS 1-3 COMPLETE, TWO SPRINTS REMAINING

## Current Phase

**Phase**: Sprints 1-3 complete. Sprint A (quality fixes) and Sprint B (visual indicators) planned and ready.

## Progress Summary

| Sprint | Description | Status |
|--------|-------------|--------|
| Sprint 1 | Data Model & Addressing | COMPLETED |
| Sprint 2 | Lenses System Redesign (Normalization) | COMPLETED |
| Sprint 3 | Editor Integration (PatchStore, UI, Context Menus) | COMPLETED |
| Sprint 5 | Context Menu & Editing | MERGED INTO SPRINT 3 - COMPLETED |
| Sprint A (quality-fixes) | Code Quality & Correctness Fixes | PLANNED - HIGH CONFIDENCE |
| Sprint B (visual-indicators) | Edge Visualization & Visual Indicators | PLANNED - PARTIALLY READY |
| Sprint C (future) | Advanced Lens Editing | NOT PLANNED - LOW CONFIDENCE |

## Quality Issues (Sprint A)

Issues found during evaluation (EVALUATION-2026-02-01-195800.md, EVALUATION-20260202.md):

1. **P0 - sourceAddress matching bug**: `normalize-adapters.ts:192-198` applies lenses to ALL edges targeting a port, ignoring `lens.sourceAddress`. Correctness bug when port has multiple inputs.
2. **P1 - JSON.stringify for Extent equality**: `adapter-spec.ts:139,191` uses fragile comparison. Proper `extentsEqual()` exists in canonical-types.
3. **P1 - Debug console.logs**: `lensUtils.ts:111,119,128` has `[Lens Debug]` logs that should be removed.

Additional items from 20260202 evaluation:
4. **P0 - Phase 1 test coverage**: expandExplicitLenses has ZERO tests
5. **P0 - typesMatch() too shallow**: angle{radians} matches angle{degrees}
6. **P1 - Doc comment contradiction**: normalize-adapters.ts header misrepresents Phase 2
7. **P1 - Broken diagnostic action**: "Add Adapter" creates orphan blocks

## Remaining Work (Sprint B)

1. Edge labels/styling for edges with lenses
2. Lens indicator tooltip enhancement (show lens names)
3. PortInfoPopover params display gap
4. Test coverage for lensUtils.ts (currently zero)

## Future Work (Sprint C - LOW confidence)

- Double-click adapter indicator to edit params
- Keyboard shortcuts for lens management
- Parameterized lens editing UI

## Sprint Plans

### Current (20260201)
| File | Confidence | Status |
|------|-----------|--------|
| SPRINT-20260201-quality-fixes-PLAN.md | HIGH | READY FOR IMPLEMENTATION |
| SPRINT-20260201-quality-fixes-DOD.md | - | Definition of Done |
| SPRINT-20260201-quality-fixes-CONTEXT.md | - | Implementation Context |
| SPRINT-20260201-visual-indicators-PLAN.md | PARTIALLY READY | Research needed for edge viz |
| SPRINT-20260201-visual-indicators-DOD.md | - | Definition of Done |
| SPRINT-20260201-visual-indicators-CONTEXT.md | - | Implementation Context |

### Superseded (20260202 plans cover overlapping scope but lack CONTEXT files)
| File | Notes |
|------|-------|
| SPRINT-20260202-sprint3-cleanup-PLAN.md | Overlaps with quality-fixes sprint |
| SPRINT-20260202-sprint3-cleanup-DOD.md | Overlaps with quality-fixes sprint |
| SPRINT-20260202-sprint4-ui-viz-PLAN.md | Overlaps with visual-indicators sprint |
| SPRINT-20260202-sprint4-ui-viz-DOD.md | Overlaps with visual-indicators sprint |

## Beads Status

| Bead | Title | Status | Notes |
|------|-------|--------|-------|
| oscilla-animator-v2-8m2 | Domain Transformation System (epic) | open | |
| oscilla-animator-v2-o7a | Adapter System Improvement (epic) | open | |
| oscilla-animator-v2-53c | Sprint 1: Data Model | closed | Complete |
| oscilla-animator-v2-mtc | Sprint 2: Normalization | in_progress | **Should be closed** |
| oscilla-animator-v2-lrc | Sprint 3: Editor Integration | in_progress | Substantially done |
| oscilla-animator-v2-vqkj | AdapterSpec restructure | closed | Complete |
| oscilla-animator-v2-166 | Sprint 4: UI Visualization | open | Not started |
| oscilla-animator-v2-u01 | Sprint 5: Context Menu | open | Merged into Sprint 3 |

## Key Decisions

1. **Lenses vs Adapters**: "Lenses" = user-facing explicit transformations; "Adapters" = compiler auto-inserted blocks. Both coexist.
2. **Sprint A before B**: Quality fixes (especially sourceAddress bug) should be done before edge visualization.
3. **Sprint C deferred**: Advanced editing requires selection model and param editing UI. Research needed.

## References

- EVALUATION-20260202.md - Latest evaluation
- EVALUATION-2026-02-01-195800.md - Prior evaluation
- SPRINT3-EDITOR-INTEGRATION-PLAN.md - Completed Sprint 3 plan
- src/compiler/frontend/normalize-adapters.ts - Normalization pass
- src/ui/reactFlowEditor/lensUtils.ts - Lens UI utilities
- src/blocks/adapter-spec.ts - AdapterSpec on BlockDef
