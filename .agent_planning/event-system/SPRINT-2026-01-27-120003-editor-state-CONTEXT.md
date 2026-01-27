# Implementation Context: editor-state

## Key Files

### Files to Create
- `src/stores/EditorStateStore.ts` - New store for editor coordination

### Primary Files to Modify
- `src/stores/RootStore.ts` - Wire EditorStateStore
- `src/ui/components/DisplayNameEditor.tsx` (or similar) - Integrate with store

### Reference Files
- `design-docs/_new/01-Event-System.md` - Editor State Coordination section
- `src/events/types.ts` - EditorStateChangedEvent definition

## Spec: Editor State Coordination

From the spec addendum:

### Problem Statement
Multiple editors can be open in different locations (ReactFlow node, inspector panel, dialog). When one editor has invalid state:
1. Prevent further edits in THAT editor
2. Prevent other editors from opening while invalid
3. Allow Escape to revert safely
4. Provide clear error feedback

### Event Structure
```typescript
editorStateChanged: (change: {
  action: 'editStarted' | 'validityChanged' | 'editEnded'
  editor?: { id: string, type: string, location: 'node' | 'inspector' | 'dialog' }
  isValid?: boolean
  error?: string
}) => void
```

### Lifecycle Example
1. User clicks displayName in node → `editStarted`
2. Inspector's displayName editor subscribes, sees other editor active
3. Inspector editor disables itself (read-only text)
4. User types invalid name (empty) → `validityChanged { isValid: false }`
5. Both editors see invalid state, remain locked
6. User presses Escape → `editEnded`
7. Inspector re-enables

## EditorStateStore Design

```typescript
export class EditorStateStore {
  @observable activeEditors = new Map<EditorLocation, ActiveEditor>();

  constructor(private eventHub: EventHub) {}

  @action
  startEdit(editor: EditorInfo): boolean {
    const location = editor.location;

    // Check if another editor is active and invalid
    for (const [loc, active] of this.activeEditors) {
      if (!active.isValid) {
        return false; // Can't start new edit while invalid edit exists
      }
    }

    // Check if already editing at this location
    if (this.activeEditors.has(location)) {
      return false;
    }

    this.activeEditors.set(location, {
      ...editor,
      isValid: true,
    });

    this.eventHub.emit({
      type: 'EditorStateChanged',
      patchId: this.patchId,
      patchRevision: this.patchRevision,
      action: 'editStarted',
      editor: { id: editor.id, type: editor.type, location },
    });

    return true;
  }

  @action
  updateValidity(location: EditorLocation, isValid: boolean, error?: string) {
    const editor = this.activeEditors.get(location);
    if (!editor) return;

    editor.isValid = isValid;
    editor.error = error;

    this.eventHub.emit({
      type: 'EditorStateChanged',
      ...
      action: 'validityChanged',
      isValid,
      error,
    });
  }

  @action
  endEdit(location: EditorLocation) {
    const editor = this.activeEditors.get(location);
    if (!editor) return;

    this.activeEditors.delete(location);

    this.eventHub.emit({
      type: 'EditorStateChanged',
      ...
      action: 'editEnded',
    });
  }

  @computed
  get canEdit(): boolean {
    // Can edit if no editors are invalid
    for (const editor of this.activeEditors.values()) {
      if (!editor.isValid) return false;
    }
    return true;
  }
}
```

## DisplayName Editor Integration

Current DisplayNameEditor likely looks like:
```tsx
function DisplayNameEditor({ blockId }) {
  const [value, setValue] = useState(block.displayName);
  const [isEditing, setIsEditing] = useState(false);

  const handleBlur = () => {
    if (validate(value)) {
      commit(value);
    }
    setIsEditing(false);
  };
}
```

With EditorStateStore:
```tsx
function DisplayNameEditor({ blockId, location }) {
  const editorState = useEditorStateStore();
  const [value, setValue] = useState(block.displayName);
  const isEditing = editorState.isEditingAt(location, blockId);

  const handleFocus = () => {
    const canStart = editorState.startEdit({
      id: `displayName-${blockId}`,
      type: 'displayName',
      location,
    });
    if (!canStart) {
      // Another editor is invalid, can't start
      return;
    }
  };

  const handleChange = (newValue) => {
    setValue(newValue);
    const isValid = validate(newValue);
    editorState.updateValidity(location, isValid, isValid ? undefined : 'Invalid name');
  };

  const handleBlur = () => {
    if (validate(value)) {
      commit(value);
    }
    editorState.endEdit(location);
  };

  const handleEscape = () => {
    setValue(block.displayName); // Revert
    editorState.endEdit(location);
  };
}
```

## Cascade Rule (from spec)

```
onEditorStateChanged (editEnded with isValid=true) → trigger auto-compile
```

This means: valid edit completion should trigger recompilation.
