# Runtime Knowledge: Rete.js Editor (patch-editor-ui)

**Last Updated**: 2026-01-12 21:31:56  
**Scope**: Rete.js visual node editor integration  
**Status**: Code complete, runtime verification pending

## Implementation Status (Code Analysis)

### ✅ VERIFIED COMPLETE

**P0: Rete.js Setup**
- Packages installed: rete, rete-react-plugin, rete-area-plugin, rete-connection-plugin, rete-context-menu-plugin
- ReteEditor component: `src/ui/editor/ReteEditor.tsx` (140 lines)
- Editor tab wired in App.tsx, set as initial tab
- Plugins configured: Area, Connection, React, ContextMenu
- Background: `#1a1a2e` dark blue-gray

**P1: Socket Type System**
- OscillaSocket class: `src/ui/editor/sockets.ts`
- isCompatibleWith() logic verified with standalone test
- Singletons: signal_float, signal_int, field_float, field_int, field_vec2, etc.
- Compatibility rules:
  - signal → signal (same payload): COMPATIBLE
  - signal → field (same payload): COMPATIBLE (broadcast)
  - field → signal: INCOMPATIBLE
  - field → field (same payload): COMPATIBLE
  - field → field (different payload): INCOMPATIBLE

**P2: OscillaNode Class**
- File: `src/ui/editor/nodes.ts`
- Extends ClassicPreset.Node
- Stores blockId and blockType
- createNodeFromBlock() factory uses getBlockDefinition()
- Ports created from BlockDef inputs/outputs

**P3: Bidirectional Sync**
- syncPatchToEditor(): loads PatchStore → Rete
- setupEditorToPatchSync(): listens to Rete events → updates PatchStore
- setupPatchToEditorReaction(): MobX reaction watches PatchStore
- isSyncing guard flag prevents infinite loops
- Event handlers:
  - noderemoved → PatchStore.removeBlock()
  - connectioncreated → PatchStore.addEdge()
  - connectionremoved → PatchStore.removeEdge()

**P4: Add Block from Library**
- BlockLibrary.tsx double-click handler calls addBlockToEditor()
- addBlockToEditor() helper in sync.ts:
  - Creates OscillaNode from BlockDef
  - Adds to editor with editor.addNode()
  - Calculates viewport center: rect.width/2, rect.height/2
  - Transforms to editor coords: (center - transform.x) / transform.k
  - Positions with area.translate()
- EditorContext provides editorHandle to BlockLibrary

**P5: Delete Block**
- ContextMenuPlugin configured in ReteEditor
- Context menu items function returns "Delete" for nodes
- Delete handler calls editor.removeNode(node.id)
- noderemoved event syncs to PatchStore.removeBlock()

## ⚠️ RUNTIME VERIFICATION NEEDED

**Critical (Medium Risk):**
1. **Pan/Zoom**: Code calls `AreaExtensions.simpleNodesOrder(area)` - unclear if this enables pan/zoom or just Z-ordering
   - Test: Drag background, scroll wheel
   - May need additional AreaExtensions setup

**Important (Low Risk):**
2. **Socket Visual Feedback**: isCompatibleWith() logic correct, but Rete's visual rejection not verified
3. **Add Block Positioning**: Math looks correct, but not runtime tested
4. **Context Menu Rendering**: Plugin configured, but menu appearance not verified
5. **Delete with Edges**: Assumed Rete auto-removes edges, not verified
6. **Sync to Views**: MobX pattern exists, assumed working

## Code Quality

**Strengths:**
- Clean separation: sockets.ts, nodes.ts, sync.ts, EditorContext.tsx
- Proper TypeScript typing throughout
- isSyncing guard prevents loops
- Viewport transform math accounts for pan/zoom
- Error handling for missing BlockDef
- EditorContext provides dependency injection

**Potential Edge Cases:**
- Rapid double-clicks (no debounce)
- Very large graphs (Rete performance unknown)
- Deep zoom levels (floating point precision)

## Persistent Checks

**All pass:**
- npm run typecheck: ✅ Zero errors
- npm run test: ✅ 274 passed, 8 skipped
- npm run build: ✅ 1,265 kB bundle

## Recommended Tests to Add

1. `src/ui/editor/__tests__/sockets.test.ts` - Socket compatibility matrix
2. `src/ui/editor/__tests__/sync.test.ts` - Mock sync behavior
3. Playwright E2E: Navigate to Editor, add block, create connection, delete

## Known Issues

**RESOLVED:**
- ✅ Add block from Library not working → FIXED (addBlockToEditor helper)
- ✅ Context menu for delete → FIXED (ContextMenuPlugin integrated)

**PENDING VERIFICATION:**
- Pan/zoom behavior (medium risk)
- All other runtime behaviors (low risk)

## Files

- `src/ui/editor/ReteEditor.tsx` - Main component (140 lines)
- `src/ui/editor/sockets.ts` - Socket type system (105 lines)
- `src/ui/editor/nodes.ts` - OscillaNode class
- `src/ui/editor/sync.ts` - Bidirectional sync
- `src/ui/editor/EditorContext.tsx` - React context
- `src/ui/editor/index.ts` - Public exports
- `src/ui/components/BlockLibrary.tsx` - Double-click handler (modified)
- `src/ui/components/app/App.tsx` - Tab wiring (modified)
