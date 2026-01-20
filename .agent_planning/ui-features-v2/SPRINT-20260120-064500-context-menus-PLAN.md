# Sprint: context-menus - Context Menus for Graph Elements
Generated: 2026-01-20T06:45:00Z
Updated: 2026-01-20T08:45:00Z
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Add right-click context menus for blocks, ports, and edges in the ReactFlow editor.

## Known Elements

- ReactFlow provides `onNodeContextMenu`, `onEdgeContextMenu`, `onPaneContextMenu` callbacks
- MUI (@mui/material) already installed - has Menu component
- Actions will use existing PatchStore methods

## Research Findings (2026-01-20)

### Context Menu Library: MUI Menu
MUI is already installed (`@mui/material: ^7.3.7`). Use MUI Menu component for consistency with DataGrid.

### Menu Positioning Pattern (from ReactFlow docs)
```javascript
const onNodeContextMenu = useCallback((event, node) => {
  event.preventDefault();
  const pane = ref.current.getBoundingClientRect();
  setMenu({
    id: node.id,
    top: event.clientY < pane.height - 200 && event.clientY,
    left: event.clientX < pane.width - 200 && event.clientX,
    right: event.clientX >= pane.width - 200 && pane.width - event.clientX,
    bottom: event.clientY >= pane.height - 200 && pane.height - event.clientY,
  });
}, []);
```

### Port Context Menu
Add `onContextMenu` handler directly to Handle component in OscillaNode. ReactFlow Handles are DOM elements that support standard events.

### Closing Menu
Use `onPaneClick` to close menu when clicking elsewhere.

## Tentative Deliverables

**Bead**: oscilla-animator-v2-5mg

- Context menu component (reusable)
- Block context menu (duplicate, delete, disconnect all, center)
- Port context menu (disconnect, connect to..., reset default)
- Edge context menu (delete, navigate source/target)

## Research Tasks (COMPLETED)

- [x] Check package.json for existing UI libraries → MUI installed
- [x] Prototype context menu positioning approach → ReactFlow docs pattern
- [x] Test ReactFlow handle context menu capability → Standard DOM events work
- [x] Design menu item interface → Use MUI Menu/MenuItem components

## Tentative Implementation

### Context Menu Component
```typescript
interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  action: () => void;
  disabled?: boolean;
  danger?: boolean;  // Red styling for destructive actions
}

interface ContextMenuProps {
  items: MenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}
```

### Block Menu Items
| Action | Label | Notes |
|--------|-------|-------|
| Duplicate | "Duplicate Block" | Creates copy with new ID |
| Delete | "Delete Block" | Destructive, removes edges too |
| Disconnect All | "Disconnect All" | Removes all edges |
| Center | "Center in View" | Uses fitView on single node |

### Port Menu Items (Input)
| Action | Label | Notes |
|--------|-------|-------|
| Disconnect | "Disconnect" | Only if connected |
| Connect | "Connect to..." | Opens picker |
| Reset | "Reset to Default" | Clears connection |

### Port Menu Items (Output)
| Action | Label | Notes |
|--------|-------|-------|
| Disconnect All | "Disconnect All" | Removes all edges from this output |
| View Connections | "View Connections" | Could select port to show in inspector |

### Edge Menu Items
| Action | Label | Notes |
|--------|-------|-------|
| Delete | "Delete Connection" | Destructive |
| Go to Source | "Go to Source" | Selects source block |
| Go to Target | "Go to Target" | Selects target block |

## Exit Criteria (to reach HIGH confidence)

- [ ] Context menu library/approach chosen
- [ ] Menu positioning strategy validated with prototype
- [ ] Port context menu feasibility confirmed
- [ ] All menu items listed with action implementations

## Dependencies

- None - can be done in parallel with Sprint 1

## Risks

1. **Port handle context menu**: May not be possible to add to ReactFlow Handle
   - Mitigation: Wrap Handle in custom component with context menu

2. **Menu z-index conflicts**: Menu might appear behind other UI
   - Mitigation: Use portal to render at document body level

## Files to Modify (tentative)

**New files:**
- `src/ui/components/ContextMenu.tsx`
- `src/ui/reactFlowEditor/menus/BlockContextMenu.tsx`
- `src/ui/reactFlowEditor/menus/PortContextMenu.tsx`
- `src/ui/reactFlowEditor/menus/EdgeContextMenu.tsx`

**Modified files:**
- `src/ui/reactFlowEditor/ReactFlowEditor.tsx` - Context menu handlers
- `src/ui/reactFlowEditor/OscillaNode.tsx` - Port context menu handlers
