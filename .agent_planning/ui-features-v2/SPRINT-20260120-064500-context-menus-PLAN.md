# Sprint: context-menus - Context Menus for Graph Elements
Generated: 2026-01-20T06:45:00Z
Confidence: MEDIUM
Status: RESEARCH REQUIRED

## Sprint Goal

Add right-click context menus for blocks, ports, and edges in the ReactFlow editor.

## Known Elements

- ReactFlow provides `onNodeContextMenu`, `onEdgeContextMenu` callbacks
- Can add custom context menu handlers on port handles
- Actions will use existing PatchStore methods

## Unknowns to Resolve

1. **Context menu library choice**
   - Option A: Build custom (simple div with absolute positioning)
   - Option B: Use existing library (radix-ui, react-contexify, etc.)
   - Need to research: What's already in the project's dependencies?

2. **Menu positioning**
   - How to position menu at click location
   - Handle viewport boundaries (menu near edge of screen)

3. **Port context menu trigger**
   - ReactFlow handles don't have native context menu support
   - May need wrapper element around Handle component

## Tentative Deliverables

**Bead**: oscilla-animator-v2-5mg

- Context menu component (reusable)
- Block context menu (duplicate, delete, disconnect all, center)
- Port context menu (disconnect, connect to..., reset default)
- Edge context menu (delete, navigate source/target)

## Research Tasks

- [ ] Check package.json for existing UI libraries that include context menus
- [ ] Prototype context menu positioning approach
- [ ] Test ReactFlow handle context menu capability
- [ ] Design menu item interface for consistency

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
