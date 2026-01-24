---
topic: 15
name: Graph Editor UI (Linear Auto-Layout)
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/15-graph-editor-ui.md
category: to-review
audited: 2026-01-24T20:00:00Z
item_count: 3
tier: T3 (Optional - UI implementation detail)
---

# Topic 15: Graph Editor UI (Linear Auto-Layout) — To Review

The current ReactFlow editor diverges significantly from the spec's linear auto-layout vision but provides a functional graph editing experience. These items note where the implementation's approach partially satisfies the spec's intent through different means.

## Also

Primary analysis in `unimplemented/topic-15-graph-editor-ui.md`.

## Items

### R-16: ELK layered layout vs spec's selection-aware linear layout
**Spec says**: Automatic linear layout where selected block determines visible subgraph. Layout recomputes based on focus. No manual positioning.
**Implementation does**: ELK-based layered left-to-right layout (`layout.ts`). Computed once on load, persisted to `LayoutStore`. Users can drag nodes freely. "Auto Arrange" button for explicit re-layout.
**Possible justification**: Standard node editor UX is familiar and proven. ELK layout achieves readable left-to-right flow. Manual positioning gives users control over aesthetics. The spec's approach is T3 and explicitly noted as an implementation detail.
**Risk if wrong**: Large graphs become hard to navigate without focus/dimming. Spaghetti layout possible with many connections.
**Files**: `/Users/bmf/code/oscilla-animator-v2/src/ui/reactFlowEditor/layout.ts`, `/Users/bmf/code/oscilla-animator-v2/src/stores/LayoutStore.ts`

### R-17: SelectionStore.relatedBlockIds vs spec's focusedChain
**Spec says**: Selection computes transitive chain (all reachable blocks without direction reversal).
**Implementation does**: `relatedBlockIds` computes 1-hop neighbors (direct connections only). `highlightedBlockIds` = selected + direct neighbors.
**Possible justification**: Direct neighbors are the most immediately relevant. Transitive chains could be very large and overwhelming for complex graphs.
**Risk if wrong**: Users can't quickly understand signal flow paths beyond immediate neighbors.
**Files**: `/Users/bmf/code/oscilla-animator-v2/src/stores/SelectionStore.ts`

### R-18: Context menu actions vs perspective rotation
**Spec says**: Right-click pivot blocks to rotate perspective (change which path is "forward").
**Implementation does**: Right-click shows Duplicate/Delete/Disconnect/Center actions. No path-awareness.
**Possible justification**: Standard node editor context menu actions are more universally useful. The spec's rotation concept requires the full chain/dimming infrastructure.
**Risk if wrong**: With complex graphs, users have no way to selectively focus on one signal path among many.
**Files**: `/Users/bmf/code/oscilla-animator-v2/src/ui/reactFlowEditor/menus/BlockContextMenu.tsx`
