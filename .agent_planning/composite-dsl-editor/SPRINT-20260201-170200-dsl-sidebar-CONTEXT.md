# Implementation Context: dsl-sidebar

## Key Files

### To Create
- `src/ui/components/CompositeEditorDslSidebar.tsx` — sidebar component
- `src/ui/components/CompositeEditorDslSidebar.css` — styles

### To Modify
- `src/ui/components/CompositeEditor.tsx` — add sidebar toggle + render sidebar
- `src/ui/components/CompositeEditor.css` — layout changes for 3-column when sidebar open

### Key References
- `src/stores/CompositeEditorStore.ts` — toHCL()/fromHCL() (from Sprint 1)
- `src/ui/components/CompositeEditor.tsx` — current layout to modify

## Component Design

### CompositeEditorDslSidebar
```tsx
interface Props {
  store: CompositeEditorStore;
  visible: boolean;
}
```

- Observes store via MobX `observer()` or `autorun()`
- Local state: `text` (textarea content), `errors` (parse errors), `isFocused` (user editing)
- On store change (when not focused): update `text` from `store.toHCL()`
- On blur/apply: call `store.fromHCL(text)`, show errors if any

### Sync Logic
```
graph changes → store → autorun → toHCL() → setText()  (only if !isFocused)
user edits text → setText()  (local only, no store update yet)
user commits (blur/button) → fromHCL(text) → store → graph updates
```

### Layout in CompositeEditor
Currently:
```
[canvas (flex:1)] [port-panel (~250px)]
```

With sidebar:
```
[canvas (flex:1)] [dsl-sidebar (~350px, collapsible)] [port-panel (~250px)]
```

Or dsl-sidebar could replace port-panel position (port panel is less useful when DSL is showing since exposed ports are in the DSL).
