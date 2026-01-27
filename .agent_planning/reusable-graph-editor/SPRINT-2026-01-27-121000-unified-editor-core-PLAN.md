# Sprint: unified-editor-core - Unified Graph Editor Core Component

**Generated:** 2026-01-27-121000
**Confidence:** HIGH: 3, MEDIUM: 2, LOW: 0
**Status:** PARTIALLY READY
**Source:** EVALUATION-2026-01-27-120000.md

## Sprint Goal

Extract a reusable `GraphEditorCore` component from ReactFlowEditor that works with any GraphDataAdapter, then migrate both editors to use it.

## Scope

**Deliverables:**
- GraphEditorCore component with adapter-based data source
- UnifiedNode component replacing both OscillaNode and InternalBlockNode
- Migration of ReactFlowEditor to use GraphEditorCore
- Migration of CompositeEditor to use GraphEditorCore

## Work Items

### P0 [HIGH] Extract GraphEditorCore Component

**Dependencies:** Sprint adapter-interface complete
**Spec Reference:** ReactFlowEditor.tsx architecture
**Status Reference:** EVALUATION - ReactFlowEditor feature list

#### Description

Create a new `GraphEditorCore` component that encapsulates all ReactFlow rendering logic but receives its data through a GraphDataAdapter. This component should:
- Accept adapter via props
- Handle all ReactFlow callbacks (onNodesChange, onEdgesChange, onConnect)
- Manage local ReactFlow state (nodes, edges)
- Set up MobX reactions on adapter.blocks/edges
- Support all existing features via optional feature flags

#### Acceptance Criteria

- [ ] Component in `src/ui/graphEditor/GraphEditorCore.tsx`
- [ ] Props include `adapter: GraphDataAdapter<any>`
- [ ] Props include feature flags: `enableParamEditing`, `enableDebugMode`, etc.
- [ ] Component renders ReactFlow with Background, Controls, MiniMap
- [ ] MobX reaction syncs adapter changes to ReactFlow state
- [ ] onNodesChange persists positions via adapter.setBlockPosition
- [ ] onNodesChange removes blocks via adapter.removeBlock
- [ ] onEdgesChange removes edges via adapter.removeEdge
- [ ] onConnect creates edges via adapter.addEdge
- [ ] Connection validation uses adapter + registry
- [ ] Auto-arrange layout available via imperative handle

#### Technical Notes

Extract from ReactFlowEditor.tsx (lines 133-636). Key pieces:
- Lines 143-166: State setup (useNodesState, useEdgesState)
- Lines 169-182: Event handlers (createNodesChangeHandler, etc.)
- Lines 294-338: Auto-arrange handler
- Lines 344-418: Initial layout effect
- Lines 420-453: Structure reaction effect

Feature flags pattern:
```typescript
interface GraphEditorCoreProps {
  adapter: GraphDataAdapter;
  // Feature flags
  enableParamEditing?: boolean;  // default: false
  enableDebugMode?: boolean;     // default: false
  enableContextMenus?: boolean;  // default: true
  enableAutoArrange?: boolean;   // default: true
  enableMinimap?: boolean;       // default: true
}
```

---

### P0 [HIGH] Create UnifiedNode Component

**Dependencies:** GraphEditorCore structure defined
**Spec Reference:** OscillaNode.tsx full feature set
**Status Reference:** EVALUATION - Duplicated Node Rendering section

#### Description

Create a unified node component that can render blocks from any adapter. It should support all features from OscillaNode with feature flags for optional capabilities.

#### Acceptance Criteria

- [ ] Component in `src/ui/graphEditor/UnifiedNode.tsx`
- [ ] Renders type-colored port handles
- [ ] Renders port labels with positioning
- [ ] Renders block label and displayName
- [ ] Shows port count summary
- [ ] Optional: inline parameter editing (via feature flag)
- [ ] Optional: default source editing (via feature flag)
- [ ] Optional: displayName inline editing (via feature flag)
- [ ] Port hover triggers PortInfoPopover
- [ ] Port context menu works
- [ ] Uses same visual styling as OscillaNode
- [ ] No direct PatchStore dependency

#### Technical Notes

Extract from OscillaNode.tsx (429 lines). Key considerations:
- Node data must come from adapter-provided BlockLike, not PatchStore Block
- Parameter editing needs adapter.updateBlockParams (if available)
- DisplayName editing needs adapter.updateBlockDisplayName (if available)
- Default source editing needs adapter.updateInputPort (if available)

Feature detection pattern:
```typescript
const UnifiedNode = ({ data, adapter }) => {
  const canEditParams = typeof adapter.updateBlockParams === 'function';
  const canEditDisplayName = typeof adapter.updateBlockDisplayName === 'function';

  return (
    <div>
      {canEditParams && data.params.length > 0 && (
        <ParameterControls ... />
      )}
    </div>
  );
};
```

---

### P0 [HIGH] Migrate ReactFlowEditor to Use Core

**Dependencies:** GraphEditorCore, UnifiedNode, PatchStoreAdapter
**Spec Reference:** Existing ReactFlowEditor behavior
**Status Reference:** EVALUATION - ReactFlowEditor features (all must work)

#### Description

Refactor ReactFlowEditor to be a thin wrapper around GraphEditorCore with PatchStoreAdapter. All existing functionality must be preserved.

#### Acceptance Criteria

- [ ] ReactFlowEditor creates PatchStoreAdapter from stores
- [ ] ReactFlowEditor passes adapter to GraphEditorCore
- [ ] All feature flags enabled for main editor
- [ ] Debug panel still works
- [ ] Context menus still work
- [ ] Selection sync still works
- [ ] Port highlight still works
- [ ] Auto-arrange still works
- [ ] All existing tests pass
- [ ] No visual changes to main editor

#### Technical Notes

The refactored ReactFlowEditor.tsx should be ~100 lines instead of ~650 lines.

```typescript
export const ReactFlowEditor: React.FC<ReactFlowEditorProps> = ({ onEditorReady }) => {
  const { patch, layout, selection, debug, portHighlight, diagnostics } = useStores();

  const adapter = useMemo(
    () => new PatchStoreAdapter(patch, layout),
    [patch, layout]
  );

  return (
    <GraphEditorCore
      adapter={adapter}
      enableParamEditing
      enableDebugMode
      enableContextMenus
      // Selection/debug/portHighlight via context or props
      onEditorReady={onEditorReady}
    />
  );
};
```

---

### P1 [MEDIUM] Migrate CompositeInternalGraph to Use Core

**Dependencies:** GraphEditorCore, UnifiedNode, CompositeStoreAdapter
**Spec Reference:** CompositeInternalGraph current behavior
**Status Reference:** EVALUATION - CompositeInternalGraph features (minimal)

#### Description

Replace CompositeInternalGraph with GraphEditorCore + CompositeStoreAdapter. This enables all the features that were previously missing.

#### Acceptance Criteria

- [ ] CompositeEditor uses GraphEditorCore with CompositeStoreAdapter
- [ ] Composite editor now has inline parameter editing (P0 feature parity)
- [ ] Composite editor now has context menus
- [ ] Composite editor now has auto-arrange
- [ ] Drag-drop block addition still works
- [ ] Port exposure panel still works alongside graph
- [ ] Visual styling matches current CompositeEditor
- [ ] CompositeInternalGraph.tsx deleted

#### Technical Notes

In CompositeEditor.tsx, replace:
```tsx
<CompositeInternalGraph />
```

With:
```tsx
<GraphEditorCore
  adapter={compositeAdapter}
  enableParamEditing={false}  // Composite blocks don't edit params in-place
  enableDebugMode={false}
  enableContextMenus
/>
```

**Unknown:** Does composite editor need param editing at all? The current CompositeInternalGraph doesn't have it, and composites are templates (params set when instantiated). Research needed.

---

### P1 [MEDIUM] Extract and Share Context Menu Components

**Dependencies:** GraphEditorCore structure
**Spec Reference:** menus/BlockContextMenu, EdgeContextMenu, PortContextMenu
**Status Reference:** EVALUATION - Context menus missing from composite

#### Description

The context menus currently import from stores directly. They need to work with adapters. Extract shared logic and make menus work with both editors.

#### Acceptance Criteria

- [ ] BlockContextMenu works with GraphDataAdapter
- [ ] EdgeContextMenu works with GraphDataAdapter
- [ ] PortContextMenu works with GraphDataAdapter
- [ ] Quick connect suggestions work with adapter.blocks/edges
- [ ] "Add Block" works with adapter.addBlock
- [ ] Combine mode cycling works (when adapter supports it)
- [ ] Menus gracefully degrade when adapter lacks optional methods

#### Technical Notes

Current PortContextMenu.tsx (line 230) uses `useStores()` directly:
```typescript
const { patch, layout, selection } = useStores();
```

Need to change to receive adapter via context or props:
```typescript
const { adapter } = useGraphEditorContext();
```

This requires a new context for graph editor state, or passing adapter through props.

**Unknown:** Best pattern for providing adapter to menus - React context vs prop drilling? Research the tradeoffs.

## Dependencies

- **Blocked by:** Sprint adapter-interface (all adapters must exist)

## Risks

- **Risk:** Feature regression in ReactFlowEditor during migration
  - **Mitigation:** Comprehensive test coverage before refactoring; feature flag gradual rollout

- **Risk:** Performance regression from additional abstraction layer
  - **Mitigation:** Benchmark critical paths (node render, edge update); memoize adapter-derived data

- **Risk:** Context menus tightly coupled to PatchStore
  - **Mitigation:** Research phase for menu refactoring; may need follow-up sprint
