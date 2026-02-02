# Evaluation: Adapter System Improvement (oscilla-animator-v2-o7a)
Timestamp: 2026-02-01-195600
Git Commit: a8bce63

## Executive Summary
Overall: 75% complete | Critical issues: 0 | Minor issues: 3 | Tests reliable: yes

The adapter/lens system has its core infrastructure fully built and working. Sprints 1-3 are functionally complete (including Sprint 5's context menu work, which was merged into Sprint 3). Sprint 4 (edge visualization) and parameterized lens editing UI remain unstarted. The beads and STATUS.md are significantly stale -- they describe a world 5 days behind the code.

## Runtime Check Results
| Check | Status | Output |
|-------|--------|--------|
| npm run typecheck | PASS | Clean compilation |
| npm run test | PASS | 2055 passed, 22 skipped, 2 todo (136 files) |
| PatchStore-lens.test.ts | PASS | 21/21 |
| adapter-spec.test.ts | PASS | 22/22 |
| pass2-adapters.test.ts | PASS | 9/9 |

Note: 1 "Worker exited unexpectedly" error from tinypool is infrastructure noise, not a test failure.

## Missing Checks
- No integration test verifying end-to-end: add lens via UI -> normalization pass expands it -> compilation succeeds
- No test for `findCompatibleLenses()` or `canApplyLens()` in lensUtils.ts
- No test verifying context menu items render correctly with lens options

## Findings

### Sprint 1: Data Model & Addressing
**Status**: COMPLETE
**Evidence**: `src/graph/Patch.ts:78-119` (LensAttachment), `:209` (InputPort.lenses), `:234` (OutputPort.lenses reserved)
**Issues**: None. Clean implementation.

### Sprint 2: Normalization Pass
**Status**: COMPLETE
**Evidence**: `src/compiler/frontend/normalize-adapters.ts` - two-phase pass (expandExplicitLenses + autoInsertAdapters), 9 tests passing in `src/graph/__tests__/pass2-adapters.test.ts`
**Issues**: None functional. The bead (oscilla-animator-v2-mtc) still says "IN_PROGRESS" with "89 test failures" -- this is completely stale.

### AdapterSpec Restructure (oscilla-animator-v2-vqkj)
**Status**: COMPLETE
**Evidence**: `src/blocks/adapter-spec.ts` with pattern-based matching, 22 tests passing
**Issues**:
- `extentMatches()` at line 139 uses `JSON.stringify` for deep comparison. This is order-dependent and fragile. Works today because extent axis objects are constructed consistently, but any reordering of object keys would break matching silently.
- `patternsAreCompatible()` at line 191 also uses `JSON.stringify` for extent comparison. Same fragility.

### Sprint 3: PatchStore Methods
**Status**: COMPLETE
**Evidence**: `src/stores/PatchStore.ts` lines 650, 749, 812, 827 - all four methods (addLens, removeLens, getLensesForPort, updateLensParams). MobX action decorators at lines 118-120. 21 tests passing.
**Issues**: None. Tests cover happy path, error paths, and edge cases (empty, single, multiple lenses, defensive copy).

### Sprint 3: PatchBuilder
**Status**: COMPLETE
**Evidence**: `src/graph/Patch.ts:576-615` - addLens method, chainable, validates block/port existence.
**Issues**: None.

### Sprint 3: Lens Utilities
**Status**: COMPLETE (with cleanup needed)
**Evidence**: `src/ui/reactFlowEditor/lensUtils.ts` - getAvailableLensTypes, getLensLabel, canApplyLens, findCompatibleLenses
**Issues**:
1. **Debug console.logs in production code** (lines 111, 119, 128): `console.log('[Lens Debug] Finding lenses for:', ...)` etc. These should be removed before shipping.
2. **Silent fallback in type matching** (lines 90-96): `typesMatch()` returns `true` when either type has no unit -- "If either has no unit, consider compatible (scalar)". This is a permissive heuristic that could allow incompatible connections. Whether this is correct depends on the intended semantics of unitless types.
3. **No tests** for any function in this file.

### Sprint 3: Port Visual Indicators
**Status**: COMPLETE
**Evidence**: `src/ui/reactFlowEditor/OscillaNode.tsx:235-256` - amber badge with lens count. `src/ui/reactFlowEditor/nodes.ts:52-55,131-132` - PortData extension with lensCount/lenses fields.
**Issues**: None. Implementation matches Sprint 3 DOD spec (amber color, count > 1 shows number, single shows dot).

### Sprint 3: PortInfoPopover
**Status**: COMPLETE
**Evidence**: `src/ui/reactFlowEditor/PortInfoPopover.tsx:295-308` - "Lenses" section showing label and abbreviated source address for each lens.
**Issues**: Does not show params even if present (DOD line 87 says "Shows params if present"). Minor gap.

### Sprint 3/5: Context Menus
**Status**: COMPLETE
**Evidence**:
- `src/ui/reactFlowEditor/menus/PortContextMenu.tsx:357-421` - Add Lens (filtered by compatibility) and Remove Lens
- `src/ui/reactFlowEditor/menus/EdgeContextMenu.tsx:66-98` - Add Lens option
**Issues**: None. This was originally Sprint 5 work but was merged into Sprint 3 implementation.

### Sprint 4: Edge Visualization
**Status**: NOT STARTED
**Evidence**: `src/ui/reactFlowEditor/sync.ts` has zero references to lenses or adapters. No edge coloring, no lens label on edges, no AdapterIndicator component.
**Issues**: This is the primary remaining work. The DOD specifies: edge indicator positioned near target port, hover shows adapter details, color distinguishes unit from cardinality adapters.

### Sprint 5: Context Menu & Editing
**Status**: MOSTLY COMPLETE (merged into Sprint 3)
**Evidence**: Add/Remove Lens in both port and edge context menus is implemented.
**Not done**: Double-click on adapter indicator (no indicator exists yet), keyboard delete on selected adapter (no selection model for adapters).

### Parameterized Lens UI
**Status**: NOT STARTED
**Evidence**: Data model supports params (`LensAttachment.params`), PatchStore has `updateLensParams()`, but no UI to view or edit parameters.

## Ambiguities Found
| Area | Question | How LLM Guessed | Impact |
|------|----------|-----------------|--------|
| lensUtils.ts:90-96 | Should unitless types be universally compatible? | Assumed yes (returns true) | Could allow invalid connections if unitless-means-incompatible was intended |
| adapter-spec.ts:139 | How to compare Extent axis objects for equality? | Used JSON.stringify | Fragile to key ordering; works by accident if objects always constructed same way |
| normalize-adapters.ts:193-199 | Should lens expansion apply to ALL edges to a port, or only the one matching sourceAddress? | Applied to all edges (comment says "For now, we insert lens for all edges to this port") | If port has multiple incoming connections, lens is applied to all of them, not just the one matching sourceAddress. This may be wrong. |

## Bead Staleness Assessment

The following beads need status updates:

| Bead | Current Status | Should Be |
|------|---------------|-----------|
| oscilla-animator-v2-mtc (Sprint 2) | IN_PROGRESS ("89 test failures") | CLOSED - all tests pass, implementation complete |
| oscilla-animator-v2-lrc (Sprint 3) | IN_PROGRESS | CLOSED - PatchStore methods, UI indicators, context menus, popover all done |
| oscilla-animator-v2-u01 (Sprint 5) | OPEN (blocked by Sprint 4) | PARTIALLY CLOSED - context menu work merged into Sprint 3; only "double-click indicator" and "keyboard delete" remain, both depend on Sprint 4 |
| oscilla-animator-v2-166 (Sprint 4) | OPEN (blocked by Sprint 3) | UNBLOCKED - Sprint 3 is complete, Sprint 4 can proceed |
| oscilla-animator-v2-o7a (Epic) | OPEN | Remains OPEN - Sprint 4 not done |

STATUS.md (`.agent_planning/adapter-system-improvement/STATUS.md`) says Sprint 3 is "PLANNED - READY" when it is actually complete. Needs full rewrite.

## Recommendations
1. **Close stale beads**: Close oscilla-animator-v2-mtc and oscilla-animator-v2-lrc. Update STATUS.md.
2. **Remove debug console.logs**: `src/ui/reactFlowEditor/lensUtils.ts` lines 111, 119, 128.
3. **Add tests for lensUtils.ts**: findCompatibleLenses and canApplyLens have zero test coverage.
4. **Fix sourceAddress matching in normalize-adapters.ts**: Line 198 applies lens to ALL edges targeting the port, ignoring `lens.sourceAddress`. This is noted with a "for now" comment but could cause incorrect behavior when a port has multiple incoming connections.
5. **Replace JSON.stringify comparisons**: `src/blocks/adapter-spec.ts:139,191` - use a proper deep equality function for Extent comparison.
6. **Proceed with Sprint 4 (Edge Visualization)**: This is the primary remaining work item and is now unblocked.
7. **Add params display to PortInfoPopover**: Minor gap from Sprint 3 DOD.

## Verdict
- [x] CONTINUE - Issues clear, implementer can fix

Remaining work is well-scoped: Sprint 4 (edge visualization) is the main gap. The foundation (data model, store methods, normalization, context menus) is solid and tested. The three code quality issues (debug logs, JSON.stringify, sourceAddress matching) are minor and can be fixed incrementally. No ambiguities are severe enough to warrant PAUSE.
