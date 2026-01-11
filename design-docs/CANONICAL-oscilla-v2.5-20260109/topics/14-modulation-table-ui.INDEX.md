# Modulation Table UI - Indexed Summary

**Tier**: T3 (UI Implementation)
**Status**: DRAFT - UI spec extracted from historical documents
**Size**: 285 lines → ~75 lines (26% compression)

## Important Notice [L18-25]
**This is a UI VIEW**, not authoritative system architecture.

Canonical architecture comes from other topics. This describes UI interaction + visual organization only.

## Overview [L28-37]
Spreadsheet-like UI for managing edges. Alternative to graph-based patching.

**Core**:
- **Rows** = Input ports (things receiving values)
- **Columns** = Output ports (producing values)
- **Cells** = Edges connecting outputs to inputs with optional transforms

## Table Structure [L40-75]

**Rows** [L42-52]: Input ports on blocks (renderers, user blocks)
- Excluded: Output-only blocks, internal operators (unless exposed)

**Columns** [L54-65]: Output ports on blocks + Rails (system values)
- Organization: Rails section, user blocks section
- Combine mode indicator

**Cells** [L67-75]:
- Empty: No edge
- Direct: Simple edge
- Chained: Edge + transform chain
- Muted: Edge exists, enabled=false

## Transform Chains [L78-91]
Edges include inline transforms:
```
phaseOut → scale(0..1→0..360) → ease(inOut) → rotation
```

Types: Adapters (type conversion), Lenses (value transformation)

## Interaction Model [L94-123]

**Creating edges** [L97-102]: Click empty cell, show compatible outputs, select, create with auto-inserted adapter if needed

**Adding transforms** [L104-109]: Right-click edge, add transform, inserted into chain

**Editing transforms** [L111-115]: Click cell, inline editor shows chain, edit params/reorder/remove

**Muting** [L117-123]: Right-click, mute, edge preserved but disabled, can re-enable

## Visual Organization [L126-152]

**Grouping** [L128-135]: By block, by semantic category (from block registry)

**Filtering & Sorting** [L137-152]:
- Row sorting: Alphabetical, by block, by activity, manual drag
- Column sorting: Similar options
- Filtering: Empty rows, specific blocks, port type

## Integration with Canonical Architecture [L155-194]

**Serialization** [L157-167]: UI VIEW over patch data. Doesn't introduce separate format.
- User edits table → modifies patch → normalizes to NormalizedGraph
- Round-trip: Graph view and table view show same patch

**Transform Representation** [L169-182]:
Visual: `phaseOut → scale(0..1→0..360) → rotation`
Underlying: ScaleBlock + Edge
Transform registry: TBD

**Rails** [L184-193]: Appear as columns only, immutable, visually distinguished

## Rejected Concepts [L197-235]

**❌ Publishers/Listeners Model**: Reality is blocks + ports + edges

**❌ Direct Bindings as Separate**: All connections are edges

**❌ Invented Domain Parameters**: Domain structure defined in type system, not UI

**❌ Recipe View System**: Pre-defined templates deferred, not part of v1

**❌ TimeRoot as Input Source**: TimeRoot structure defined in time system, not UI

## Open Questions [L238-263]

**Q1: Transform/Lens Registry** (DEFERRED)
Where defined/registered? Block registry? Separate registry? Type system?

**Q2: Default Column/Row Ordering** (IMPLEMENTATION DETAIL)
Not specified. Left to UI.

**Q3: Domain Parameters as Bindable Ports** (CANONICAL SPEC AUTHORITY)
Depends on canonical domain definition, not this UI spec.

## Integration Notes
Source: `design-docs/8.5-Modulation-Table/`
- Extracted from historical documents 2026-01-10
- Outdated assumptions removed
- Resolution: `RESOLUTIONS-SUMMARY.md`

## Related
- [02-block-system](./02-block-system.md) - Block structure
- [01-type-system](./01-type-system.md) - Types
- [09-debug-ui-spec](./09-debug-ui-spec.md) - Another UI spec
- [15-graph-editor-ui](./15-graph-editor-ui.md) - Graph editor

**Status**: DRAFT - UI specification. Can change freely as implementation detail (T3).
