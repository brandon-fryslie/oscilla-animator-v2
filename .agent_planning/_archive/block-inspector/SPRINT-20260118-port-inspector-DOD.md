# Definition of Done: port-inspector

**Sprint:** Port Sub-Inspector & Full Control Support
**Generated:** 2026-01-18
**Status:** ✅ COMPLETE (verified 2026-01-21)

## Acceptance Criteria

### Port Sub-Inspector

- [x] **Port clickable**: Each port in the inspector is clickable
- [x] **Port detail view**: Clicking a port shows detailed port information
- [x] **Port info displayed**: Shows port ID, label, signal type, optional status
- [x] **Default source shown**: If port has defaultSource, it's displayed
- [x] **Connection shown**: Connected port shows source/target info
- [x] **Back navigation**: Can return from port view to block view

### Connection Navigation

- [x] **Source links clickable**: Connected input port shows source block as link
- [x] **Target links clickable**: Output port shows target blocks as links
- [x] **Link navigates**: Clicking link selects that block in inspector
- [x] **Visual feedback**: Links have hover state (underline, color change)

### Full UIControlHint Support

- [x] **Slider control**: `uiHint: { kind: 'slider' }` renders as MUI Slider
- [x] **Int control**: `uiHint: { kind: 'int' }` renders as integer input
- [x] **Float control**: `uiHint: { kind: 'float' }` renders as decimal input
- [x] **Select control**: `uiHint: { kind: 'select' }` renders as dropdown
- [x] **Boolean control**: `uiHint: { kind: 'boolean' }` renders as toggle
- [x] **Color control**: `uiHint: { kind: 'color' }` renders as color picker
- [x] **Text control**: `uiHint: { kind: 'text' }` renders as text input
- [x] **XY control**: `uiHint: { kind: 'xy' }` renders as x/y pair inputs
- [x] **Fallback**: Unknown hints fall back to text input

### Edge Inspector (if included)

- [x] **Edge clickable**: Clicking edge in ReactFlow shows edge inspector
- [x] **Edge info displayed**: Shows source/target block and port
- [x] **Navigation works**: Both ends are clickable links
- [x] **Status shown**: Edge enabled/disabled status visible

## Verification Method

1. **Port inspector**:
   - Click on an input port → verify port detail view appears
   - Verify port shows type, default source, connection status
   - Click "back" → returns to block view

2. **Navigation**:
   - On a connected port, click the source block link
   - Verify inspector now shows that block
   - Navigate back and forth between connected blocks

3. **UIControlHint controls**:
   - Create blocks with different param types
   - Verify each type renders appropriate control
   - Edit each control type, verify values persist

## Out of Scope

- Deep multi-level port drilling (port → port → port)
- Editing connections from inspector (drag-drop only)
- Visual port highlighting in editor when selected in inspector
