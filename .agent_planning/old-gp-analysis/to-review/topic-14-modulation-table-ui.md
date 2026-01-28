---
topic: 14
name: Modulation Table UI
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/14-modulation-table-ui.md
category: to-review
audited: 2026-01-24T20:00:00Z
item_count: 2
---

# Topic 14: Modulation Table UI — To Review

These items represent cases where the implementation takes a different approach than specified but may serve the same purpose.

## Also

Primary analysis in `unimplemented/topic-14-modulation-table-ui.md`.

## Items

### R-14: Block-level adjacency matrix vs port-level modulation table
**Spec says**: Port-level table (rows = input ports, columns = output ports, cells = edges).
**Implementation does**: `ConnectionMatrix.tsx` shows block-level adjacency (rows = source blocks, columns = target blocks). Cells show edge count between block pairs.
**Possible justification**: Block-level view is simpler for overview; port-level detail available in BlockInspector when a block is selected. May be a deliberate UX simplification.
**Risk if wrong**: Users can't create or manage individual port connections from the table without switching to graph editor.
**Files**: `/Users/bmf/code/oscilla-animator-v2/src/ui/components/ConnectionMatrix.tsx`

### R-15: TableView as block list vs modulation table
**Spec says**: Table-based UI view for creating and managing edges between ports.
**Implementation does**: `TableView.tsx` is a flat block list showing type, domain, input/output counts. Expandable rows show port connections.
**Possible justification**: Serves as a quick overview/navigation tool rather than an edge management surface. The BlockInspector handles actual edge creation/editing.
**Risk if wrong**: No single-screen view for managing all modulation relationships simultaneously.
**Files**: `/Users/bmf/code/oscilla-animator-v2/src/ui/components/TableView.tsx`
