---
parent: ../INDEX.md
topic: modulation-table-ui
order: 14
status: DRAFT
---

# Modulation Table UI

> A table-based UI view for creating and managing edges between ports.

**Related Topics**: [02-block-system](./02-block-system.md), [01-type-system](./01-type-system.md)
**Key Terms**: [Edge](../GLOSSARY.md#edge), [PortBinding](../GLOSSARY.md#portbinding), [Transform](../GLOSSARY.md#transform)
**Canonical Status**: UI specification only - does NOT define system architecture

---

## Important Notice

**This topic describes a UI VIEW, not authoritative system architecture.**

- Canonical architectural definitions come from other topics (Block System, Type System, etc.)
- This document describes interaction patterns and visual organization only
- Where this document references architectural concepts, the canonical spec wins

---

## Overview

The Modulation Table is a spreadsheet-like UI view for managing edges between block ports. It provides an alternative to graph-based patching for users who prefer tabular organization.

**Core Concept**:
- **Rows** = Input ports on blocks (things that can receive values)
- **Columns** = Output ports on blocks (things that produce values)
- **Cells** = Edges connecting outputs to inputs, with optional transform chains

---

## Table Structure

### Rows (Input Ports)

Each row represents an **input port** on a block that can receive edges.

**Row Sources**:
- Renderer block inputs (visual attributes: color, position, scale, etc.)
- User block inputs (any block with input ports)
- Domain block inputs (if domains have runtime-modulated parameters - TBD)

**Not Rows**:
- Output-only blocks (they create columns, not rows)
- Internal operator blocks (unless explicitly exposed by user)

### Columns (Output Ports)

Each column represents an **output port** on a block that can be connected to inputs.

**Column Sources**:
- Block outputs (any block with output ports)
- Rails (system-provided immutable values - appear in dedicated section)

**Column Organization**:
- Rails section (time.primary, etc.)
- User blocks section
- Combine mode indicator (how multiple inputs to same output are merged)

### Cells (Edges)

Each cell represents an **edge** from column's output port to row's input port.

**Cell States**:
- **Empty**: No edge
- **Direct**: Simple edge (output → input, no transforms)
- **Chained**: Edge with transform chain (output → transform₁ → transform₂ → ... → input)
- **Muted**: Edge exists but `enabled: false` (can be re-enabled without recreation)

---

## Transform Chains

Edges can include inline transform chains:

```
phaseOut → scale(0..1 → 0..360) → ease(inOut) → rotation
```

**Transforms**:
- **Adapters**: Type conversion (enable ports of different types to connect)
- **Lenses**: Value transformation (scale, offset, modulation)

See: [Glossary: Transform](../GLOSSARY.md#transform)

---

## Interaction Model

### Creating Edges

1. Click empty cell
2. System shows compatible outputs (type-compatible or convertible via adapter)
3. Select output
4. Edge created (with auto-inserted adapter if needed for type conversion)

### Adding Transforms

1. Right-click existing edge cell
2. Select "Add Transform"
3. Choose from registry (scale, ease, offset, etc.)
4. Transform inserted into chain

### Editing Transforms

1. Click cell with transform chain
2. Inline editor shows chain
3. Edit parameters, reorder, or remove transforms

### Muting

1. Right-click edge cell
2. Select "Mute"
3. Edge preserved but `enabled: false`
4. Can re-enable without recreating edge

---

## Visual Organization

### Grouping

Rows can be grouped hierarchically:
- By block (e.g., "Renderer.Particles" group contains all particle renderer ports)
- By semantic category (e.g., "Motion", "Color", "Transform")

**Note**: Semantic grouping metadata (category labels) comes from block registry, not UI layer.

### Filtering & Sorting

**Row Sorting**:
- Alphabetical (by port name)
- By block
- By activity (runtime value changes)
- Manual (user drag-reorder)

**Column Sorting**:
- Similar options to rows
- Default: TBD (implementation detail)

**Filtering**:
- Show/hide empty rows
- Show only specific block types
- Filter by port type

---

## Integration with Canonical Architecture

### Serialization

The table is a **UI view** over the patch data structure. It does NOT introduce a separate data format.

**Data Flow**:
1. User edits table (creates edge, adds transform)
2. Edit modifies patch (adds block if transform, adds edge)
3. Patch normalizes to NormalizedGraph
4. Compilation proceeds normally

**Round-trip**: Graph view and table view show same underlying patch.

### Transform Representation

Transform chains compile to blocks:

```
Visual: phaseOut → scale(0..1 → 0..360) → rotation

Underlying:
  ScaleBlock (kind: "Scale")
    inputs: [in: phaseOut]
    outputs: [out: wire1]

  Edge: wire1 → rotation input
```

**Transform Registry**: TBD - see roadmap for Lens/Transform system

### Rails

Rails appear as **columns only** (not rows):
- Dedicated "Rails" section in column header area
- Visually distinguished from user blocks
- Cannot be modified (immutable)

See: [Glossary: Rails](../GLOSSARY.md#rails)

---

## Rejected Concepts from Source Documents

The following concepts from source documents are **explicitly rejected** as not aligned with canonical architecture:

### ❌ Publishers/Listeners Model

**Source claim**: Buses have "publishers" and "listeners"

**Reality**:
- There are blocks with ports
- There are edges connecting ports
- "Publisher/listener" language is rejected

### ❌ Direct Bindings as Separate Concept

**Source claim**: `DirectBinding` as distinct from edge

**Reality**: All connections are edges (may have transforms inline, but still edges)

### ❌ Invented Domain Parameters

**Source claim**: Domains have "jitter", "spacing", "origin" parameters

**Reality**:
- Domain structure defined in [01-type-system](./01-type-system.md)
- Canonical spec defines `DomainDecl` with shape parameters
- UI spec has no authority to invent domain properties

### ❌ Recipe View System

**Source claim**: Pre-defined "recipe templates" with semantic groupings

**Reality**: Explicitly deferred - not part of v1 spec

### ❌ TimeRoot as Input Source

**Source claim**: TimeRoot has bindable inputs like loopDuration, playbackSpeed

**Reality**: TimeRoot structure defined in [03-time-system](./03-time-system.md) - source claim rejected

---

## Open Questions

### Q1: Transform/Lens Registry

**Status**: DEFERRED - roadmap item

Where are transforms defined and registered?
- Part of block registry?
- Separate transform registry?
- Type system integration?

### Q2: Default Column/Row Ordering

**Status**: IMPLEMENTATION DETAIL

Not specified in canonical spec. Left to UI implementation.

### Q3: Domain Parameters as Bindable Ports

**Status**: CANONICAL SPEC AUTHORITY

Whether domains have input ports depends on canonical domain definition, not this UI spec.

Refer to: [02-block-system](./02-block-system.md) for block structure

---

## Source Documents

This topic synthesized from:
- `design-docs/8.5-Modulation-Table/1-Completely-New-UI-Again.md`
- `design-docs/8.5-Modulation-Table/2-Spec.md`
- `design-docs/8.5-Modulation-Table/3-Canonical-Typed-Events.md` (events rejected)

**Integration Date**: 2026-01-10
**Resolution File**: `design-docs/8.5-Modulation-Table/RESOLUTIONS-SUMMARY.md`

---

## Implementation Notes

*This section reserved for future implementation details as UI is built.*

---

**Status**: DRAFT - UI specification extracted from historical documents with outdated assumptions removed
