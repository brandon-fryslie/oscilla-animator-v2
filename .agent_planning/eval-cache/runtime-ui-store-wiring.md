# Runtime Findings: UI Store Wiring

**Scope**: React components with MobX observer pattern  
**Last Updated**: 2026-01-09  
**Confidence**: FRESH (code inspection only - manual browser testing pending)

## Component Architecture

### DomainsPanel
- React functional component with observer()
- Observes: `rootStore.patch.patch`
- Local state: `expandedDomains` (Set<string>)
- Extracts domain info from DomainN/GridDomain blocks
- Displays as expandable cards with domain parameters

### BlockLibrary
- React functional component with observer()
- Local state: `searchQuery` (string), `expandedCategories` (Set<BlockCategory>)
- Click handler: `rootStore.selection.setPreviewType(type.type)`
- Double-click handler: `rootStore.patch.addBlock(type, {})` then `rootStore.selection.selectBlock(blockId)`
- Search filters by type name, label, and description

### BlockInspector
- React functional component with observer()
- Observes: `rootStore.selection.previewType`, `rootStore.selection.selectedBlockId`, `rootStore.patch.patch`
- Three rendering modes:
  1. Preview mode (previewType set): Shows "[TYPE PREVIEW]" header with type info
  2. Block selection mode: Shows block details with ports and connections
  3. No selection: Shows "No block selected" message
- Connection navigation: Click connection → `rootStore.selection.selectBlock(blockId)`
- Preview takes precedence over selection

### TableView
- React functional component with observer()
- Observes: `rootStore.patch.patch`, `rootStore.selection.selectedBlockId`
- Local state: `expandedBlocks` (Set<BlockId>)
- Click row: `rootStore.selection.selectBlock(id)`
- Visual highlighting via conditional styling on selected row
- Shows block type, input/output counts, connections when expanded

### ConnectionMatrix
- React functional component with observer()
- Already converted prior to this work
- Observes: `rootStore.patch.patch`
- Uses MUI DataGrid for rendering

## Store Integration Patterns

### Selection State Flow
1. User action (click, double-click)
2. Component calls `rootStore.selection.selectBlock(id)` or `setPreviewType(type)`
3. MobX observable updates
4. All observer components re-render reactively
5. Visual feedback (highlighting, inspector update) happens automatically

### Preview Mode Flow
1. Click block type in Library → `rootStore.selection.setPreviewType(type)`
2. Inspector observes `previewType` change
3. Inspector switches to TypePreview component
4. Selecting a block clears preview (mutually exclusive)

### Add Block Flow
1. Double-click in Library → `rootStore.patch.addBlock(type, {})`
2. Returns new blockId
3. Immediately calls `rootStore.selection.selectBlock(blockId)`
4. TableView observes patch change (new block appears)
5. Inspector observes selection change (shows new block details)

## Data Flow Characteristics

### Single Source of Truth
- Selection state: `rootStore.selection` only
- Patch state: `rootStore.patch` only
- No duplicate state in components (verified)

### Reactivity Pattern
- All components use `observer()` from mobx-react-lite
- Computed properties in SelectionStore derive from PatchStore
- No manual subscriptions or listeners
- MobX handles reactivity automatically

### Local UI State
- Expanded/collapsed: Managed locally with `useState`
- Search queries: Local component state
- Hover states: Local component state
- Rationale: UI-only state doesn't need global store

## Integration with Vanilla DOM

### React Roots Strategy
- TabbedContent (vanilla) creates containers
- Each React component gets own root via `createRoot(container)`
- Multiple React roots coexist in vanilla layout
- No cleanup issues observed (roots are stable)

### Boundary Pattern
```typescript
contentFactory: (container) => {
  const root = createRoot(container);
  root.render(React.createElement(Component as any));
}
```

## Verification Notes

### Code Inspection (Complete)
- ✅ All components correctly implement observer pattern
- ✅ Store wiring follows MobX best practices
- ✅ No data duplication across stores
- ✅ TypeScript compilation clean
- ✅ All tests passing

### Manual Testing (Pending)
- ⚠️ Runtime behavior needs browser verification
- ⚠️ Visual feedback (highlighting, preview display)
- ⚠️ Data flow end-to-end
- ⚠️ Error handling and edge cases

## Known Limitations

### Environment Constraints
- Cannot perform browser automation testing
- Chrome DevTools not available in eval environment
- Manual human testing required for runtime verification

### Minor Implementation Notes
- BlockInspector uses inline styles instead of InspectorContainer component (acceptable)
- React.createElement cast to `any` in main.ts (TypeScript workaround)
- MobX warnings in test env (expected, doesn't affect runtime)

## Architecture Quality

### Strengths
- Clean separation: UI state vs domain state
- Consistent observer pattern application
- Type safety maintained throughout
- No architectural anti-patterns
- Single source of truth enforced

### Areas for Future Enhancement
- Consolidate to single React root (currently multiple roots)
- Add e2e tests for interaction flows
- Add smoke tests with browser automation
- Consider React error boundaries

## Usage for Future Evaluations

When evaluating UI interaction changes:
1. Verify observer pattern still applied correctly
2. Check for state duplication (architectural invariant)
3. Verify click handlers wire to correct store methods
4. Manual browser testing required for runtime behavior
5. Use this as reference for expected patterns
