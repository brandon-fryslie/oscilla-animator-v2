# Sprint: sprint4-ui-viz - Adapter UI Visualization on Edges

Generated: 2026-02-02
Confidence: HIGH: 1, MEDIUM: 2, LOW: 1
Status: RESEARCH REQUIRED

## Sprint Goal

Add visual indicators on edges that have lenses applied, so users can see at a glance which connections are being transformed.

## Scope

**Deliverables:**
1. AdapterIndicator component rendered on edges near target port
2. Edge data populated with lens information during sync
3. Custom OscillaEdge component with lens indicator
4. Visual design (amber styling, hover details)

## Work Items

### P1: Edge data lens population [HIGH]
**Acceptance Criteria:**
- [ ] ReactFlow edge data includes lens information from InputPort.lenses
- [ ] Sync function populates edge.data.lenses from the target port
- [ ] Edge data updates when lenses are added/removed

**Technical Notes:**
- Extend existing edge sync in reactFlowEditor
- Lens data comes from PatchStore/snapshot

### P2: Custom OscillaEdge component [MEDIUM]
**Acceptance Criteria:**
- [ ] Custom edge component registered with ReactFlow
- [ ] Renders standard edge path when no lenses
- [ ] Renders lens indicator near target port when lenses present
- [ ] Indicator shows lens type label on hover
- [ ] Click on indicator opens context menu or popover

#### Unknowns to Resolve
- ReactFlow custom edge API — need to verify how to position indicators along edge path
- Whether to use SVG foreignObject or pure SVG for the indicator

#### Exit Criteria
- Prototype that renders an indicator on a lensed edge without layout issues

### P2: Visual design [MEDIUM]
**Acceptance Criteria:**
- [ ] Amber/orange color (#f59e0b) consistent with port badge
- [ ] Small icon or pill-shaped label on edge
- [ ] Tooltip with lens details (type, source→target conversion)
- [ ] Does not obscure edge or port handles
- [ ] Accessible contrast ratio

#### Unknowns to Resolve
- Exact positioning: percentage along edge vs fixed offset from target
- Whether lens label should always be visible or only on hover

#### Exit Criteria
- User can identify lensed edges at a glance in a moderately complex graph

### P3: Multiple lenses on single edge [LOW]
**Acceptance Criteria:**
- [ ] When a port has multiple lenses (future), indicators stack or show count
- [ ] No visual collision between indicators

#### Unknowns to Resolve
- Is multiple-lens-per-port actually supported by the data model yet?
- Visual stacking design for N>1 lenses

#### Exit Criteria
- Design decision on multi-lens display documented

## Dependencies
- Sprint 3 cleanup (Phase 1 tests, typesMatch fix) should be done first
- Requires working lens CRUD in PatchStore

## Risks
- ReactFlow custom edges may have performance implications with many edges
- SVG foreignObject has known browser inconsistencies
