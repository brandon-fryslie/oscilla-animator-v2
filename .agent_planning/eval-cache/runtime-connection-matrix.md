# Runtime Behavior: Connection Matrix

**Component**: `src/ui/components/ConnectionMatrix.tsx`
**Last Verified**: 2026-01-09
**Confidence**: FRESH (code analysis only, no manual testing)

## Block Filtering (categorizeBlocks)

**Filters by role.kind:**
- `role.kind === 'timeRoot'` → excluded from matrix
- `role.kind === 'bus'` → separated into "BUSES" section
- All others → regular blocks section

**CRITICAL**: Filtering depends on blocks having correct roles assigned.
- Default role from PatchBuilder is `{ kind: 'user', meta: {} }`
- Block types don't auto-assign roles - must be explicit in `addBlock()` call
- Demo patch (src/main.ts) doesn't set roles → TimeRoot filtering FAILS

## Display Name Resolution (getBlockDisplayName)

**Fallback chain:**
1. `block.displayName` (if not null)
2. `block.label` (if exists)
3. `block.id` (always exists)

**Result**: Always returns a string, never null/undefined.

## Cell Rendering Behavior

**Self-reference (source === target):**
- Shows `=` symbol (gray/muted color)

**Single edge:**
- Shows `●` (green color)
- Clickable → calls `getSelectionState().selectEdge(edgeId)`

**Multiple edges (2+):**
- Shows `●{count}` (e.g., `●2`, `●3`)
- Clickable → calls `getSelectionState().selectEdge(edges[0].id)`
- **ONLY SELECTS FIRST EDGE** (line 181 comment: "TODO: support multi-edge selection")

**No edge:**
- Empty cell (no content)

## Selection Integration

**SelectionState API** (`src/ui/state/selection.ts`):
- Supports SINGLE selection only (discriminated union)
- Cannot select multiple edges simultaneously
- Types: `'none' | 'block' | 'edge' | 'port'`

**Consequence**: "Select all edges between blocks" requires either:
1. Extend SelectionState to support multi-selection
2. Change requirement to "select first edge"
3. Create new selection behavior (e.g., highlight all edges visually)

## Bus Section Structure

**When bus blocks exist:**
1. Regular blocks render first
2. Section header row: `displayName: 'BUSES'`, `isHeader: true`
3. Bus block rows follow

**Header row behavior:**
- No clickable content in cells
- Visual separator only

## DataGrid Configuration

- `hideFooter`: No pagination controls
- `disableColumnMenu`: No column operations
- `disableRowSelectionOnClick`: Row selection handled manually
- `rowHeight: 32`: Compact rows
- Horizontal scroll: Built-in DataGrid feature

## Known Issues

1. **Role assignment**: Demo doesn't assign timeRootRole() → filter fails
2. **Multi-edge selection**: Only first edge selected, not all
3. **Untested paths**: No bus blocks in demo, bus section not verified
4. **No tests**: Component has no unit or integration tests

## Break-It Testing Needed

- Empty patch (no blocks)
- Large patch (50+ blocks, performance)
- Very long displayNames (truncation)
- Null/undefined displayNames (should use fallback)
- Multiple self-loops (diagonal cells)
- Rapid clicking (race conditions)

## Related Components

- **TableView**: Alternative blocks view (src/ui/components/TableView.tsx)
- **BlockInspector**: Shows details of selected block/edge
- **SelectionState**: Manages UI selection (single-select only)
