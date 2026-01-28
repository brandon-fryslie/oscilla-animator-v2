---
topic: 14
name: Modulation Table UI
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/14-modulation-table-ui.md
category: unimplemented
audited: 2026-01-24T20:00:00Z
item_count: 10
blocks_critical: []
tier: DRAFT (no tier assigned; UI spec only)
---

# Topic 14: Modulation Table UI — Unimplemented

The spec describes a spreadsheet-like Modulation Table where rows = input ports, columns = output ports, cells = edges with optional transform chains. The current implementation has two related components (`ConnectionMatrix` and `TableView`) that provide partial adjacency views but neither implements the spec's port-level modulation table design.

## Also

See `to-review/topic-14-modulation-table-ui.md` for items where the implementation diverges but may be acceptable.

## Items

### U-30: Port-level modulation table (rows = input ports, columns = output ports)
**Spec requirement**: Rows represent individual input ports on blocks; columns represent individual output ports on blocks. Cells show edges between specific port pairs.
**Scope**: New component or major rework of existing ones
**Blocks**: nothing — standalone UI feature
**Evidence of absence**: `ConnectionMatrix.tsx` operates at block-to-block granularity (rows = source blocks, columns = target blocks), not port-level. `TableView.tsx` is a flat block list, not a port matrix.

### U-31: Transform chain display and editing in cells
**Spec requirement**: Cells show transform chain (e.g., `phaseOut -> scale(0..1->0..360) -> ease(inOut) -> rotation`). Users can add/edit/reorder transforms inline.
**Scope**: New UI for inline transform editing, plus transform registry integration
**Blocks**: Transform/Lens registry (deferred per spec)
**Evidence of absence**: No transform chain UI in any component. Edges are shown as simple dots or connection arrows.

### U-32: Edge muting (enabled/disabled toggle)
**Spec requirement**: Right-click edge cell to "Mute" -- sets `enabled: false` while preserving the edge for easy re-enable.
**Scope**: UI interaction + already-supported `enabled` field on Edge type
**Blocks**: nothing — Edge type already has `enabled?: boolean`
**Evidence of absence**: No UI for toggling edge `enabled` state. The data model supports it (`Patch.ts` line 82-83) but no UI exposes it.

### U-33: Cell states (empty, direct, chained, muted)
**Spec requirement**: Cells visually distinguish four states: empty, direct connection, connection with transforms, and muted connection.
**Scope**: Visual design in table component
**Blocks**: U-31 (transform chains), U-32 (muting)
**Evidence of absence**: ConnectionMatrix shows only empty or dot (with count). No distinction between direct/chained/muted.

### U-34: Edge creation via cell click
**Spec requirement**: Click empty cell to create edge; system shows compatible outputs (type-compatible or convertible via adapter); auto-inserts adapter if needed.
**Scope**: New interaction flow with type compatibility checking
**Blocks**: nothing — type validation already exists in `typeValidation.ts`
**Evidence of absence**: ConnectionMatrix cells for empty pairs are non-interactive. No creation flow from table view.

### U-35: Hierarchical row grouping (by block, by semantic category)
**Spec requirement**: Rows grouped by block ("Renderer.Particles") or by semantic category ("Motion", "Color", "Transform"). Category metadata from block registry.
**Scope**: New grouping logic + metadata from block registry
**Blocks**: nothing — standalone UI
**Evidence of absence**: ConnectionMatrix has flat block rows with optional "BUSES" section header. No port-level grouping or semantic categories.

### U-36: Filtering and sorting (rows and columns)
**Spec requirement**: Sort by alphabetical, block, activity, manual drag-reorder. Filter by empty rows, block types, port types.
**Scope**: New sort/filter controls
**Blocks**: nothing — standalone UI
**Evidence of absence**: TableView has a disabled search input placeholder. ConnectionMatrix has no filtering/sorting UI.

### U-37: Rails section (columns for system-provided immutable values)
**Spec requirement**: Dedicated "Rails" section in column headers showing time.primary etc., visually distinguished, immutable.
**Scope**: Rails as special columns in modulation table
**Blocks**: nothing — standalone UI
**Evidence of absence**: No "rails" concept in any UI component. TimeRoot blocks are filtered out entirely.

### U-38: Combine mode indicator in columns
**Spec requirement**: Columns show how multiple inputs to same output are merged (combine mode).
**Scope**: Visual indicator per column
**Blocks**: nothing — CombineMode types already exist
**Evidence of absence**: No combine mode display in ConnectionMatrix or TableView.

### U-39: Round-trip between graph view and table view
**Spec requirement**: Graph view and table view show same underlying patch. Edits in either view modify the same patch.
**Scope**: Both views already read from PatchStore (partially satisfied)
**Blocks**: U-30 (port-level table needed first)
**Evidence of absence**: Both ConnectionMatrix and ReactFlowEditor read PatchStore, so structural round-trip exists. But ConnectionMatrix is read-only for edges (click only selects, doesn't edit), so true bidirectional editing is absent.
