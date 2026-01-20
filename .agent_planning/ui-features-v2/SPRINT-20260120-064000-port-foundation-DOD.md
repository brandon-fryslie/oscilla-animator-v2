# Definition of Done: port-foundation Sprint
Generated: 2026-01-20T06:40:00Z

## Acceptance Criteria Checklist

### P1: Enhanced Port Visualization (oscilla-animator-v2-vr6)
- [ ] Port handles are at least 16x16px (clickable area)
- [ ] Port label is visible next to each handle
  - Input labels positioned on left side of node
  - Output labels positioned on right side of node
- [ ] Connected ports have distinct visual style (filled)
- [ ] Unconnected ports have distinct visual style (hollow/outline)
- [ ] Type color coding preserved on handles
- [ ] Tooltips still work for detailed type info

### P2: Port Selection Support
- [ ] SelectionStore has `selectedPort: PortRef | null` observable
- [ ] `selectPort(blockId, portId, direction)` action exists
- [ ] `clearPortSelection()` action exists
- [ ] Clicking port handle selects the port
- [ ] Selecting block clears port selection
- [ ] Selecting edge clears port selection
- [ ] Selecting port clears block and edge selection
- [ ] Selected port has visible indicator (glow or highlight)

### P3: Port Inspector Panel (oscilla-animator-v2-2s4)
- [ ] Port Inspector appears in sidebar when port selected
- [ ] Shows port name prominently
- [ ] Shows port direction (Input/Output)
- [ ] Shows port type (e.g., Signal<float>, Field<vec2>)
- [ ] For connected inputs: shows source "← BlockName.portName"
- [ ] For connected inputs: Disconnect button present and functional
- [ ] For unconnected inputs: shows default source info
- [ ] For outputs: lists all connected blocks "→ BlockName.portName"
- [ ] Shows parent block name with "View Block" navigation

## Technical Requirements

### Type Safety
- [ ] TypeScript compiles without errors (`npm run typecheck`)
- [ ] All new observables/actions properly typed
- [ ] PortRef type defined if not exists

### Code Quality
- [ ] No console errors in browser
- [ ] MobX observer pattern used for reactive updates
- [ ] Event handlers properly memoized

### Test Coverage
- [ ] Existing tests pass (`npm run test`)
- [ ] SelectionStore port selection tested

## Runtime Verification

### Port Visualization
1. Load any patch with multiple blocks
2. Verify port labels visible next to handles
3. Verify connected ports look different from unconnected
4. Hover port - tooltip appears with type info

### Port Selection
1. Click on a port handle
2. Verify port gets selected (visual feedback)
3. Verify Port Inspector appears in sidebar
4. Click on different port - selection moves
5. Click on block body - port deselects, block selects
6. Click on edge - port deselects, edge selects

### Port Inspector
1. Select an input port that IS connected
   - Verify shows source block.port
   - Click Disconnect - edge removed
2. Select an input port that is NOT connected
   - Verify shows default source info
3. Select an output port with connections
   - Verify lists all connected targets
4. Click "View Block" - parent block gets selected

## Exit Criteria

Sprint is COMPLETE when:
1. All acceptance criteria checked off
2. TypeScript compiles
3. Tests pass
4. Manual runtime verification done
5. No blocking bugs discovered
