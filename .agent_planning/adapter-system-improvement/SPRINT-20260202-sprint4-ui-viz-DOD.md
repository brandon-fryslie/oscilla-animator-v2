# Definition of Done: Sprint 4 - Adapter UI Visualization

**Generated**: 2026-02-02
**Status**: RESEARCH REQUIRED
**Plan**: SPRINT-20260202-sprint4-ui-viz-PLAN.md

## Acceptance Criteria

### V1: Edge data population
- [ ] Edge sync populates lenses from target InputPort
- [ ] Adding/removing lens causes edge to re-render with updated data
- [ ] Test: edge data includes lens info after PatchStore.addLens()

### V2: Custom edge component
- [ ] OscillaEdge component renders for all edges
- [ ] Plain edges render identically to default ReactFlow edges
- [ ] Lensed edges show amber indicator near target port
- [ ] Indicator shows lens type on hover

### V3: Visual design
- [ ] Amber color (#f59e0b) matches port badge
- [ ] Indicator does not block handle interactions
- [ ] Readable at default zoom level

### V4: Multiple lenses (stretch)
- [ ] Design decision documented
- [ ] If implemented: indicators don't collide

## Regression Requirements
- [ ] All existing tests pass
- [ ] TypeScript builds clean
- [ ] No layout regressions in graph editor

## Exit Criteria
Sprint is DONE when V1-V3 are met. V4 is a stretch goal.
