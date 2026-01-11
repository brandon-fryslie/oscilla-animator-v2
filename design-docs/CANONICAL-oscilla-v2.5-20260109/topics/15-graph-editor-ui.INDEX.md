# Topic 15: Graph Editor UI - Linear Auto-Layout - Indexed Summary

**Tier**: T3 (UI Implementation)
**Status**: Optional - implementation detail
**Size**: 252 lines → ~65 lines (26% compression)

## Overview [L9-32]
Graph editor with automatic linear positioning. No manual drag-and-drop.

**Core Philosophy**:
- Blocks auto-positioned in output→input reading order
- Navigate by selecting blocks + rotating perspective
- Focus through selection, unrelated blocks dim
- Prevents spaghetti graphs

## Key Concepts [L35-65]

**Chain** [L37-48]: Tree of reachable blocks without reversing edge direction

Rules:
1. **Downstream**: Follow output edges
2. **Upstream**: Follow input edges
3. **No reversal**: Downstream-only OR upstream-only path
4. **Tree not line**: Include all branches at merge/split

Example chain from `h`: {h,g,f,c,b,a,e} (upstream only; `i` excluded = would reverse at `g`)

**Pivot Block** [L50-51]: Multiple inputs OR outputs (perspective can rotate)

**Focused Subgraph** [L53-55]: Current chain (bright, full opacity)

**Dimmed Subgraph** [L57-59]: Not in chain (30% opacity, non-interactive OR click to refocus)

**Perspective Rotation** [L61-65]: Right-click context menu on pivots to change forward path

## Layout Algorithm [L68-100]

**Primary Axis**: Left-to-right (upstream → downstream)

**Layout Rules** [L74-79]:
1. L-R primary axis
2. Stack vertically at merges (converge to single output)
3. Fan out at splits (single input to multiple outputs)
4. Selected block emphasized (glow, border)
5. Dimmed blocks (30% opacity)

**Engine Requirements** [L94-99]:
1. Topological sort of focused chain
2. Depth assignment (distance from selected)
3. Vertical stacking at merge/split
4. Minimize edge crossings

## Perspective Rotation [L103-131]

**Trigger**: Right-click context menu on pivot blocks

**Menu** [L109-126]:
- For multi-input block: "Focus upstream via [block A/B/E]"
- For multi-output: "Focus downstream to [block H/I]"

**Effect**: Changes which subgraph is forward/dimmed. Selected block stays selected.

## Combine Semantics [L134-141]
Multiple inputs with combine modes. If mode means input never contributes (e.g., last mode with deterministic order), that upstream path always dimmed.

## Interactions [L144-186]

**Selection** [L146-150]: Click selects, computes/displays chain; click dimmed refocuses; click empty deselects

**Editing** [L152-157]: Double-click opens inspector; right-click context menu (rotate, delete); keyboard shortcuts

**Navigation** [L159-164]: Arrow keys (move along chain), Tab (cycle same-depth blocks), Escape (deselect)

## Visual States [L167-176]
| State | Appearance |
|-------|-----------|
| Focused | Full opacity, highlighted border |
| In chain | Full opacity, normal border |
| Dimmed | 30% opacity, no border, click to refocus |
| Hovered | Subtle highlight (chain) or "click to focus" (dimmed) |
| Selected | Glow, thicker border |

## Edge Rendering [L179-185]
- In chain: Solid lines, block color
- Dimmed: Faint gray lines
- Multi-edge to same port: Bundled visually

## Implementation Requirements [L188-210]

**Required State**:
```typescript
interface GraphEditorState {
  selectedBlockId: BlockId | null;
  focusedChain: Set<BlockId>;
  perspectiveHint?: {
    blockId: BlockId;
    preferredUpstream?: BlockId;
    preferredDownstream?: BlockId;
  };
}
```

**Integration**: SelectionStore.selectedBlockId, relatedBlockIds, highlightedBlockIds
**New**: computeChain(blockId, patch, direction) utility

## Advantages [L213-222]
- Predictable (no user mess)
- Focused (see only relevant)
- Scalable (large graphs navigable)
- Mobile-friendly (no precision dragging)
- Simpler undo (no position state)
- Consistent (same layout for all users)

## Non-Goals [L225-230]
- Manual positioning
- Layout preference saving
- Multiple simultaneous selections
- Minimap

## Open Questions [L233-239]
1. Should rotation/refocus animate or snap?
2. Is zoom needed or does dimming handle scale?
3. Fixed block size or content-based?
4. Swipe gestures for mobile?

## Related
- [02-block-system](./02-block-system.md) - Block/Edge definitions
- [09-debug-ui-spec](./09-debug-ui-spec.md) - Debug UI
- [14-modulation-table-ui](./14-modulation-table-ui.md) - Modulation UI

**Status**: T3 Optional - Can change freely as implementation detail. Core graph semantics remain in Block System (T2).
