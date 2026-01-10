# TODO: Wire UI to MobX Stores

**Goal**: Make the UI actually functional for editing patches

## Decisions

- **React + MobX** - Convert vanilla DOM components to React with `mobx-react-lite`
- **Material UI** - Use MUI components (already installed: @mui/material, @mui/x-data-grid)
- Auto-recompile on patch changes (debounced)

## Current State (NOTHING IS WIRED)

- `main.ts` uses `rootStore` for viewport, playback, diagnostics, and loads patch
- UI components (TableView, BlockLibrary, BlockInspector, etc.) are **vanilla DOM classes**
- UI components receive `patch` data directly via `setPatch()` - NOT connected to stores
- No click handlers wire through to store actions
- No selection state reflected in UI
- No way to add/remove blocks through UI
- **These are all dead-end implementations that need to be replaced with React**

## Existing Components That Need React Conversion

| Component | Current | Needs |
|-----------|---------|-------|
| TableView | Vanilla DOM | React + MUI DataGrid + observe PatchStore |
| BlockLibrary | Vanilla DOM | React + MUI + observe block registry + wire addBlock |
| BlockInspector | Vanilla DOM | React + MUI + observe SelectionStore |
| ConnectionMatrixWrapper | Vanilla DOM | React + MUI + observe PatchStore |
| DomainsPanel | Vanilla DOM | React + MUI + observe PatchStore |
| TabbedContent | Vanilla DOM | React + MUI Tabs |
| InspectorContainer | React ✅ | Already React, just needs wiring |

## TODO List

### 0. Convert Existing Components to React
- [ ] TableView → React component observing `rootStore.patch`
- [ ] BlockLibrary → React component, click → `rootStore.patch.addBlock()`
- [ ] BlockInspector → React component observing `rootStore.selection`
- [ ] ConnectionMatrixWrapper → React component observing `rootStore.patch`
- [ ] DomainsPanel → React component observing `rootStore.patch`
- [ ] TabbedContent → React component using MUI Tabs
- [ ] main.ts → React app root with StoreProvider

### 1. Wire Selection
- [ ] TableView: click row → `rootStore.selection.selectBlock()`
- [ ] BlockInspector: observe `rootStore.selection.selectedBlock`
- [ ] ConnectionMatrix: click cell → `rootStore.selection.selectEdge()`
- [ ] Visual feedback: highlight selected row/block

### 2. Wire Block Library → Add Blocks
- [ ] BlockLibrary: click block type → `rootStore.patch.addBlock(type)`
- [ ] After add, select the new block
- [ ] Recompile patch after add

### 3. Wire Delete
- [ ] Keyboard: Delete key → remove selected block/edge
- [ ] Context menu or button for delete
- [ ] Recompile after delete

### 4. Wire Inspector → Edit Params
- [ ] BlockInspector: show params for selected block
- [ ] Edit param → `rootStore.patch.updateBlockParams()`
- [ ] Recompile after param change

### 5. Wire Diagnostics
- [ ] Compilation errors → `rootStore.diagnostics.addError()`
- [ ] Show errors in UI (DiagnosticsConsole or similar)
- [ ] Clear diagnostics before each compile

### 6. Wire Edge Creation
- [ ] Some UI to create edges (click output → click input?)
- [ ] `rootStore.patch.addEdge(from, to)`
- [ ] Recompile after edge add

### 7. Make Components Reactive
- [ ] Components need to observe store changes (MobX autorun or convert to React)
- [ ] Currently they only update when `setPatch()` is called manually

### 8. Minimal Visual Node View (Optional but needed for sanity)
- [ ] Something that shows blocks as boxes with connections
- [ ] Even a simple SVG/canvas view would help
- [ ] Doesn't need to be the fancy linear editor yet

## Open Questions

- What's the minimal node view we can build quickly?

## Dependencies

- Stores: ✅ Done
- SelectionStore emphasis: ✅ Done
- InspectorContainer: ✅ Done
- SettingsToolbar: ❌ Not ported yet
- DiagnosticsConsole: ❌ Not ported yet
