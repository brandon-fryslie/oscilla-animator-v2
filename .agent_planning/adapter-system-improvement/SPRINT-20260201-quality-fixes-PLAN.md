# Sprint: quality-fixes - Code Quality, Correctness Fixes & Port Expose Menu
Generated: 2026-02-01
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-2026-02-01-195800.md + user request

## Sprint Goal
Fix three code quality issues found during evaluation, plus add "Expose as Input/Output" menu items to PortContextMenu for composite editing.

## Scope
**Deliverables:**
- Remove debug console.log statements from lensUtils.ts
- Replace JSON.stringify extent comparison with proper `extentsEqual()` in adapter-spec.ts
- Fix sourceAddress matching in normalize-adapters.ts so lenses apply only to the correct edge
- Add "Expose as Input" / "Expose as Output" items to PortContextMenu.tsx (calls CompositeEditorStore)

## Work Items

### P0: Fix sourceAddress Matching Bug in Lens Expansion

**Dependencies**: None
**Spec Reference**: LensAttachment.sourceAddress contract (src/graph/Patch.ts:95-101) | **Status Reference**: EVALUATION-2026-02-01-195800.md "Ambiguities Found" row 3

#### Description
In `src/compiler/frontend/normalize-adapters.ts`, the `analyzeLenses()` function at line 192-198 applies each lens to ALL edges targeting the port, ignoring `lens.sourceAddress`. The sourceAddress field exists specifically to identify which incoming connection a lens transforms. When a port has multiple incoming connections (e.g., combineMode: 'sum'), the current code incorrectly applies the lens to all of them instead of only the one matching the sourceAddress.

The fix: after the existing filter on `edge.to.blockId` and `edge.to.slotId`, add an additional check that the edge's source matches the lens's sourceAddress. The sourceAddress format is `v1:blocks.{blockId}.outputs.{portId}`, so it can be matched against `edge.from.blockId` and `edge.from.slotId`.

#### Acceptance Criteria
- [ ] Lens expansion only inserts a lens block for the edge whose source matches `lens.sourceAddress`
- [ ] Edges to the same port from different sources are NOT affected by a lens targeting a specific source
- [ ] Existing tests in `src/graph/__tests__/pass2-adapters.test.ts` continue to pass
- [ ] New test: port with 2 incoming edges, lens on one source -- only the matching edge gets the lens block
- [ ] The "For now" comment on line 192-193 is removed

#### Technical Notes
- sourceAddress format: `v1:blocks.{blockId}.outputs.{portId}`
- Parse with string split or regex to extract blockId and portId
- Compare against `edge.from.blockId` and `edge.from.slotId`
- Consider adding a helper `matchesSourceAddress(edge, sourceAddress): boolean`

---

### P1: Replace JSON.stringify Extent Comparison in adapter-spec.ts

**Dependencies**: None
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md rule 3 (Axis Shape Contracts) | **Status Reference**: EVALUATION-2026-02-01-195800.md "AdapterSpec Restructure" issues

#### Description
`src/blocks/adapter-spec.ts` uses `JSON.stringify()` for deep comparison of Extent axis objects at two locations:
- Line 139: `extentMatches()` compares actual vs pattern axes
- Line 191: `patternsAreCompatible()` compares two extent objects

This is fragile because JSON.stringify is order-dependent on object keys. The codebase already has a proper `extentsEqual()` function in `src/core/canonical-types/equality.ts` (exported from `src/core/canonical-types/index.ts`). However, the adapter-spec uses `ExtentPattern` which can be `'any'` or `Partial<Extent>`, so the fix needs to handle partial matching.

For `extentMatches()` (line 139): compare individual axis values using the per-axis equality functions (cardinalitiesEqual, temporalitiesEqual, etc.) from the equality module instead of JSON.stringify.

For `patternsAreCompatible()` (line 191): when both extents are full Extent objects, use `extentsEqual()`. When either is `'any'`, the existing `true` return is correct.

#### Acceptance Criteria
- [ ] No `JSON.stringify` calls remain in adapter-spec.ts for type/extent comparison
- [ ] `extentMatches()` uses per-axis structural equality from `src/core/canonical-types/equality.ts`
- [ ] `patternsAreCompatible()` uses `extentsEqual()` for full extent comparison
- [ ] All 22 existing tests in `src/blocks/__tests__/adapter-spec.test.ts` continue to pass
- [ ] New test: two Extent objects with identical values but different key ordering match correctly

#### Technical Notes
- Import `extentsEqual` from `../../core/canonical-types`
- For partial matching in `extentMatches()`, import individual axis equality fns: `cardinalitiesEqual`, `temporalitiesEqual`, `bindingsEqual`, `perspectivesEqual`, `branchesEqual`
- The `requireInst()` call in `extentsEqual` may throw on vars -- adapter-spec patterns should always be inst at this point, but add a guard if needed
- The `ExtentPattern` partial matching needs special handling: only compare axes that are specified in the pattern

---

### P1: Remove Debug Console Logs from lensUtils.ts

**Dependencies**: None
**Spec Reference**: N/A (code quality) | **Status Reference**: EVALUATION-2026-02-01-195800.md "Sprint 3: Lens Utilities" issue 1

#### Description
`src/ui/reactFlowEditor/lensUtils.ts` contains three `console.log('[Lens Debug]...')` statements at lines 111, 119, and 128 in the `findCompatibleLenses()` function. These are development-time debug logs that should not ship.

#### Acceptance Criteria
- [ ] All three `console.log('[Lens Debug]...')` calls are removed from lensUtils.ts
- [ ] No other `console.log` statements exist in lensUtils.ts
- [ ] `findCompatibleLenses()` still returns correct results (function logic unchanged)
- [ ] TypeScript compilation passes

#### Technical Notes
- Lines 111-115: Remove `console.log('[Lens Debug] Finding lenses for:', ...)`
- Lines 119-124: Remove `console.log('[Lens Debug] Checking lens:', ...)`
- Line 128: Remove `console.log('[Lens Debug] Compatible lenses found:', ...)`
- The filter logic and return statement must be preserved

---

### P1: Add "Expose as Input/Output" to PortContextMenu

**Dependencies**: None
**Spec Reference**: CompositeEditorStore.exposeInputPort / exposeOutputPort

#### Description
When editing a composite block's internal graph via the ReactFlow editor, the PortContextMenu (`src/ui/reactFlowEditor/menus/PortContextMenu.tsx`) should show "Expose as Input" for input ports and "Expose as Output" for output ports. This already exists in the CompositeEditor's own context menu (`src/ui/components/CompositeEditor.tsx`) but is missing from the shared PortContextMenu used by the ReactFlow-based graph editor.

The menu items should:
- Only appear when a CompositeEditorStore is active (i.e., user is editing inside a composite)
- Show "Expose as Input" / "Expose as Output" for unexposed ports
- Show "Unexpose Input" / "Unexpose Output" for already-exposed ports
- Call through to `CompositeEditorStore.exposeInputPort()` / `exposeOutputPort()` / `unexposeInputPort()` / `unexposeOutputPort()`

#### Acceptance Criteria
- [ ] "Expose as Input" appears in port context menu for input ports when editing a composite
- [ ] "Expose as Output" appears in port context menu for output ports when editing a composite
- [ ] Already-exposed ports show "Unexpose" variant instead
- [ ] Menu items do NOT appear when editing a top-level patch (no active composite editor)
- [ ] Calling expose/unexpose correctly updates CompositeEditorStore
- [ ] TypeScript compilation passes

#### Technical Notes
- Access CompositeEditorStore from the store context (check how other components access it)
- Check `isExposed` by looking at `compositeEditor.exposedInputs` / `compositeEditor.exposedOutputs`
- Generate externalId from portId (or use portId directly as the external name)
- The existing CompositeEditor.tsx implementation (lines 283-307) is a reference for the exact API calls

## Dependencies
- None -- all four items are independent of each other and can be done in any order

## Risks
- The sourceAddress matching fix changes normalization behavior. Must verify no existing test relies on the "apply to all edges" behavior.
- The extent equality change touches a pattern-matching hot path. Performance should not regress (structural comparison vs stringify is typically faster, so this is low risk).
