# Sprint: selection-editing - Selection Wiring & Basic Param Editing

**Generated:** 2026-01-18
**Confidence:** HIGH
**Status:** ✅ COMPLETE (verified 2026-01-21)

## Sprint Goal

Wire ReactFlow selection to SelectionStore and add editable param fields to BlockInspector.

## Scope

**Deliverables:**
1. Selection sync: Clicking a block in ReactFlow updates SelectionStore
2. Editable params: Number and text inputs for block parameters
3. DisplayName editing: Inline edit of block display name

## Work Items

### P0: Selection Wiring (ReactFlow → SelectionStore)

**Acceptance Criteria:**
- [x] Clicking a node in ReactFlow calls `rootStore.selection.selectBlock(blockId)`
- [x] Clicking canvas background clears selection (`selectBlock(null)`)
- [x] BlockInspector immediately shows the selected block when clicked in editor
- [x] Delete key still works (existing behavior preserved)

**Technical Notes:**
- Use ReactFlow's `onNodeClick` callback, not `onSelectionChange`
- Node ID is the BlockId (already true in current sync.ts)
- Add handler in ReactFlowEditor.tsx around line 187 (ReactFlow props)

**Implementation:**
```tsx
// In ReactFlowEditor.tsx
const handleNodeClick = useCallback(
  (_: React.MouseEvent, node: Node) => {
    rootStore.selection.selectBlock(node.id as BlockId);
  },
  []
);

const handlePaneClick = useCallback(() => {
  rootStore.selection.clearSelection();
}, []);

// Add to ReactFlow component:
// onNodeClick={handleNodeClick}
// onPaneClick={handlePaneClick}
```

### P1: Editable Block Params

**Acceptance Criteria:**
- [x] Number params show editable input (not JSON)
- [x] Text/string params show editable input
- [x] Editing a value calls `rootStore.patch.updateBlockParams()`
- [x] Changes are immediately reflected in the inspector
- [x] Const block value can be edited

**Technical Notes:**
- Create ParamField component that switches on value type
- Debounce inputs to avoid flooding store updates
- For Const blocks: the `value` param is the editable field
- Honor `uiHint` from InputDef if present, else infer from typeof

**Implementation approach:**
1. Replace JSON stringify with param-by-param rendering
2. Each param gets appropriate control (input, slider, etc.)
3. onChange → updateBlockParams with partial update

### P2: DisplayName Editing

**Acceptance Criteria:**
- [x] DisplayName shows as editable text field (or click-to-edit)
- [x] Empty displayName shows placeholder with block type
- [x] Editing calls `rootStore.patch.updateBlockDisplayName()`
- [x] Change is reflected immediately

**Technical Notes:**
- DisplayName is nullable (null = show type label)
- Simple text input at top of inspector
- Consider inline edit (double-click) vs always-visible input

## Dependencies

- ReactFlow API (already imported)
- rootStore available (already imported in both files)
- MUI TextField, Slider components (already in theme)

## Risks

| Risk | Mitigation |
|------|------------|
| Selection sync causes performance issues | Unlikely - single action call per click |
| Type coercion on param edit | Parse numbers explicitly, validate before update |
