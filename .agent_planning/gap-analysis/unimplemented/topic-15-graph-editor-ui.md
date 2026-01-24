---
topic: 15
name: Graph Editor UI (Linear Auto-Layout)
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/15-graph-editor-ui.md
category: unimplemented
audited: 2026-01-24T20:00:00Z
item_count: 12
blocks_critical: []
tier: T3 (Optional - UI implementation detail)
note: All items are T3 — future tier. Current ReactFlow editor is a functional alternative.
---

# Topic 15: Graph Editor UI (Linear Auto-Layout) — Unimplemented

The spec describes a novel graph editor with automatic linear layout, chain-based focus, perspective rotation, and dimming. The current implementation uses ReactFlow with ELK-based layered auto-layout and standard node editor interactions (drag, pan, zoom, manual positioning). The spec's approach is T3 (Optional) and represents a fundamentally different interaction model.

## Also

See `to-review/topic-15-graph-editor-ui.md` for items where the current ReactFlow editor partially overlaps spec intent.

## Items

### U-40: Chain computation (focused subgraph from selection)
**Spec requirement**: `computeChain(blockId, patch, direction)` utility that computes reachable blocks by traversing edges without reversing direction. Selected block determines visible subgraph.
**Scope**: New utility function + integration with SelectionStore
**Blocks**: nothing — standalone algorithm
**Evidence of absence**: `SelectionStore` has `relatedBlockIds` (direct neighbors only, 1-hop). No transitive chain/reachability computation exists. No `focusedChain: Set<BlockId>` in any store.
**Tier**: T3 — future tier.

### U-41: Pivot Block concept and perspective rotation
**Spec requirement**: Blocks with multiple inputs or outputs are "pivot blocks." Right-click context menu offers "Focus upstream/downstream path" options to change which subgraph path is visible.
**Scope**: New concept, new context menu entries, new state (`perspectiveHint`)
**Blocks**: U-40 (chain computation needed first)
**Evidence of absence**: `BlockContextMenu.tsx` has Duplicate/Delete/Disconnect/Center actions. No "Focus upstream path" or perspective rotation. No `perspectiveHint` state.
**Tier**: T3 — future tier.

### U-42: Dimming system (30% opacity for out-of-chain blocks)
**Spec requirement**: Blocks not in the focused chain rendered at 30% opacity, non-interactive or click-to-refocus. Edges also dimmed (gray, faint).
**Scope**: Visual state system per node/edge based on chain membership
**Blocks**: U-40 (chain computation provides membership set)
**Evidence of absence**: No opacity modulation in `OscillaNode.tsx` or ReactFlow edge styling based on chain membership. `highlightedBlockIds` exists but only covers direct neighbors.
**Tier**: T3 — future tier.

### U-43: No manual block positioning
**Spec requirement**: Blocks are always automatically positioned. No drag-and-drop positioning. Users navigate by selection and rotation only.
**Scope**: Fundamental interaction model change
**Blocks**: U-40, U-41 (alternative navigation model needed)
**Evidence of absence**: ReactFlow editor supports full drag-and-drop. `LayoutStore` persists manually-dragged positions. `handleNodesChange` processes position updates from drag events.
**Tier**: T3 — future tier.

### U-44: Click-to-refocus on dimmed blocks
**Spec requirement**: Clicking a dimmed (out-of-chain) block refocuses the view to that block's chain.
**Scope**: Click handler modification + chain recomputation
**Blocks**: U-40, U-42
**Evidence of absence**: Clicking any node just selects it and highlights direct neighbors. No chain recomputation triggered.
**Tier**: T3 — future tier.

### U-45: Arrow key navigation along chain
**Spec requirement**: Arrow keys move selection along chain. Tab cycles through blocks at same depth. Escape deselects/zooms out.
**Scope**: New keyboard navigation handlers with chain/depth awareness
**Blocks**: U-40 (needs chain + depth assignment)
**Evidence of absence**: `hotkeyRegistry.ts` has no arrow key, Tab, or Escape entries for graph navigation. Only export-patch, reset-patch, toggle-play, reset-time, zoom-fit, and delete-selected are registered.
**Tier**: T3 — future tier.

### U-46: Visual states (focused, in-chain, dimmed, hovered, selected)
**Spec requirement**: 5 distinct visual states with specific appearances (full opacity + highlight, full opacity + normal, 30% opacity, subtle highlight or "click to focus" hint, glow effect + thick border).
**Scope**: Style system in OscillaNode component
**Blocks**: U-40 (chain membership determines state)
**Evidence of absence**: `OscillaNode.tsx` has selected state styling but no chain-aware states. No focused/in-chain/dimmed distinction.
**Tier**: T3 — future tier.

### U-47: Edge rendering by chain membership
**Spec requirement**: In-chain edges are solid lines following block color. Dimmed edges are faint gray. Multiple edges to same port shown as bundled/merged.
**Scope**: Edge styling based on chain set
**Blocks**: U-40
**Evidence of absence**: All edges rendered uniformly in ReactFlow. No conditional styling based on chain membership.
**Tier**: T3 — future tier.

### U-48: Layout algorithm (topological sort + depth + stacking)
**Spec requirement**: Primary left-to-right axis. Merge points stack vertically. Split points fan out. Minimize edge crossings. Depth assignment from selected block.
**Scope**: Selection-aware layout that recomputes based on focus
**Blocks**: U-40 (chain determines which nodes to layout)
**Evidence of absence**: `layout.ts` uses ELK algorithm with fixed left-to-right direction applied to all nodes equally. No selection-aware re-layout. Layout is static after computation.
**Tier**: T3 — future tier.

### U-49: Combine mode visibility rule
**Spec requirement**: If combine mode means an input never contributes (e.g., `combine: 'last'` with deterministic ordering), that upstream path is always dimmed.
**Scope**: Semantic analysis of combine mode + dimming integration
**Blocks**: U-40, U-42 (needs chain + dimming system)
**Evidence of absence**: No combine-mode-aware visibility logic in UI layer. CombineMode validation exists only in compiler.
**Tier**: T3 — future tier.

### U-50: Double-click block to open inspector
**Spec requirement**: Double-click a block to open its parameter inspector.
**Scope**: New event handler on graph nodes
**Blocks**: nothing — standalone
**Evidence of absence**: ReactFlow editor handles single-click for selection, right-click for context menu. No `onNodeDoubleClick` handler. Double-click exists for BlockLibrary (add block) and display name editing, but not for graph node inspection.
**Tier**: T3 — future tier.

### U-51: GraphEditorState interface
**Spec requirement**: `GraphEditorState { selectedBlockId, focusedChain: Set<BlockId>, perspectiveHint?: { blockId, preferredUpstream?, preferredDownstream? } }`
**Scope**: New state interface, potentially extending SelectionStore
**Blocks**: U-40, U-41
**Evidence of absence**: `SelectionStore` has `selectedBlockId` but no `focusedChain` or `perspectiveHint`. These concepts are entirely absent.
**Tier**: T3 — future tier.
