# Implementation Context: Editor UI Sprint
Generated: 2026-01-27T15:02:00Z

## Key Files to Create

### `src/stores/CompositeEditorStore.ts`
MobX store managing composite editing state.

### `src/ui/components/CompositeEditor.tsx`
Main editor component with ReactFlow canvas.

### `src/ui/components/PortExposurePanel.tsx`
Panel for selecting which ports to expose.

### `src/ui/components/CompositeMetadataForm.tsx`
Form for name, label, category, description.

### `src/ui/dockview/panels/CompositeEditorPanel.tsx`
Dockview wrapper for CompositeEditor.

## Key Files to Modify

### `src/ui/components/BlockLibrary.tsx`
- Add "Create Composite" button
- Add "Composites" category section
- Add context menu for Edit/Delete

### `src/ui/dockview/DockviewProvider.tsx`
- Register CompositeEditorPanel
- Handle opening composite editor tabs

### `src/stores/RootStore.ts`
- Add CompositeEditorStore to root

## Existing Patterns to Follow

### Tab Management (from DockviewProvider.tsx)
```typescript
// Opening a new panel tab
dockview.addPanel({
  id: `composite-editor-${compositeId}`,
  component: 'compositeEditor',
  title: compositeName || 'New Composite',
  params: { compositeId },
});
```

### ReactFlow Editor Pattern (from ReactFlowEditor.tsx)
```typescript
// Key patterns to reuse:
// - Node rendering with OscillaNode
// - Edge creation with connection validation
// - Selection handling
// - Keyboard shortcuts
```

### MobX Store Pattern (from PatchStore.ts)
```typescript
// Key patterns:
// - @observable for state
// - @action for mutations
// - @computed for derived values
// - Snapshot for persistence
```

## Component Structure

```
CompositeEditorPanel (dockview wrapper)
└── CompositeEditor (main component)
    ├── CompositeEditorToolbar
    │   ├── SaveButton
    │   └── CancelButton
    ├── CompositeEditorCanvas (ReactFlow)
    │   └── OscillaNode (reused)
    └── CompositeEditorSidebar
        ├── PortExposurePanel
        ├── CompositeMetadataForm
        └── MiniBlockLibrary (filtered)
```

## State Flow

```
User Action → CompositeEditorStore → UI Update
                    ↓
                Save Action
                    ↓
           Validate + Build CompositeBlockDef
                    ↓
           registerBlock(def)
                    ↓
           Persist to localStorage
                    ↓
           Close editor + Refresh library
```

## localStorage Schema

```typescript
interface StoredComposites {
  version: 1;
  composites: {
    [compositeId: string]: {
      def: CompositeBlockDef;
      createdAt: string;
      updatedAt: string;
    };
  };
}

// Storage key: 'oscilla-user-composites'
```

## Port Exposure UI Design

```
┌─ Port Exposure ──────────────────────────┐
│                                          │
│ ▼ Add Block                              │
│   ○ a (float) → [ input_a        ]       │
│   ● b (float) → [ blend_amount   ]       │
│                                          │
│ ▼ Multiply Block                         │
│   ○ a (float)                            │
│   ○ b (float)                            │
│   ● out (float) → [ result       ]       │
│                                          │
│ ○ = not exposed                          │
│ ● = exposed (click to edit name)         │
└──────────────────────────────────────────┘
```

## Validation Rules

1. **Name validation**
   - Non-empty
   - Valid identifier (alphanumeric + underscore, starts with letter)
   - Unique among all blocks (not just composites)

2. **Structure validation**
   - At least one internal block
   - At least one exposed input OR no inputs required at all
   - At least one exposed output
   - No disconnected subgraphs (warning only?)

3. **Port validation**
   - All exposed ports map to existing internal ports
   - No duplicate external port IDs
   - External IDs are valid identifiers

## Error Messages

```typescript
const VALIDATION_ERRORS = {
  NAME_EMPTY: 'Composite name is required',
  NAME_INVALID: 'Name must be a valid identifier (letters, numbers, underscores)',
  NAME_CONFLICT: 'A block with this name already exists',
  NO_BLOCKS: 'Composite must contain at least one block',
  NO_OUTPUTS: 'Composite must expose at least one output',
  DUPLICATE_PORT: 'Port ID "{id}" is already used',
  INVALID_PORT_MAPPING: 'Port "{externalId}" maps to non-existent internal port',
};
```

## Testing Considerations

- Mock localStorage for persistence tests
- Mock registry for registration tests
- E2E test for full create/save/use workflow
- Accessibility testing for keyboard navigation
