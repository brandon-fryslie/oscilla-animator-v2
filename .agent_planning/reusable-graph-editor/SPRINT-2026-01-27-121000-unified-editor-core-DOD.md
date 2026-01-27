# Definition of Done: unified-editor-core

**Generated:** 2026-01-27-121000
**Status:** PARTIALLY READY
**Plan:** SPRINT-2026-01-27-121000-unified-editor-core-PLAN.md

## Acceptance Criteria

### GraphEditorCore Component

- [ ] File exists at `src/ui/graphEditor/GraphEditorCore.tsx`
- [ ] Props include `adapter: GraphDataAdapter`
- [ ] Props include feature flag booleans
- [ ] Component renders ReactFlow canvas
- [ ] Background, Controls rendered
- [ ] MiniMap conditional on feature flag
- [ ] MobX reaction syncs adapter to ReactFlow state
- [ ] Position changes persist via adapter
- [ ] Block removal works via adapter
- [ ] Edge creation works via adapter
- [ ] Edge removal works via adapter
- [ ] Auto-arrange available via handle
- [ ] TypeScript compiles without errors

### UnifiedNode Component

- [ ] File exists at `src/ui/graphEditor/UnifiedNode.tsx`
- [ ] Port handles render with type colors
- [ ] Port labels position correctly
- [ ] Block label/displayName render
- [ ] Parameter controls conditional on flag + adapter support
- [ ] Default source controls conditional on flag + adapter support
- [ ] DisplayName editing conditional on adapter support
- [ ] Port hover shows popover
- [ ] Port context menu triggers
- [ ] Visual styling matches OscillaNode
- [ ] No hardcoded PatchStore imports

### ReactFlowEditor Migration

- [ ] ReactFlowEditor uses PatchStoreAdapter
- [ ] ReactFlowEditor uses GraphEditorCore
- [ ] All existing features work:
  - [ ] Inline param editing
  - [ ] Default source editing
  - [ ] DisplayName editing
  - [ ] Port info popover
  - [ ] Block context menu
  - [ ] Edge context menu
  - [ ] Port context menu with quick connect
  - [ ] Auto-arrange
  - [ ] Debug mode / edge hover
  - [ ] Selection sync
  - [ ] Port highlight
- [ ] All existing tests pass
- [ ] No visual regression

### CompositeEditor Migration

- [ ] CompositeEditor uses CompositeStoreAdapter
- [ ] CompositeEditor uses GraphEditorCore
- [ ] CompositeInternalGraph.tsx deleted
- [ ] Drag-drop block addition works
- [ ] Port exposure panel works
- [ ] Context menus now available
- [ ] Auto-arrange now available
- [ ] No visual regression

### Context Menus

- [ ] Menus work with adapter interface
- [ ] Menus gracefully degrade for missing features
- [ ] No direct PatchStore imports in menu components

## Exit Criteria (for MEDIUM confidence items)

### Migrate CompositeInternalGraph to Use Core

- [ ] **Question answered:** Should composite editor support param editing?
  - Research: Check what params mean in composite context (template vs instance)
  - Decision documented in implementation

### Extract and Share Context Menu Components

- [ ] **Question answered:** Context vs props for adapter injection?
  - Research: Review React patterns, consider bundle size, DX
  - Decision documented in implementation
