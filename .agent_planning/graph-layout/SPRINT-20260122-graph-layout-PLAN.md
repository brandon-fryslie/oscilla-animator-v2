# Plan: Fix React Flow Graph Layout (Root Cause)

## Problem Analysis

Two bugs with a shared root cause:

### Bug 1: Flash of Wrong Positions on Initial Render
The graph renders nodes in a naive grid layout (100px spacing, wrapping at 1000px) via `syncPatchToReactFlow()`, then 100ms later the `useEffect` fires `handleAutoArrange()` which runs ELK layout and repositions everything. Users see the wrong layout for ~200ms.

### Bug 2: Graph Re-layouts on Every Patch Mutation
A MobX reaction in `setupPatchToReactFlowReaction()` watches `blockCount` and `edgeCount`. When you add/remove an edge, it calls `syncPatchToReactFlow()` which **replaces all nodes with new grid-positioned nodes**, destroying user-set positions. Then the `useEffect` watching `nodes.length` triggers another auto-arrange.

### Root Cause
The sync layer conflates **graph structure** (which blocks/edges exist) with **visual layout** (where nodes are positioned). Every structural change triggers a full rebuild of ReactFlow nodes with naive grid positions, discarding any computed or user-set positions.

## Architecture Fix

Separate concerns into three layers:
1. **Structure sync** - keeps ReactFlow nodes/edges in sync with PatchStore (adds/removes nodes, updates data), but **preserves existing positions**
2. **Layout computation** - ELK layout runs once on initial load to compute positions, then only on explicit user request (Auto Arrange button)
3. **Position persistence** - node positions are stored in a dedicated `LayoutStore` (or in a `Map<BlockId, Position>` within the editor), separate from PatchStore (which correctly owns only graph topology)

## Implementation Steps

### Step 1: Create `LayoutStore` for Position Persistence

Create a new `LayoutStore` that owns node positions, separate from PatchStore (positions are UI state, not graph topology).

**File:** `src/stores/LayoutStore.ts`

```typescript
interface NodePosition { x: number; y: number }

class LayoutStore {
  positions: Map<BlockId, NodePosition>;  // Observable map

  setPosition(blockId, pos): void;
  setPositions(map: Map<BlockId, NodePosition>): void;
  getPosition(blockId): NodePosition | undefined;
  removePosition(blockId): void;
  clear(): void;
}
```

Register in `RootStore`.

### Step 2: Rewrite `syncPatchToReactFlow` → `reconcileNodes`

Replace the current "nuke and rebuild" sync with a **reconciliation** approach:

```typescript
function reconcileNodes(
  patch: Patch,
  currentNodes: Node[],
  layoutStore: LayoutStore,
  diagnostics: DiagnosticsStore
): { nodes: Node[]; edges: ReactFlowEdge[] } {
  // 1. Build set of current block IDs in patch
  // 2. For each block in patch:
  //    - If node exists: UPDATE data in-place (preserve position)
  //    - If node doesn't exist: CREATE with position from LayoutStore
  //      (or a sensible default if no stored position)
  // 3. For removed blocks: filter out nodes not in patch
  // 4. Rebuild edges from patch edges (edges don't have position)
}
```

Key difference: **positions are never overwritten** during reconciliation.

### Step 3: Compute Layout Before First Render (Eliminate Flash)

Instead of rendering with grid positions then correcting, compute ELK layout **before** setting nodes:

```typescript
// In initial useEffect:
async function initializeLayout() {
  // 1. Build nodes from patch (with placeholder positions)
  const { nodes, edges } = buildNodesAndEdges(patch);

  // 2. Compute ELK layout (async but fast for <50 nodes)
  const { nodes: layoutedNodes } = await getLayoutedElements(nodes, edges);

  // 3. Store positions in LayoutStore
  for (const node of layoutedNodes) {
    layoutStore.setPosition(node.id, node.position);
  }

  // 4. Set state (first render will be correct)
  setNodes(layoutedNodes);
  setEdges(edges);
}
```

To prevent any visible flash, the component should render nothing (or a loading state) until layout is computed.

### Step 4: Remove Auto-Layout on Mutation

Remove the `useEffect` that watches `nodes.length` and triggers auto-arrange. The only triggers for layout should be:
- Initial load (Step 3)
- User clicks "Auto Arrange" button
- (Optional) User adds a new block — position it near the drop point or at a sensible empty location, but **don't re-layout everything**

### Step 5: Fix the MobX Reaction (Structure-Only Sync)

Replace `setupPatchToReactFlowReaction` with a reaction that reconciles without destroying positions:

```typescript
function setupStructureReaction(handle, layoutStore, diagnostics) {
  return reaction(
    () => ({
      blockCount: handle.patchStore.blocks.size,
      edgeCount: handle.patchStore.edges.length,
      // Could also track block IDs for finer granularity
    }),
    () => {
      // Reconcile: add/remove nodes, update data, but preserve positions
      const result = reconcileNodes(
        handle.patchStore.patch,
        getCurrentNodes(),
        layoutStore,
        diagnostics
      );
      handle.setNodes(result.nodes);
      handle.setEdges(result.edges);
    }
  );
}
```

### Step 6: Handle User-Initiated Position Changes

When the user drags a node in ReactFlow, persist the new position to `LayoutStore`:

```typescript
// In onNodesChange handler:
for (const change of changes) {
  if (change.type === 'position' && change.position) {
    layoutStore.setPosition(change.id, change.position);
  }
}
```

### Step 7: Smart New-Block Positioning

When a new block is added (not from initial load), position it intelligently without triggering a full re-layout:

- If dragged from library to a specific point: use that point
- If added via context menu or programmatically: find empty space near existing nodes (simple bounding box + offset algorithm)

### Step 8: Loading State (Prevent Flash)

Add a simple loading guard so the ReactFlow component isn't rendered until initial layout is computed:

```typescript
const [isInitialized, setIsInitialized] = useState(false);

// ... in initializeLayout, after layout computed:
setIsInitialized(true);

// In render:
if (!isInitialized) return <div className="graph-loading" />;
return <ReactFlow ... />;
```

## Files Modified

| File | Change |
|------|--------|
| `src/stores/LayoutStore.ts` | NEW - position persistence |
| `src/stores/RootStore.ts` | Register LayoutStore |
| `src/stores/index.ts` | Export LayoutStore |
| `src/ui/reactFlowEditor/sync.ts` | Rewrite to reconciliation approach |
| `src/ui/reactFlowEditor/ReactFlowEditor.tsx` | Remove auto-layout-on-mutation, add loading state, compute layout before first render |
| `src/ui/reactFlowEditor/layout.ts` | No changes needed (ELK logic is fine) |

## What This Fixes

1. **No flash**: Initial render waits for ELK layout, then shows correct positions immediately
2. **No re-layout on mutation**: Adding/removing edges or blocks preserves all existing node positions
3. **Positions persist**: User drag-and-drop positions survive patch mutations
4. **Auto Arrange still works**: Button remains for explicit user request to re-layout

## What This Does NOT Change

- PatchStore remains source of truth for graph **topology**
- ELK algorithm and configuration untouched
- Node/edge rendering logic unchanged
- Context menus, validation, debug panel all unchanged
