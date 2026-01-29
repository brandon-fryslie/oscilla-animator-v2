# Definition of Done: graph-visualization

**Sprint:** Combine Mode Visual Indication in Graph Editor
**Generated:** 2026-01-25

## Functional Criteria

- [ ] Edges that don't contribute to output are visually dimmed
- [ ] For 'last' mode: only the last edge appears full strength
- [ ] For 'first' mode: only the first edge appears full strength
- [ ] For sum/average/etc: all edges appear full strength
- [ ] Dimmed edges show tooltip explaining why

## Technical Criteria

- [ ] Non-contributing edge computation is memoized
- [ ] Visual updates when combine mode changes in port inspector
- [ ] No performance regression with many edges

## Verification Method

1. Create a patch with multiple edges to one input port
2. Set combine mode to 'last'
3. Verify all but one edge is dimmed
4. Change combine mode to 'sum'
5. Verify all edges are full strength
6. Hover over dimmed edge, verify tooltip

## Out of Scope

- Animation of dimming transition
- Color-coding by contribution amount
