# Sprint: port-inspector - Port Sub-Inspector & Full Control Support

**Generated:** 2026-01-18
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION (after selection-editing sprint)

## Sprint Goal

Add interactive port inspector with click-to-navigate, and support all UIControlHint types for param editing.

## Scope

**Deliverables:**
1. Port click → opens port detail inspector
2. Navigate from port connections to source/target blocks
3. Full UIControlHint support (slider, select, boolean, color)
4. Edge inspector when clicking an edge

## Work Items

### P0: Port Sub-Inspector

**Acceptance Criteria:**
- [ ] Clicking a port in the inspector opens a port detail view
- [ ] Port view shows: port ID, label, signal type, optional status
- [ ] Port view shows default source (if any)
- [ ] Port view shows connection status (connected or not)
- [ ] If connected: shows source block name with clickable link
- [ ] Clicking source block link selects that block (navigates to it)

**Technical Notes:**
- Add `selectedPortRef: PortRef | null` to SelectionStore or local state
- Create PortInspector subcomponent
- Port ref is `{ blockId, slotId }` - existing `PortRef` type
- Use existing `hoveredPortRef` pattern but for selection

**Implementation approach:**
1. Port items become clickable `<button>` or `<div onClick={...}>`
2. Click sets local `selectedPort` state
3. Show PortInspector when port is selected
4. "Back" button returns to block view

### P1: Connection Navigation

**Acceptance Criteria:**
- [ ] Input port shows source block (if connected) as clickable link
- [ ] Output port shows all target blocks as clickable links
- [ ] Clicking link calls `rootStore.selection.selectBlock(targetId)`
- [ ] Inspector immediately shows the navigated-to block

**Technical Notes:**
- Already have `incomingEdges` and `outgoingEdges` computed in BlockDetails
- Change from plain text to clickable `<span onClick={...}>`
- Style links with `cursor: pointer`, underline on hover

### P2: Full UIControlHint Support

**Acceptance Criteria:**
- [ ] `slider` hint → MUI Slider component
- [ ] `int` hint → number input with step=1
- [ ] `float` hint → number input with decimal support
- [ ] `select` hint → MUI Select with options
- [ ] `boolean` hint → MUI Switch/Checkbox
- [ ] `color` hint → color input or picker
- [ ] `text` hint → text input
- [ ] `xy` hint → x/y pair inputs
- [ ] Fallback: unknown hint types show as text input

**Technical Notes:**
- Read `uiHint` from block definition's params or inputs
- For params without explicit hint, infer from typeof value
- Color picker: use native `<input type="color">` or MUI lab

### P3: Edge Inspector (optional, time permitting)

**Acceptance Criteria:**
- [ ] Clicking an edge in ReactFlow shows edge inspector
- [ ] Edge inspector shows: source block/port, target block/port
- [ ] Both ends are clickable navigation links
- [ ] Shows edge enabled/disabled status

**Technical Notes:**
- Use `onEdgeClick` ReactFlow callback
- Call `rootStore.selection.selectEdge(edgeId)`
- Create EdgeInspector component in BlockInspector.tsx

## Dependencies

- Sprint 1 (selection-editing) must be complete
- MUI Slider, Switch, Select components
- Existing PortRef type

## Risks

| Risk | Mitigation |
|------|------------|
| Port inspector adds UI complexity | Keep minimal, just essential info |
| Color picker cross-browser | Use native input[type=color] for v1 |
| Edge selection conflicts with node | onEdgeClick fires before onNodeClick, should be fine |
