# Evaluation: Sprint 2 - Combine Mode Graph Visualization

**Generated:** 2026-01-25
**Topic:** Edge dimming based on combine mode
**Verdict:** CONTINUE - Unknowns resolved

## Research Findings

### Edge Sort Order (RESOLVED)

**Question:** How is edge sort order determined?

**Answer:** Found in `src/compiler/passes-v2/combine-utils.ts:339-349`:
- Primary: `Edge.sortKey` (ascending)
- Tiebreaker: `edge.id` (lexicographic)
- Existing function: `sortEdgesBySortKey(edges)` can be reused

```typescript
export function sortEdgesBySortKey(edges: readonly Edge[]): Edge[] {
  return [...edges].sort((a, b) => {
    const sortKeyA = a.sortKey ?? 0;
    const sortKeyB = b.sortKey ?? 0;
    if (sortKeyA !== sortKeyB) {
      return sortKeyA - sortKeyB;
    }
    return a.id.localeCompare(b.id);
  });
}
```

### Where to Compute (RESOLVED)

**Question:** Compiler vs UI?

**Answer:** UI at render time
- Use existing `sortEdgesBySortKey` from combine-utils
- Compute in `createEdgeFromPatchEdge` or edge rendering
- Memoize based on patch edges and combineMode

### ReactFlow Integration (RESOLVED)

**Location:** `src/ui/reactFlowEditor/nodes.ts:224-244`
- `createEdgeFromPatchEdge()` creates ReactFlow edges
- Can add `style` property for opacity/dasharray
- Can add `label` or `data` for tooltip content

## Implementation Path

1. **Add helper function** in nodes.ts or sync.ts:
   - `getNonContributingEdges(patch, port)`
   - Returns Set<edgeId> of non-contributing edges

2. **Modify createEdgeFromPatchEdge**:
   - Accept additional parameter: `nonContributingEdgeIds: Set<string>`
   - Apply dimmed styling if edge is non-contributing

3. **In sync.ts buildNodesAndEdgesWithPositions**:
   - Pre-compute all non-contributing edges
   - Pass to createEdgeFromPatchEdge

## Status

All unknowns resolved. Ready to upgrade to HIGH confidence.
