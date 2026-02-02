# Definition of Done: quality-fixes
Generated: 2026-02-01
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260201-quality-fixes-PLAN.md

## Acceptance Criteria

### Fix sourceAddress Matching Bug
- [ ] `analyzeLenses()` in normalize-adapters.ts filters edges by matching `lens.sourceAddress` against `edge.from.blockId` and `edge.from.slotId`
- [ ] The "For now" comment on line 192-193 is removed
- [ ] New test in pass2-adapters.test.ts: port with 2 incoming edges, lens targeting one source -- only the matching edge gets a lens block inserted
- [ ] New test: lens with sourceAddress that matches no edge produces no insertion (no error, just skip)
- [ ] All 9 existing pass2-adapters tests pass

### Replace JSON.stringify Extent Comparison
- [ ] `extentMatches()` uses per-axis equality functions instead of JSON.stringify
- [ ] `patternsAreCompatible()` uses `extentsEqual()` instead of JSON.stringify
- [ ] Zero `JSON.stringify` calls remain in adapter-spec.ts
- [ ] All 22 existing adapter-spec tests pass
- [ ] New test: Extent objects with semantically identical values compare as equal regardless of property ordering

### Remove Debug Console Logs
- [ ] Zero `console.log` calls in lensUtils.ts
- [ ] `findCompatibleLenses()` returns same results as before (logic unchanged)
- [ ] TypeScript compilation clean (`npm run typecheck`)

### Add "Expose as Input/Output" to PortContextMenu
- [ ] "Expose as Input" menu item appears for input ports when editing inside a composite
- [ ] "Expose as Output" menu item appears for output ports when editing inside a composite
- [ ] Already-exposed ports show "Unexpose Input" / "Unexpose Output" instead
- [ ] Menu items do NOT appear when editing a top-level patch (no active composite editor)
- [ ] Calling expose/unexpose correctly updates CompositeEditorStore
- [ ] TypeScript compilation passes

## Global Exit Criteria
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (all ~2055 tests)
- [ ] No new `console.log` statements introduced
- [ ] No new `JSON.stringify` comparisons introduced
