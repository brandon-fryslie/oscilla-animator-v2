# Sprint: graph-visualization - Combine Mode Visual Indication in Graph Editor

**Generated:** 2026-01-25
**Updated:** 2026-01-25 (unknowns resolved)
**Confidence:** HIGH: 3, MEDIUM: 0, LOW: 0
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Show visual indication in the graph editor when an edge's contribution is diminished or ignored due to combine mode.

## Scope

**Deliverables:**
1. Helper function to compute non-contributing edges
2. Apply dimming/styling to non-contributing edges in ReactFlow
3. Tooltip explaining why edge is dimmed

## Work Items

### P0: Create getNonContributingEdges helper [HIGH]

**Acceptance Criteria:**
- [ ] Function takes patch and port identifier, returns Set<edgeId>
- [ ] For 'last' combine mode: all edges except the last (by sortKey) are non-contributing
- [ ] For 'first' combine mode: all edges except the first are non-contributing
- [ ] For commutative modes (sum, average, max, min, mul, or, and): empty set (all contribute)
- [ ] For 'layer': empty set (all contribute, occlusion too complex to compute)
- [ ] Single edge to a port never marked as non-contributing

**Technical Notes:**
- Location: `src/ui/reactFlowEditor/nodes.ts` or new file
- Reuse `sortEdgesBySortKey` from `src/compiler/passes-v2/combine-utils.ts`
- Import CombineMode from types

### P1: Apply visual dimming to non-contributing edges [HIGH]

**Acceptance Criteria:**
- [ ] Non-contributing edges have reduced opacity (0.3)
- [ ] Non-contributing edges have dashed stroke style
- [ ] Visual style updates when combine mode changes
- [ ] Style applied via ReactFlow edge `style` prop

**Technical Notes:**
- Modify `createEdgeFromPatchEdge` in `src/ui/reactFlowEditor/nodes.ts`
- Add parameter for non-contributing edge IDs
- In `sync.ts`, pre-compute non-contributing edges before mapping

```typescript
const edgeStyle: React.CSSProperties = isNonContributing
  ? { opacity: 0.3, strokeDasharray: '5,5' }
  : {};
```

### P2: Add tooltip for dimmed edges [HIGH]

**Acceptance Criteria:**
- [ ] Dimmed edges show tooltip on hover
- [ ] Tooltip explains: "Not contributing: combine mode is 'X' and this edge has lower priority"
- [ ] Non-dimmed edges have no tooltip (or standard tooltip)

**Technical Notes:**
- ReactFlow edges support `label` prop for simple text
- For richer tooltip, may need to add data and custom edge component
- Start simple: use edge `label` prop conditionally

## Dependencies

- Sprint 1 (data-model-ui) - COMPLETE ✅
- `Edge.sortKey` field - COMPLETE ✅ (made required in Sprint 1)

## Risks

| Risk | Mitigation |
|------|------------|
| Tooltip positioning | Start with simple label, iterate if needed |
| Performance with many edges | Memoize computation, only recompute on patch change |
| ReactFlow edge styling limitations | Simple CSS props should suffice; custom component as fallback |
