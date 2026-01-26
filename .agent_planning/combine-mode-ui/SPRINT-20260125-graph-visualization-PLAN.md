# Sprint: graph-visualization - Combine Mode Visual Indication in Graph Editor

**Generated:** 2026-01-25
**Confidence:** HIGH: 1, MEDIUM: 1, LOW: 0
**Status:** PARTIALLY READY

## Sprint Goal

Show visual indication in the graph editor when an edge's contribution is diminished or ignored due to combine mode.

## Scope

**Deliverables:**
1. Compute which edges are "non-contributing" based on combine mode
2. Apply dimming/styling to non-contributing edges in ReactFlow

## Work Items

### P0: Determine non-contributing edges [MEDIUM]

**Acceptance Criteria:**
- [ ] For 'last' combine mode: all edges except the last (by sort order) are non-contributing
- [ ] For 'first' combine mode: all edges except the first are non-contributing
- [ ] For other modes (sum, average, etc.): all edges contribute equally
- [ ] Function returns list of edge IDs that are non-contributing

#### Unknowns to Resolve
- How is edge sort order determined? (edge ID? explicit priority?)
- Should this computation happen in the compiler or at render time?
- Do we need compiler output to determine order, or can we compute it from patch?

#### Exit Criteria
- Clear algorithm for determining non-contributing edges
- Decision on where computation lives (compiler vs UI)

**Technical Notes:**
- May need to expose edge ordering from compiler passes
- Alternatively, apply same sorting logic used in `combine-utils.ts`

### P1: Apply visual dimming to edges [HIGH]

**Acceptance Criteria:**
- [ ] Non-contributing edges have reduced opacity (e.g., 0.3)
- [ ] Non-contributing edges have dashed stroke style
- [ ] Tooltip explains why edge is dimmed ("Not contributing due to 'last' combine mode")
- [ ] Visual style updates when combine mode changes

**Technical Notes:**
- Location: ReactFlow edge components in `src/ui/reactFlowEditor/`
- Use ReactFlow's `style` prop on edges
- May need custom edge component for tooltip

## Dependencies

- Sprint 1 (data-model-ui) must be complete
- Understanding of edge sort order in combine logic

## Risks

| Risk | Mitigation |
|------|------------|
| Edge ordering logic is complex | Start with simple case: alphabetical edge ID |
| Performance with many edges | Compute once on patch change, memoize |
| ReactFlow styling limitations | May need custom edge component |
