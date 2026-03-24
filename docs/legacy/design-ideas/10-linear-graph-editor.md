# 10. Linear Auto-Layout Graph Editor

## Overview

A graph editor where blocks are automatically positioned in a linear flow. Users navigate by **selecting** blocks and **rotating perspective** to focus on different subgraphs. No manual positioning, no drag-and-drop.

## Core Concept: Perspective Rotation

Traditional node editors let users freely position blocks, leading to spaghetti graphs and layout management overhead. This design takes a different approach:

1. **Automatic linear layout** - Blocks arranged output→input in reading order
2. **Focus through selection** - Selected block determines visible subgraph
3. **Rotate to pivot** - Right-click to change which path is "forward"
4. **Dimming hides complexity** - Unrelated blocks fade, keeping focus tight

## Terminology

- **Chain**: The tree of blocks reachable from a selected block by traversing edges without reversing direction
- **Pivot block**: A block with multiple inputs or outputs where perspective can rotate
- **Focused subgraph**: The currently visible chain (bright)
- **Dimmed subgraph**: Blocks not in the current chain (faded but visible)

## Chain Traversal Rules

A chain is computed by walking the graph from a selected block:

1. **Downstream**: Follow edges FROM the selected block's outputs
2. **Upstream**: Follow edges TO the selected block's inputs
3. **No reversal**: Once you've gone downstream, don't go back upstream (and vice versa)
4. **Tree not line**: At merge/split points, include ALL branches

### Example

```
a → b → c ← e
        ↓
        f
        ↓
    h ← g → i
```

**Chain from `h`:**
- Start at h
- Upstream: h ← g ← f ← c
- At c: continue upstream to both a→b→c AND e→c
- Result: `{h, g, f, c, b, a, e}` (i is NOT included - would require reversal at g)

**Chain from `e`:**
- Start at e
- Downstream: e → c → f → g
- At g: continue downstream to both h and i
- Result: `{e, c, f, g, h, i}` (a, b are NOT included - would require reversal at c)

**Chain from `c`:**
- Upstream: a, b, e (all feed into c)
- Downstream: f, g, h, i
- Result: entire graph is visible

## Layout Algorithm

Blocks in the focused chain are arranged linearly:

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│  [a]─┐                                                   │
│      ├─▶[c]─▶[f]─▶[g]─┬─▶[i]                            │
│  [e]─┘               └─▶[h]  ← SELECTED                 │
│                                                          │
│  [b] (dimmed - upstream of a, not directly in chain)     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Layout Rules

1. **Primary axis**: Left-to-right (upstream → downstream)
2. **Merge points**: Stack vertically, converge to single output
3. **Split points**: Fan out vertically from single input
4. **Selected block**: Visually emphasized (glow, border, etc.)
5. **Dimmed blocks**: Reduced opacity, non-interactive (or click to refocus)

## Perspective Rotation

When a block has multiple paths through it, user can "rotate" to focus on a different one.

### Trigger

**Right-click context menu** on any pivot block (block with multiple inputs OR multiple outputs).

### Menu Options

For a block with multiple inputs:
```
Focus upstream path:
  • Via [block A]
  • Via [block B]
  • Via [block E]
```

For a block with multiple outputs:
```
Focus downstream path:
  • To [block H]
  • To [block I]
```

### Effect

Rotating changes which subgraph is "forward" and which is dimmed. The selected block stays selected, but the visible chain changes.

## Combine Semantics and Visibility

All blocks support multiple inputs with combine modes (sum, average, last, etc.).

### Visibility Rule

If a combine mode means an input **never contributes** to the output:
- That upstream path is **always dimmed**
- Example: `combine: 'last'` with deterministic ordering - earlier inputs never matter

If all inputs contribute:
- All upstream paths visible when focused on that block

## Interactions

### Selection
- **Click block**: Select it, compute and display its chain
- **Click dimmed block**: Refocus to that block's chain
- **Click empty space**: Deselect, show full graph (all dimmed equally)

### Editing
- **Double-click block**: Open inspector for that block's parameters
- **Right-click block**: Context menu (rotate perspective, delete, etc.)
- **Keyboard shortcuts**: Delete, duplicate, etc.

### Navigation
- **Arrow keys**: Move selection along chain
- **Tab**: Cycle through blocks at same depth
- **Escape**: Deselect / zoom out

## Visual States

| State | Appearance |
|-------|------------|
| **Focused** | Full opacity, highlighted border |
| **In chain** | Full opacity, normal border |
| **Dimmed** | 30% opacity, no border, click to refocus |
| **Hovered** | Subtle highlight (in chain) or "click to focus" hint (dimmed) |
| **Selected** | Glow effect, thicker border |

## Edge Rendering

Edges connect blocks visually:

- **In chain**: Solid lines, follow block color
- **Dimmed**: Faint lines, gray
- **Multiple edges to same port**: Show as bundled/merged visually

## Implementation Notes

### Required State

```typescript
interface GraphEditorState {
  selectedBlockId: BlockId | null;
  focusedChain: Set<BlockId>;      // Computed from selection
  perspectiveHint?: {              // Which path is "forward" at pivot points
    blockId: BlockId;
    preferredUpstream?: BlockId;   // Which input path to favor
    preferredDownstream?: BlockId; // Which output path to favor
  };
}
```

### Layout Engine Requirements

1. Topological sort of focused chain
2. Depth assignment (distance from selected block)
3. Vertical stacking at merge/split points
4. Minimize edge crossings

### Integration with Existing Stores

- `SelectionStore.selectedBlockId` - drives focus
- `SelectionStore.relatedBlockIds` - already computes direct connections
- `SelectionStore.highlightedBlockIds` - can be extended for chain
- New: `computeChain(blockId, patch, direction)` utility

## Advantages

1. **Predictable** - No user-created layout mess
2. **Focused** - See only what matters for current task
3. **Scalable** - Large graphs remain navigable
4. **Mobile-friendly** - No precision dragging required
5. **Simpler undo** - No position state to track
6. **Consistent** - Every user sees same layout for same graph

## Non-Goals (Explicit)

- Manual block positioning
- Saving/loading layout preferences
- Multiple simultaneous selections
- Minimap (full graph overview) - may add later if needed

## Open Questions

1. **Animation**: Should rotation/refocus animate smoothly or snap?
2. **Zoom**: Is zoom needed, or does dimming handle scale?
3. **Block sizing**: Fixed size or based on content (ports, label)?
4. **Touch**: Swipe gestures for rotation on mobile?

---

*This spec captures the design intent. Implementation details (layout algorithm, exact CSS, etc.) will be determined during development.*
