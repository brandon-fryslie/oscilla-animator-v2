# Topic 15: Graph Editor UI - Linear Auto-Layout

**Tier**: T3 (Optional - UI implementation detail)
**Source**: `design-docs/spec/10-linear-graph-editor.md`
**Dependencies**: None (self-contained)

---

## Overview

A graph editor where blocks are automatically positioned in a linear flow. Users navigate by **selecting** blocks and **rotating perspective** to focus on different subgraphs. No manual positioning, no drag-and-drop.

### Core Philosophy

Traditional node editors let users freely position blocks, leading to spaghetti graphs and layout management overhead. This design takes a different approach:

1. **Automatic linear layout** - Blocks arranged output→input in reading order
2. **Focus through selection** - Selected block determines visible subgraph
3. **Rotate to pivot** - Right-click to change which path is "forward"
4. **Dimming hides complexity** - Unrelated blocks fade, keeping focus tight

---

## Key Concepts

### Chain

The tree of blocks reachable from a selected block by traversing edges **without reversing direction**.

**Rules**:
1. **Downstream**: Follow edges FROM the selected block's outputs
2. **Upstream**: Follow edges TO the selected block's inputs
3. **No reversal**: Once you've gone downstream, don't go back upstream (and vice versa)
4. **Tree not line**: At merge/split points, include ALL branches

**Example**:
```
a → b → c ← e
        ↓
        f
        ↓
    h ← g → i
```

- **Chain from `h`**: `{h, g, f, c, b, a, e}` (upstream only; `i` excluded - would require reversal at `g`)
- **Chain from `e`**: `{e, c, f, g, h, i}` (downstream only; `a, b` excluded - would require reversal at `c`)
- **Chain from `c`**: Entire graph (both upstream and downstream)

### Pivot Block

A block with multiple inputs OR multiple outputs where perspective can rotate to focus on different subgraph paths.

### Focused Subgraph

The currently visible chain (bright, full opacity).

### Dimmed Subgraph

Blocks not in the current chain (faded, 30% opacity, non-interactive or click to refocus).

### Perspective Rotation

Right-click context menu on pivot blocks to change which path is "forward".

---

## Layout Algorithm

### Primary Axis

**Left-to-right**: upstream → downstream (source → destination)

### Layout Rules

1. **Primary axis**: Left-to-right (upstream → downstream)
2. **Merge points**: Stack vertically, converge to single output
3. **Split points**: Fan out vertically from single input
4. **Selected block**: Visually emphasized (glow, border)
5. **Dimmed blocks**: Reduced opacity (30%), non-interactive or click to refocus

**Example Layout**:
```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│  [a]─┐                                                   │
│      ├─▶[c]─▶[f]─▶[g]─┬─▶[i]                            │
│  [e]─┘               └─▶[h]  ← SELECTED                 │
│                                                          │
│  [b] (dimmed - not in chain)                             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Layout Engine Requirements

1. Topological sort of focused chain
2. Depth assignment (distance from selected block)
3. Vertical stacking at merge/split points
4. Minimize edge crossings

---

## Perspective Rotation

When a block has multiple paths through it, user can "rotate" to focus on a different one.

### Trigger

**Right-click context menu** on any pivot block.

### Menu Options

**For block with multiple inputs**:
```
Focus upstream path:
  • Via [block A]
  • Via [block B]
  • Via [block E]
```

**For block with multiple outputs**:
```
Focus downstream path:
  • To [block H]
  • To [block I]
```

### Effect

Rotating changes which subgraph is "forward" and which is dimmed. The selected block stays selected, but the visible chain changes.

---

## Combine Semantics and Visibility

All blocks support multiple inputs with combine modes (sum, average, last, etc.).

### Visibility Rule

- If a combine mode means an input **never contributes** to output (e.g., `combine: 'last'` with deterministic ordering), that upstream path is **always dimmed**
- If all inputs contribute, all upstream paths visible when focused on that block

---

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

---

## Visual States

| State | Appearance |
|-------|------------|
| **Focused** | Full opacity, highlighted border |
| **In chain** | Full opacity, normal border |
| **Dimmed** | 30% opacity, no border, click to refocus |
| **Hovered** | Subtle highlight (in chain) or "click to focus" hint (dimmed) |
| **Selected** | Glow effect, thicker border |

---

## Edge Rendering

Edges connect blocks visually:

- **In chain**: Solid lines, follow block color
- **Dimmed**: Faint lines, gray
- **Multiple edges to same port**: Show as bundled/merged visually

---

## Implementation Requirements

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

### Integration with Existing Stores

- `SelectionStore.selectedBlockId` - drives focus
- `SelectionStore.relatedBlockIds` - already computes direct connections
- `SelectionStore.highlightedBlockIds` - can be extended for chain
- **New**: `computeChain(blockId, patch, direction)` utility

---

## Advantages

1. **Predictable** - No user-created layout mess
2. **Focused** - See only what matters for current task
3. **Scalable** - Large graphs remain navigable
4. **Mobile-friendly** - No precision dragging required
5. **Simpler undo** - No position state to track
6. **Consistent** - Every user sees same layout for same graph

---

## Non-Goals (Explicit)

- Manual block positioning
- Saving/loading layout preferences
- Multiple simultaneous selections
- Minimap (full graph overview) - may add later if needed

---

## Open Questions

1. **Animation**: Should rotation/refocus animate smoothly or snap?
2. **Zoom**: Is zoom needed, or does dimming handle scale?
3. **Block sizing**: Fixed size or based on content (ports, label)?
4. **Touch**: Swipe gestures for rotation on mobile?

---

## Related Topics

- [Block System](./02-block-system.md) - Block/Edge definitions
- [Debug UI](./09-debug-ui-spec.md) - Another UI specification
- [Modulation Table UI](./14-modulation-table-ui.md) - Another UI-layer spec

---

*This specification can change freely as UI implementation detail (T3: Optional). Core graph semantics remain in Block System (T2: Structural).*
