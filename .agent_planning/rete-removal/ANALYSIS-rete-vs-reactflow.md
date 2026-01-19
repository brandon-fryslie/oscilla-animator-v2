# Analysis: Rete.js vs React Flow Feature Comparison

**Date:** 2026-01-18
**Purpose:** Document functionality gaps before removing Rete

---

## Rete-Only Features (NOT in React Flow)

### 1. Undo/Redo (MEDIUM PRIORITY)

**Rete Implementation:**
- Uses `rete-history-plugin`
- Full history stack with `push()`, `undo()`, `redo()`, `canUndo()`, `canRedo()`
- Keyboard shortcuts: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
- History commits on node/connection create/remove events
- `isSyncing` guard prevents history commits during sync operations

**React Flow Status:** NOT IMPLEMENTED

**Code Reference:** `src/ui/reteEditor/ReteEditor.tsx:159-257`, `src/ui/reteEditor/sync.ts:257-290`

**Migration Path:** Implement at PatchStore level (action history pattern) rather than UI layer

---

### 2. Auto-Arrange Layout (HIGH PRIORITY)

**Rete Implementation:**
- Uses `rete-auto-arrange-plugin` with ELK (Eclipse Layout Kernel)
- Configurable options:
  - `elk.algorithm: 'layered'`
  - `elk.direction: 'RIGHT'` (left-to-right flow)
  - `elk.spacing.nodeNode: '100'`
  - `elk.layered.spacing.nodeNodeBetweenLayers: '80'`
- Toolbar button triggers layout
- Zoom-to-fit after layout completes

**React Flow Status:** NOT IMPLEMENTED

**Code Reference:** `src/ui/reteEditor/ReteEditor.tsx:80-105, 271-314`

**Migration Path:** Add dagre or elkjs dependency, create layout function, add toolbar button

---

### 3. Minimap Navigation (LOW PRIORITY)

**Rete Implementation:**
- Uses `rete-minimap-plugin`
- Configuration: `minDistance: 25`, `ratio: 0.2`
- Shows overview of entire graph
- Click to navigate

**React Flow Status:** Component exists (`<MiniMap />`) but NOT currently used

**Code Reference:** `src/ui/reteEditor/ReteEditor.tsx:166-170`

**Migration Path:** One-line change - add `<MiniMap />` to ReactFlowEditor.tsx

---

### 4. Context Menu (HIGH PRIORITY)

**Rete Implementation:**
- Uses `rete-context-menu-plugin`
- Background context menu (right-click empty space): empty list
- Node context menu (right-click node): "Delete" option

**React Flow Status:** NOT IMPLEMENTED

**Code Reference:** `src/ui/reteEditor/ReteEditor.tsx:128-157`

**Migration Path:** Add custom context menu component or use `react-contexify`

---

### 5. Socket Type Compatibility Validation (HIGH PRIORITY)

**Rete Implementation:**
- Custom `OscillaSocket` class extends `ClassicPreset.Socket`
- Attributes: `cardinality` ('signal' | 'field'), `payloadType` (float, int, phase, vec2, bool)
- `isCompatibleWith()` method enforces connection rules:
  - Signal → Signal (same payload): ✓ COMPATIBLE
  - Signal → Field (same payload): ✓ COMPATIBLE (broadcast)
  - Field → Signal: ✗ INCOMPATIBLE
  - Field → Field (same payload): ✓ COMPATIBLE
- 10 singleton socket instances for type safety
- `getSocketForSignalType()` maps SignalType to socket

**React Flow Status:** NOT IMPLEMENTED - connections are unconstrained

**Code Reference:** `src/ui/reteEditor/sockets.ts` (entire file, 105 lines)

**Impact:** Users can currently create invalid connections in React Flow

**Migration Path:**
1. Port validation logic to `createConnectHandler` in `src/ui/reactFlowEditor/sync.ts`
2. Add visual feedback for invalid connection attempts
3. Consider adding handle coloring by type

---

## Shared Features (Both Have)

| Feature | Implementation Notes |
|---------|---------------------|
| Pan/Zoom | Both have canvas pan and zoom |
| Node Dragging | Both support repositioning nodes |
| Connection Drawing | Both allow creating connections by dragging |
| Node Deletion | Both handle Delete/Backspace keys |
| Bidirectional Sync | Both sync with PatchStore via MobX reactions |
| Grid Layout | Both position new nodes in grid pattern |
| Block Add | Both can add blocks via EditorHandle.addBlock() |

---

## React Flow Features NOT in Rete

| Feature | Notes |
|---------|-------|
| Built-in Background | `<Background />` component shows grid |
| Built-in Controls | `<Controls />` provides zoom buttons |
| Selection → Store Sync | Clicks update SelectionStore |
| Better TypeScript | Superior type definitions, hooks pattern |
| Simpler Integration | Standard React patterns, less boilerplate |

---

## Priority Summary

| Priority           | Feature | Risk if Missing |
|--------------------|---------|-----------------|
| **HIGH**           | Socket Type Validation | Invalid connections allowed |
| **MEDIUM**         | Undo/Redo | No way to recover from mistakes |
| **LOW**            | Minimap | Harder to navigate large graphs |
| **EXTREMELY HIGH** | Auto-Arrange | Manual node positioning only |
| **HIGH**           | Context Menu | Must use keyboard for deletion |

---

## Recommendation

**Proceed with Rete removal.** The critical gaps (socket validation, auto-arrangement) should be addressed in a follow-up sprint, but is not blocking removal since:

1. The validation rules exist in spec and can be ported
2. React Flow is already the active editor
3. Rete is disabled and adds ~850 lines of dead code
4. 8 unused npm packages add bundle bloat

**Follow-up work to track:**
1. Port socket compatibility rules to React Flow (HIGH)
2. Implement undo/redo at PatchStore level (MEDIUM)
3. Implement auto-arrange algorithm
