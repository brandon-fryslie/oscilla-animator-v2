# Sprint: port-inspector - Port Sub-Inspector & Full Control Support

**Generated:** 2026-01-18
**Confidence:** HIGH
**Status:** ✅ COMPLETE (verified 2026-01-21)

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
- [x] Clicking a port in the inspector opens a port detail view
- [x] Port view shows: port ID, label, signal type, optional status
- [x] Port view shows default source (if any)
- [x] Port view shows connection status (connected or not)
- [x] If connected: shows source block name with clickable link
- [x] Clicking source block link selects that block (navigates to it)

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
- [x] Input port shows source block (if connected) as clickable link
- [x] Output port shows all target blocks as clickable links
- [x] Clicking link calls `rootStore.selection.selectBlock(targetId)`
- [x] Inspector immediately shows the navigated-to block

**Technical Notes:**
- Already have `incomingEdges` and `outgoingEdges` computed in BlockDetails
- Change from plain text to clickable `<span onClick={...}>`
- Style links with `cursor: pointer`, underline on hover

### P2: Full UIControlHint Support

**Acceptance Criteria:**
- [x] `slider` hint → MUI Slider component
- [x] `int` hint → number input with step=1
- [x] `float` hint → number input with decimal support
- [x] `select` hint → MUI Select with options
- [x] `boolean` hint → MUI Switch/Checkbox
- [x] `color` hint → color input or picker
- [x] `text` hint → text input
- [x] `xy` hint → x/y pair inputs
- [x] Fallback: unknown hint types show as text input

**Technical Notes:**
- Read `uiHint` from block definition's params or inputs
- For params without explicit hint, infer from typeof value
- Color picker: use native `<input type="color">` or MUI lab

### P3: Edge Inspector (optional, time permitting)

**Acceptance Criteria:**
- [x] Clicking an edge in ReactFlow shows edge inspector
- [x] Edge inspector shows: source block/port, target block/port
- [x] Both ends are clickable navigation links
- [x] Shows edge enabled/disabled status

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
