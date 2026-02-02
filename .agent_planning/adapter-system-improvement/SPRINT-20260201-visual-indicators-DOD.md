# Definition of Done: visual-indicators
Generated: 2026-02-01
Status: PARTIALLY READY
Plan: SPRINT-20260201-visual-indicators-PLAN.md

## Acceptance Criteria

### Edge Visualization for Lensed Connections
- [ ] Edges targeting a port with lenses have amber stroke color (`#f59e0b`)
- [ ] Edge label shows human-readable lens name(s)
- [ ] Existing auto-adapter edge styling (from findAdapter) still works
- [ ] Edges to ports without lenses render unchanged
- [ ] Visual distinction between auto-adapter edges and user-lens edges is clear

### Test Coverage for lensUtils.ts
- [ ] Test file exists at `src/ui/reactFlowEditor/__tests__/lensUtils.test.ts`
- [ ] `getAvailableLensTypes()` tested: returns sorted array with required fields
- [ ] `getLensLabel()` tested: known type, unknown type fallback
- [ ] `canApplyLens()` tested: compatible and incompatible type pairs
- [ ] `findCompatibleLenses()` tested: filters correctly for given source/target
- [ ] All new tests pass in `npm run test`

### PortInfoPopover Lens Params Display
- [ ] Lens params shown in popover when `lens.params` is non-empty
- [ ] Compact key-value format (e.g., "scale: 0.5")
- [ ] No visual change when params is undefined or empty
- [ ] Popover layout intact with long param values

### Lens Indicator Tooltip Enhancement
- [ ] Tooltip on amber badge shows lens type names instead of generic count
- [ ] Multiple lenses shown comma-separated or line-separated
- [ ] Single lens shows just the name

## Exit Criteria (for MEDIUM confidence items)
- [ ] Edge visualization approach confirmed: either modify `createEdgeFromPatchEdge` signature or find lens data through existing block context
- [ ] Verify at least one adapter block actually uses params (for params display to be testable)

## Global Exit Criteria
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] No regressions in existing edge rendering
- [ ] No new console.log statements
