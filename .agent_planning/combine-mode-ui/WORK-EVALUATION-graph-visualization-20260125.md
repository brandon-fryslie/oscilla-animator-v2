# Work Evaluation - 2026-01-25
Scope: combine-mode-ui/graph-visualization
Confidence: FRESH

## Goals Under Evaluation
From SPRINT-20260125-graph-visualization-DOD.md:

**Functional:**
1. [ ] Edges that don't contribute to output are visually dimmed
2. [ ] For 'last' mode: only the last edge appears full strength
3. [ ] For 'first' mode: only the first edge appears full strength
4. [ ] For sum/average/etc: all edges appear full strength
5. [ ] Dimmed edges show tooltip explaining why

**Technical:**
6. [ ] Non-contributing edge computation is memoized
7. [ ] Visual updates when combine mode changes in port inspector
8. [ ] No performance regression with many edges

## Previous Evaluation Reference
None - first evaluation

## Persistent Check Results
| Check | Status | Output Summary |
|-------|--------|----------------|
| `npm run test` | PARTIAL PASS | 1409 tests run, 11 failed (pre-existing failures) |
| `npm run typecheck` | FAIL | Pre-existing type errors in test files |
| Non-contributing edge tests | NOT FOUND | No dedicated tests for this feature |

## Manual Runtime Testing

### What I Tried
1. Created test script to verify core logic of `getNonContributingEdges`
2. Tested sortKey ordering, 'last' mode, 'first' mode, commutative modes
3. Code review of implementation

### What Actually Happened
1. Core logic tests PASSED:
   - 'last' mode correctly identifies all but highest-sortKey edge as non-contributing
   - 'first' mode correctly identifies all but lowest-sortKey edge as non-contributing
   - Commutative modes (sum, average, etc.) return empty set (all contribute)
   - Single edge always returns empty set (contributes)
   - SortKey tie-breaker by edge ID works correctly

2. Visual implementation review:
   - Dimming style applied: `{ opacity: 0.3, strokeDasharray: '5,5' }` (CORRECT)
   - Label added: `'Not contributing'` (NOT a tooltip - this is inline text)

## Data Flow Verification
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| getNonContributingEdges logic | Correct edge sets | Correct edge sets | PASS |
| createEdgeFromPatchEdge styling | Dimmed edges styled | Dimmed edges styled | PASS |
| Reaction triggers on combineMode change | Visual update | NO UPDATE (reaction only watches blockCount/edgeCount) | FAIL |
| Tooltip on hover | Shows explanation | Shows inline label only | FAIL |

## Break-It Testing
| Attack | Expected | Actual | Severity |
|--------|----------|--------|----------|
| Change combineMode in inspector | Edges update visually | No visual change until reload | HIGH |
| Rapidly change modes | Debounced updates | N/A - reaction doesn't trigger | HIGH |

## Evidence

### Code Review: Missing Reaction Trigger

The sync reaction in `src/ui/reactFlowEditor/sync.ts:298-319` only watches:
```typescript
() => ({
  blockCount: handle.patchStore.blocks.size,
  edgeCount: handle.patchStore.edges.length,
})
```

When `combineMode` changes on an input port:
- `blockCount` stays the same
- `edgeCount` stays the same
- **Result: reaction does NOT fire, edges NOT re-computed**

### Code Review: Tooltip Implementation

In `src/ui/reactFlowEditor/nodes.ts:333-337`:
```typescript
if (isNonContributing) {
  rfEdge.style = { opacity: 0.3, strokeDasharray: '5,5' };
  rfEdge.label = 'Not contributing';  // <-- This is inline label, NOT tooltip
  rfEdge.labelStyle = { fontSize: 10, fill: '#666' };
}
```

ReactFlow edges don't support `title` attribute natively. A proper tooltip requires a custom edge component.

### Code Review: No Memoization

Neither `computeAllNonContributingEdges` nor `getNonContributingEdges` has any memoization:
- No `useMemo` or `useCallback` wrappers
- No cache object
- Functions are pure but re-run on every reconciliation

## Assessment

### PASS Working
- [Criterion 1-4] Core logic for identifying non-contributing edges is correct
- [Criterion 8] Performance should be acceptable for typical use (linear scan of edges)

### FAIL Not Working
- [Criterion 5] Tooltip: Uses inline label, not hover tooltip
- [Criterion 6] Memoization: Not implemented
- [Criterion 7] Visual updates on combineMode change: Does NOT work - reaction doesn't trigger

### Ambiguities Found
| Decision | What Was Assumed | Should Have Asked | Impact |
|----------|------------------|-------------------|--------|
| Tooltip implementation | ReactFlow edge `label` = tooltip | What's the UX for tooltip? Custom edge component needed? | Incorrect implementation |
| Memoization | Not needed yet | What's the scale? When to add caching? | DOD criterion unmet |

## Missing Checks (implementer should create)

1. **Test file needed**: `src/ui/reactFlowEditor/__tests__/non-contributing-edges.test.ts`
   - Test `getNonContributingEdges` with 'last' mode
   - Test `getNonContributingEdges` with 'first' mode
   - Test `getNonContributingEdges` with commutative modes
   - Test `computeAllNonContributingEdges` with mixed modes
   - Test edge case: single edge
   - Test edge case: equal sortKeys (tie-breaker by ID)

2. **Integration test needed**: Verify visual update when combineMode changes
   - Would require MobX reaction test or E2E test

## Verdict: INCOMPLETE

## What Needs to Change

1. **`src/ui/reactFlowEditor/sync.ts:298-319`** - Reaction must also watch for inputPort changes
   - Add a checksum or version of inputPorts combineMode values to the reaction dependency
   - Or: Watch patch.snapshot revision instead of just counts

2. **`src/ui/reactFlowEditor/nodes.ts:333-337`** - Tooltip needs proper implementation
   - Option A: Create custom edge component with native `title` support
   - Option B: Add tooltip using ReactFlow's edge label tooltip feature (if available)
   - Option C: Use a global tooltip component triggered by edge hover

3. **Memoization** (optional but DOD requires it)
   - Wrap `computeAllNonContributingEdges` result with WeakMap keyed by patch reference
   - Or: Add explicit cache invalidation on relevant changes

4. **Add tests** for the non-contributing edge computation logic

## Questions Needing Answers
None - path forward is clear.
