# Definition of Done: port-inspector

**Sprint:** Port Sub-Inspector & Full Control Support
**Generated:** 2026-01-18

## Acceptance Criteria

### Port Sub-Inspector

- [ ] **Port clickable**: Each port in the inspector is clickable
- [ ] **Port detail view**: Clicking a port shows detailed port information
- [ ] **Port info displayed**: Shows port ID, label, signal type, optional status
- [ ] **Default source shown**: If port has defaultSource, it's displayed
- [ ] **Connection shown**: Connected port shows source/target info
- [ ] **Back navigation**: Can return from port view to block view

### Connection Navigation

- [ ] **Source links clickable**: Connected input port shows source block as link
- [ ] **Target links clickable**: Output port shows target blocks as links
- [ ] **Link navigates**: Clicking link selects that block in inspector
- [ ] **Visual feedback**: Links have hover state (underline, color change)

### Full UIControlHint Support

- [ ] **Slider control**: `uiHint: { kind: 'slider' }` renders as MUI Slider
- [ ] **Int control**: `uiHint: { kind: 'int' }` renders as integer input
- [ ] **Float control**: `uiHint: { kind: 'float' }` renders as decimal input
- [ ] **Select control**: `uiHint: { kind: 'select' }` renders as dropdown
- [ ] **Boolean control**: `uiHint: { kind: 'boolean' }` renders as toggle
- [ ] **Color control**: `uiHint: { kind: 'color' }` renders as color picker
- [ ] **Text control**: `uiHint: { kind: 'text' }` renders as text input
- [ ] **XY control**: `uiHint: { kind: 'xy' }` renders as x/y pair inputs
- [ ] **Fallback**: Unknown hints fall back to text input

### Edge Inspector (if included)

- [ ] **Edge clickable**: Clicking edge in ReactFlow shows edge inspector
- [ ] **Edge info displayed**: Shows source/target block and port
- [ ] **Navigation works**: Both ends are clickable links
- [ ] **Status shown**: Edge enabled/disabled status visible

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
