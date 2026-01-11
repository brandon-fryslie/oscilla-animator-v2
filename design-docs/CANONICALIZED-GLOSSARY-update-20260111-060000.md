---
command: /canonicalize-architecture design-docs/ design-docs/final-System-Invariants/
run_type: UPDATE
indexed: true
canonical_base: design-docs/CANONICAL-oscilla-v2.5-20260109/
timestamp: 2026-01-11T06:00:00Z
---

# Canonical Glossary Update

**Status**: New terms from linear graph editor specification
**Created**: 2026-01-11T06:00:00Z
**Source**: `design-docs/spec/10-linear-graph-editor.md`

---

## NEW Terms (From Linear Graph Editor Spec)

These terms should be added to the canonical GLOSSARY.md:

### Chain

**Definition**: The tree of blocks reachable from a selected block by traversing edges without reversing direction (downstream only OR upstream only, not both from any given node)

**Type**: concept
**Source**: `design-docs/spec/10-linear-graph-editor.md` (Chain Traversal Rules)
**Encyclopedia Location**: Topic 15: Graph Editor UI
**Related**: Pivot Block, Focused Subgraph, Dimmed Subgraph
**Example**: From block `h` in graph `a → b → c → f → g → h`, the chain includes `{h, g, f, c, b, a}` (all upstream), but NOT blocks downstream of `g` because that would require reversal

---

### Pivot Block

**Definition**: A block with multiple inputs OR multiple outputs where perspective can rotate to focus on different subgraph paths

**Type**: concept
**Source**: `design-docs/spec/10-linear-graph-editor.md` (Perspective Rotation)
**Encyclopedia Location**: Topic 15: Graph Editor UI
**Related**: Chain, Perspective Rotation
**Example**: A combine block with 3 inputs is a pivot block - user can rotate to focus upstream via any of the 3 input paths

---

### Focused Subgraph

**Definition**: The currently visible chain of blocks displayed at full opacity in the graph editor

**Type**: UI state
**Source**: `design-docs/spec/10-linear-graph-editor.md` (Terminology)
**Encyclopedia Location**: Topic 15: Graph Editor UI
**Related**: Chain, Dimmed Subgraph
**Example**: When block `c` is selected, the focused subgraph is all blocks in `c`'s chain

---

### Dimmed Subgraph

**Definition**: Blocks not in the current chain, rendered at reduced opacity (faded but visible)

**Type**: UI state
**Source**: `design-docs/spec/10-linear-graph-editor.md` (Terminology)
**Encyclopedia Location**: Topic 15: Graph Editor UI
**Related**: Chain, Focused Subgraph
**Example**: When focusing on one branch of a split, the other branch becomes dimmed

---

### Perspective Rotation

**Definition**: UI interaction (typically right-click context menu) to change which path through a pivot block is "forward" and which is dimmed

**Type**: UI interaction
**Source**: `design-docs/spec/10-linear-graph-editor.md` (Perspective Rotation)
**Encyclopedia Location**: Topic 15: Graph Editor UI
**Related**: Pivot Block, Chain
**Example**: Right-clicking a block with 2 downstream outputs shows menu: "Focus downstream path: • To [block H] • To [block I]"

---

## CONFLICTING Terms

None - all terms from the linear graph editor are new UI concepts with no overlap with existing canonical terms.

---

## COMPLEMENTARY Definitions

None - the graph editor specification is self-contained and doesn't elaborate on existing terms.

---

## Naming Conventions

The linear graph editor spec follows existing conventions:
- Concept names: PascalCase when used as nouns ("Pivot Block", "Focused Subgraph")
- UI states: Clear descriptive names matching visual appearance (Focused/Dimmed)
- Interactions: Action-oriented names (Perspective Rotation)

---

## Summary

| Type | Count | Details |
|------|-------|---------|
| **New terms** | 5 | Chain, Pivot Block, Focused Subgraph, Dimmed Subgraph, Perspective Rotation |
| **Conflicting terms** | 0 | No overlap with existing glossary |
| **Complementary** | 0 | Self-contained spec |

**Recommendation**: Add all 5 terms to GLOSSARY.md under a "Graph Editor UI" section.

---

**END OF GLOSSARY UPDATE**
