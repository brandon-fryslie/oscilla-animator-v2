# Sprint: port-foundation - Port Visualization & Port Inspector
Generated: 2026-01-20T06:40:00Z
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Improve port visualization and add port selection/inspection capabilities. This is foundational work that other sprints depend on.

## Scope

**Beads covered:**
- oscilla-animator-v2-vr6: Improved port visualization
- oscilla-animator-v2-2s4: Port Inspector panel

**Deliverables:**
1. Enhanced port handles with visible labels and larger click targets
2. Port selection in SelectionStore
3. Port Inspector panel in BlockInspector

## Work Items

### P1: Enhanced Port Visualization
**Bead**: oscilla-animator-v2-vr6

**Current state (OscillaNode.tsx:84-98)**:
- 10x10px handles
- Type color coding
- Tooltip only for port info
- No visible labels

**Target state**:
- 16x16px handles (larger click target)
- Port label visible next to each handle
- Type color remains
- Clear connected vs unconnected visual state
- Tooltip for detailed type info

**Implementation approach**:
1. Update Handle styles in OscillaNode.tsx
2. Add port label element next to each handle
3. Add CSS class for connected/unconnected state
4. Pass connection status through PortData

**Acceptance Criteria:**
- [ ] Port handles are at least 16x16px
- [ ] Port label is visible next to each handle (input labels on left, output on right)
- [ ] Connected ports have distinct visual style (e.g., filled vs hollow)
- [ ] Unconnected ports show default source indicator clearly
- [ ] Type color coding preserved
- [ ] Tooltips still work for detailed info

**Files to modify:**
- `src/ui/reactFlowEditor/OscillaNode.tsx` - Handle sizing and labels
- `src/ui/reactFlowEditor/nodes.ts` - Add connection status to PortData
- `src/ui/reactFlowEditor/ReactFlowEditor.css` - Port styles

---

### P2: Port Selection Support
**Prerequisite for Port Inspector**

**Current SelectionStore state**:
```typescript
selectedBlockId: BlockId | null
selectedEdgeId: string | null
previewType: string | null
```

**Target state**:
```typescript
selectedBlockId: BlockId | null
selectedEdgeId: string | null
selectedPort: PortRef | null  // { blockId, portId, direction }
previewType: string | null
```

**Implementation approach**:
1. Add `selectedPort` observable to SelectionStore
2. Add `selectPort(blockId, portId, direction)` action
3. Clear port selection when block or edge selected (mutual exclusion)
4. Add click handler on port handles in OscillaNode

**Acceptance Criteria:**
- [ ] SelectionStore has `selectedPort` observable
- [ ] `selectPort(blockId, portId, direction)` action exists
- [ ] Clicking port handle selects the port
- [ ] Selecting block/edge clears port selection
- [ ] Selecting port clears block/edge selection
- [ ] Port selection visible in handle (e.g., glow effect)

**Files to modify:**
- `src/stores/SelectionStore.ts` - Add port selection
- `src/ui/reactFlowEditor/OscillaNode.tsx` - Port click handler
- `src/types/index.ts` - PortRef type if not exists

---

### P3: Port Inspector Panel
**Bead**: oscilla-animator-v2-2s4

**Current BlockInspector modes**:
1. Block selected → BlockDetails
2. Edge selected → EdgeInspector
3. Type preview → TypePreview
4. Nothing → NoSelection

**Target**: Add 5th mode for port selection

**Port Inspector content**:
```
┌─────────────────────────────────────┐
│ [PORT]                              │
│ phase                               │
│ Input • Signal<phase>               │
├─────────────────────────────────────┤
│ CONNECTION                          │
│ ← InfiniteTimeRoot.phaseA           │
│ [Disconnect]                        │
├─────────────────────────────────────┤
│ PARENT BLOCK                        │
│ FieldPulse (block_3)                │
│ [View Block]                        │
└─────────────────────────────────────┘

OR (unconnected input):

┌─────────────────────────────────────┐
│ [PORT]                              │
│ base                                │
│ Input • Signal<float>               │
├─────────────────────────────────────┤
│ DEFAULT SOURCE                      │
│ 0.35 (constant)                     │
├─────────────────────────────────────┤
│ NOT CONNECTED                       │
│ [Connect to...]                     │
├─────────────────────────────────────┤
│ PARENT BLOCK                        │
│ FieldPulse (block_3)                │
│ [View Block]                        │
└─────────────────────────────────────┘

OR (output):

┌─────────────────────────────────────┐
│ [PORT]                              │
│ value                               │
│ Output • Field<float>               │
├─────────────────────────────────────┤
│ CONNECTIONS (2)                     │
│ → HsvToRgb.hue                      │
│ → RenderInstances2D.size            │
├─────────────────────────────────────┤
│ PARENT BLOCK                        │
│ FieldPulse (block_3)                │
│ [View Block]                        │
└─────────────────────────────────────┘
```

**Implementation approach**:
1. Add PortInspector component in BlockInspector.tsx
2. Check for selectedPort in BlockInspector observer
3. Show port details, connection info, parent block link
4. For inputs: show connection OR default source
5. For outputs: list all connections

**Acceptance Criteria:**
- [ ] Port Inspector appears when port is selected
- [ ] Shows port name, direction (Input/Output), type
- [ ] For connected inputs: shows source block.port
- [ ] For unconnected inputs: shows default source
- [ ] For outputs: lists all blocks connected to this output
- [ ] "View Block" button navigates to parent block
- [ ] Disconnect button removes edge (for connected inputs)

**Files to modify:**
- `src/ui/components/BlockInspector.tsx` - Add PortInspector mode

## Dependencies

No external dependencies. This sprint is foundational.

## Risks

1. **Port click vs drag conflict**: Clicking port might initiate connection drag. May need modifier key (e.g., Shift+click to select).
   - Mitigation: Test ReactFlow behavior, add modifier if needed

2. **Label spacing**: Visible labels might crowd node.
   - Mitigation: Use smaller font, abbreviate long names

## Verification

### Automated
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Tests pass (`npm run test`)

### Manual
- [ ] Load patch, verify port labels visible
- [ ] Click port, verify Port Inspector shows
- [ ] Check input with connection shows source
- [ ] Check unconnected input shows default source
- [ ] Check output lists all consumers
- [ ] Disconnect button works
- [ ] View Block navigates correctly

## Files Summary

**New files:**
- None (all within existing files)

**Modified files:**
- `src/stores/SelectionStore.ts`
- `src/ui/reactFlowEditor/OscillaNode.tsx`
- `src/ui/reactFlowEditor/nodes.ts`
- `src/ui/reactFlowEditor/ReactFlowEditor.css`
- `src/ui/components/BlockInspector.tsx`
- `src/types/index.ts` (if PortRef needed)
