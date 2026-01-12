---
indexed: true
source: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/15-graph-editor-ui.md
source_hash: 4fd84d090f34
source_mtime: 2026-01-12T00:00:00Z
original_tokens: ~5000
index_tokens: ~1800
compression: 36.0%
index_version: 1.0
---

# INDEX: Topic 15 - Graph Editor UI - Linear Auto-Layout

**Tier**: T3 (Optional) - UI implementation detail, not a finalized spec

---

## 1. SUMMARY (One-paragraph TL;DR)

A graph editor with automatic linear layout where blocks are positioned left-to-right (upstream to downstream) without manual positioning. Users navigate by selecting blocks to focus on specific subgraphs and right-clicking on pivot blocks to rotate perspective and view different paths. The design eliminates layout management overhead by computing and displaying only the relevant chain of blocks while dimming unrelated ones.

---

## 2. CANONICAL CONCEPTS (Index by Name)

| Concept | Definition | Key References |
|---------|-----------|-----------------|
| **Chain** | Tree of blocks reachable from a selected block by traversing edges without reversing direction (follow outputs downstream OR inputs upstream, but not both) | Lines 26-47, Example at lines 36-46 |
| **Pivot Block** | A block with multiple inputs OR multiple outputs where perspective can rotate to focus on different subgraph paths | Lines 49-51 |
| **Focused Subgraph** | The currently visible chain displayed in full opacity and brightness | Line 55 |
| **Dimmed Subgraph** | Blocks not in the current chain, faded to 30% opacity and non-interactive (or clickable to refocus) | Lines 57-59 |
| **Perspective Rotation** | Right-click context menu on pivot blocks to change which path is "forward" through the block | Lines 61-63 |
| **Primary Axis** | Left-to-right layout direction representing the flow from source (upstream) to destination (downstream) | Line 71 |
| **Combine Semantics** | Input value combination modes (sum, average, last, etc.) that determine whether an upstream path contributes to block output | Lines 136-141 |

---

## 3. INVARIANTS & CONSTRAINTS (Non-negotiable Rules)

1. **No manual positioning** - All block positions are computed automatically via layout algorithm; users cannot drag blocks
2. **Linear direction** - Layout is strictly left-to-right (upstream to downstream); no arbitrary positioning
3. **Chain coherence** - Displayed chain never reverses direction; once traversing downstream, cannot include upstream blocks (and vice versa)
4. **Selection drives focus** - The currently selected block determines which chain is visible and in full opacity
5. **Dimming constraint** - Blocks outside the focused chain are always at exactly 30% opacity when a selection exists
6. **Combine visibility rule** - If a combine mode means an input never contributes to output, that upstream path is always dimmed
7. **Single selection** - Only one block can be selected at a time (multi-select is explicitly non-goal)

---

## 4. DEPENDENCIES & RELATIONSHIPS

### Upstream Dependencies
- **`02-block-system.md`** - Block and Edge definitions; provides the data model for nodes and connections
- **`10-linear-graph-editor.md`** (spec document) - Source specification; this topic implements the UI layer

### Related Topics
- **`09-debug-ui-spec.md`** - Another UI specification layer
- **`14-modulation-table-ui.md`** - Another UI-layer spec
- **`SelectionStore`** - Existing store (integration point); provides `selectedBlockId`, `relatedBlockIds`, `highlightedBlockIds`

### External Dependencies
- Topological sorting algorithm (for layout)
- Edge crossing minimization (for layout clarity)
- CSS/rendering system (for opacity, visual states, animations)

---

## 5. ENTRY POINTS & INTERFACES

### Primary User Interactions
1. **Click block** - Select it, compute and display its chain
2. **Click dimmed block** - Refocus to that block's chain
3. **Click empty space** - Deselect, show full graph (all dimmed equally)
4. **Double-click block** - Open inspector for parameters
5. **Right-click block** - Context menu (rotate perspective, delete, etc.)
6. **Arrow keys** - Move selection along chain
7. **Tab** - Cycle through blocks at same depth
8. **Escape** - Deselect / zoom out

### Programmatic Interfaces
- **`computeChain(blockId, patch, direction)`** - New utility to compute visible chain from selection
- **`GraphEditorState`** interface (lines 192-202):
  - `selectedBlockId: BlockId | null`
  - `focusedChain: Set<BlockId>`
  - `perspectiveHint?: { blockId, preferredUpstream?, preferredDownstream? }`

---

## 6. VALIDATION CRITERIA (How to Know It Works)

| Criterion | How to Verify | Success Condition |
|-----------|---------------|-------------------|
| **Correct chain computation** | Select a block; verify chain includes all reachable blocks without direction reversal | All blocks in focused chain are correct; no unnecessary blocks included |
| **Layout algorithm** | Render graph; verify blocks flow left-to-right without overlaps | No visual overlaps; upstream to downstream order maintained |
| **Dimming behavior** | Select block; observe unrelated blocks fade to 30% opacity | Unfocused blocks clearly dimmed; dimming level is consistent (30%) |
| **Perspective rotation** | Right-click pivot block; select alternate path; verify focus updates | New path displayed in focus; old path dimmed; selected block remains stable |
| **Combine semantics** | Configure combine mode to "last"; verify contributing inputs shown, non-contributing dimmed | Visibility correctly reflects combine logic |
| **Selection highlighting** | Select a block; verify it has glow effect and thicker border | Visual emphasis is clear and distinct from other blocks |
| **Edge rendering** | Verify in-chain edges are solid; dimmed edges are faint/gray | Edge styling matches visibility state |
| **Performance** | Test with large graphs (100+ blocks); interaction remains responsive | No noticeable lag on selection or perspective rotation |

---

## 7. OPEN QUESTIONS & FUTURE WORK

| Question | Impact | Status |
|----------|--------|--------|
| **Animation smoothness** | Should rotation/refocus animate smoothly or snap instantly? | UNRESOLVED - UI feel depends on answer |
| **Zoom requirement** | Is zoom needed, or does dimming handle scale adequately? | UNRESOLVED - May affect usability on large graphs |
| **Block sizing** | Fixed size or content-based (ports, label)? | UNRESOLVED - Affects layout engine complexity |
| **Touch gestures** | Should swipe gestures trigger rotation/navigation on mobile? | UNRESOLVED - May improve mobile UX |
| **Minimap** | Should full graph overview minimap be added later? | EXPLICITLY OUT OF SCOPE for v1; may add if needed |

---

## Non-Goals (Explicit Out-of-Scope)

- Manual block positioning
- Saving/loading layout preferences
- Multiple simultaneous selections
- Minimap (full graph overview) - may add later if needed
