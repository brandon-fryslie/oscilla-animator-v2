# Handoff: patch-editor-ui (Rete.js Integration)

**Created**: 2026-01-12 20:30
**For**: Implementation agent (do:iterative-implementer)
**Status**: ready-to-start

---

## Objective

Integrate Rete.js v2 as the visual node editor for Oscilla, enabling users to add/delete blocks and create connections with type-safe socket validation, while maintaining PatchStore as the source of truth.

## Current State

### What's Been Done
- Full evaluation of node editor libraries (React Flow, Rete.js, LiteGraph, Flume)
- Decision: Use Rete.js for built-in socket validation, undo/redo plugin, auto-layout plugin
- Complete sprint plan with 6 work items (P0-P5)
- Definition of Done with 50+ acceptance criteria
- User approval received

### What's In Progress
- Nothing - ready to start implementation

### What Remains
- P0: Install Rete packages, create ReteEditor component, add Editor tab
- P1: Define OscillaSocket class with type compatibility rules
- P2: Create OscillaNode class mapping to Oscilla blocks
- P3: Bidirectional sync between Rete ↔ PatchStore
- P4: Wire Library double-click to add blocks
- P5: Context menu with Delete option

## Context & Background

### Why We're Doing This
The current UI is read-only visualization. Users cannot create or edit patches. Rete.js provides visual node editing with built-in features (socket validation, history, layout) that would otherwise require significant custom development.

### Key Decisions Made

| Decision | Rationale | Date |
|----------|-----------|------|
| Use Rete.js over React Flow | Built-in socket validation, history plugin, auto-layout | 2026-01-12 |
| PatchStore remains source of truth | Rete is UI layer only; compiler reads from PatchStore | 2026-01-12 |
| Bidirectional sync with guard flag | Prevent infinite loops between Rete events and PatchStore | 2026-01-12 |
| Socket types map to SignalType cardinality+payload | signal_float, field_float, etc. | 2026-01-12 |
| Defer undo/redo to Sprint 2 | Focus on core editing first | 2026-01-12 |

### Important Constraints
- **PatchStore is source of truth** - Rete state derives from it, not vice versa
- **No undo/redo in Sprint 1** - History plugin deferred to Sprint 2
- **No custom node rendering** - Use Rete defaults for now
- **Existing views must keep working** - TableView, ConnectionMatrix read same PatchStore

## Acceptance Criteria

See `.agent_planning/patch-editor-ui/DOD-20260112-190000.md` for full list. Key criteria:

### P0: Basic Setup
- [ ] Rete packages installed (rete, rete-react-plugin, rete-area-plugin, rete-connection-plugin, rete-context-menu-plugin)
- [ ] ReteEditor component at `src/ui/editor/ReteEditor.tsx`
- [ ] "Editor" tab in center panel
- [ ] Pan/zoom working

### P1: Socket Validation
- [ ] OscillaSocket class with `isCompatibleWith()`
- [ ] Signal→Signal (same type): COMPATIBLE
- [ ] Signal→Field (same type): COMPATIBLE (broadcast)
- [ ] Field→Signal: INCOMPATIBLE

### P3: Sync
- [ ] `syncPatchToEditor()` loads PatchStore into Rete
- [ ] Rete events sync back to PatchStore
- [ ] No infinite loops (isSyncing guard)

### P4-P5: Editing
- [ ] Double-click Library → adds block
- [ ] Right-click node → Delete

## Scope

### Files to Create (New)
| File | Purpose |
|------|---------|
| `src/ui/editor/ReteEditor.tsx` | Main Rete editor component |
| `src/ui/editor/sockets.ts` | OscillaSocket class + socket instances |
| `src/ui/editor/nodes.ts` | OscillaNode class + factory functions |
| `src/ui/editor/sync.ts` | Bidirectional sync logic |
| `src/ui/editor/EditorContext.tsx` | React context for editor access |
| `src/ui/editor/index.ts` | Public exports |

### Files to Modify
| File | Changes |
|------|---------|
| `src/ui/components/app/App.tsx` | Add "Editor" tab to center panel |
| `src/ui/components/BlockLibrary.tsx` | Wire double-click to add block via editor context |
| `package.json` | Add Rete dependencies |

### Related Components (Read Only)
- `src/stores/PatchStore.ts` - Understand mutation methods (addBlock, removeBlock, addEdge, removeEdge)
- `src/stores/RootStore.ts` - Understand store composition
- `src/blocks/registry.ts` - Understand BlockDef structure for creating nodes

### Out of Scope
- Undo/redo (Sprint 2)
- Auto-layout (Sprint 2)
- Minimap (Sprint 2)
- Custom node styling
- Parameter editing in nodes
- Subgraphs

## Implementation Approach

### Recommended Order
1. **P0 first** - Get basic Rete rendering working
2. **P1 second** - Define sockets (needed for P2)
3. **P2 third** - Define OscillaNode (needed for P3/P4)
4. **P3 fourth** - Sync logic (core infrastructure)
5. **P4 fifth** - Add block functionality
6. **P5 last** - Delete functionality

### Patterns to Follow

**Socket definition pattern:**
```typescript
export class OscillaSocket extends ClassicPreset.Socket {
  constructor(
    name: string,
    public readonly cardinality: 'signal' | 'field',
    public readonly payloadType: string
  ) {
    super(name);
  }

  isCompatibleWith(socket: ClassicPreset.Socket): boolean {
    if (!(socket instanceof OscillaSocket)) return false;
    // Same cardinality + payload = compatible
    // Signal → Field with same payload = compatible (broadcast)
    // Everything else = incompatible
  }
}
```

**Sync guard pattern:**
```typescript
let isSyncing = false;

function syncToRete() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    // ... sync logic
  } finally {
    isSyncing = false;
  }
}

editor.addPipe(context => {
  if (isSyncing) return context;
  // ... handle event, set isSyncing around PatchStore calls
  return context;
});
```

**Store access pattern:**
```typescript
import { rootStore } from '../../stores';
// Use rootStore.patch for PatchStore
// Use rootStore.selection for SelectionStore
```

### Known Gotchas

1. **Rete uses async APIs** - `editor.addNode()`, `editor.removeNode()` return Promises
2. **Rete node IDs vs BlockIds** - OscillaNode has both `id` (Rete's) and `blockId` (ours)
3. **Connection source/target** - Rete uses `source`/`target`, PatchStore uses `from`/`to`
4. **Socket instances must be shared** - Use singleton `Sockets` object, not new instances per node

## Reference Materials

### Planning Documents
- [PLAN-20260112-190000.md](.agent_planning/patch-editor-ui/PLAN-20260112-190000.md) - Full sprint plan with code examples
- [DOD-20260112-190000.md](.agent_planning/patch-editor-ui/DOD-20260112-190000.md) - Acceptance criteria
- [EVALUATION-20260112-190000.md](.agent_planning/patch-editor-ui/EVALUATION-20260112-190000.md) - Architecture decisions
- [USER-RESPONSE-20260112-190000.md](.agent_planning/patch-editor-ui/USER-RESPONSE-20260112-190000.md) - User approval

### Codebase References
- `src/stores/PatchStore.ts` - Block/edge mutation methods
- `src/stores/RootStore.ts` - Store composition pattern
- `src/blocks/registry.ts` - BlockDef structure, getBlockDefinition()
- `src/types/index.ts` - BlockId, SignalType definitions
- `src/ui/components/BlockLibrary.tsx` - Current double-click handler at line ~111

### External Resources
- [Rete.js v2 docs](https://retejs.org/docs/) - Official documentation
- [Rete React plugin](https://retejs.org/docs/guides/renderers/react) - React integration
- [Rete socket validation](https://retejs.org/docs/guides/validation/) - isCompatibleWith pattern

## Questions & Blockers

### Open Questions
- [x] Which node editor library? → Rete.js (decided)
- [x] Source of truth? → PatchStore (decided)
- [ ] How to handle node positions on initial load? (grid layout for now, auto-arrange in Sprint 2)

### Current Blockers
- None

### Need User Input On
- None - plan is approved

## Testing Strategy

### Existing Tests
- No existing tests for editor (new feature)
- Existing tests for PatchStore mutations should continue to pass

### New Tests Needed
- [ ] OscillaSocket.isCompatibleWith() - test all combinations
- [ ] syncPatchToEditor() - test block/edge loading
- [ ] Integration: add block → appears in Rete + PatchStore

### Manual Testing
See DOD verification checklist:
1. Basic editor (pan/zoom)
2. Add block flow
3. Create connection flow
4. Type validation (reject incompatible)
5. Delete block flow
6. Sync verification (changes reflect in all views)

## Success Metrics

- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] All existing tests pass (`npm run test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Editor tab renders with pan/zoom
- [ ] Double-click adds block
- [ ] Drag creates connections with type validation
- [ ] Right-click delete works
- [ ] Changes sync to TableView/Matrix
- [ ] No console errors

---

## Next Steps for Agent

**Immediate actions:**
1. Install Rete packages: `npm install rete rete-react-plugin rete-area-plugin rete-connection-plugin rete-context-menu-plugin`
2. Create `src/ui/editor/` directory structure
3. Implement P0: Basic ReteEditor component with pan/zoom

**Before starting implementation:**
- [ ] Read PLAN-20260112-190000.md for detailed code examples
- [ ] Read DOD-20260112-190000.md for full acceptance criteria
- [ ] Review PatchStore.ts to understand mutation methods

**When complete:**
- [ ] Run `npm run typecheck` and `npm run test`
- [ ] Verify all DOD criteria manually
- [ ] Update planning docs with completion status

---

## NPM Install Command

```bash
npm install rete rete-react-plugin rete-area-plugin rete-connection-plugin rete-context-menu-plugin
```

## Quick Start Code

```typescript
// src/ui/editor/ReteEditor.tsx
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { NodeEditor, GetSchemes, ClassicPreset } from 'rete';
import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
import { ReactPlugin, Presets as ReactPresets } from 'rete-react-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';

type Schemes = GetSchemes<ClassicPreset.Node, ClassicPreset.Connection<ClassicPreset.Node>>;

export function ReteEditor() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const editor = new NodeEditor<Schemes>();
    const area = new AreaPlugin<Schemes>(containerRef.current);
    const connection = new ConnectionPlugin<Schemes>();
    const reactPlugin = new ReactPlugin<Schemes, AreaExtra>({ createRoot });

    editor.use(area);
    area.use(connection);
    area.use(reactPlugin);

    connection.addPreset(ConnectionPresets.classic.setup());
    reactPlugin.addPreset(ReactPresets.classic.setup());

    AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
      accumulating: AreaExtensions.accumulateOnCtrl()
    });

    return () => area.destroy();
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
```
