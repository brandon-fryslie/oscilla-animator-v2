# Work Evaluation - 2026-01-09
Scope: work/P3-connection-matrix
Confidence: FRESH

## Goals Under Evaluation
From DOD-20260110-150000.md - P3: Connection Matrix Table View:
1. Matrix renders with block IDs/displayNames as row headers
2. Matrix renders with block IDs/displayNames as column headers  
3. Cells show ● when edge exists (row=source → col=target)
4. Multiple edges show count: ●2, ●3, etc.
5. Click cell → selects all edges between those blocks
6. Click row header → selects that block
7. Diagonal cells show = (self-reference indicator)
8. Bus blocks grouped in separate "BUSES" section below matrix
9. TimeRoot blocks filtered out entirely
10. Horizontal scroll works for wide matrices

## Previous Evaluation Reference
No previous evaluation exists for P3 Connection Matrix.

## Persistent Check Results
| Check | Status | Output Summary |
|-------|--------|----------------|
| `npm run typecheck` | PASS | No type errors |
| `npm run test` | PASS | 146/146 tests passing |
| `npm run dev` | PASS | Server starts on port 5177 |

No specific tests exist for ConnectionMatrix component.

## Code Analysis

### Implementation Review

**ConnectionMatrix Component** (`src/ui/components/ConnectionMatrix.tsx`):
- Lines 49-60: `categorizeBlocks()` filters blocks by role
  - Filters out `role.kind === 'timeRoot'`
  - Separates `role.kind === 'bus'` from regular blocks
- Lines 42-44: `getBlockDisplayName()` uses `displayName || label || id`
- Lines 74-116: Column definitions - first column is row headers, then one per block
- Lines 128-188: Cell rendering logic:
  - Line 138-143: Self-reference shows `=`
  - Line 146-151: Finds edges between source/target
  - Lines 154-168: Single edge shows `●` (green, clickable)
  - Lines 174-186: Multiple edges show `●{count}`
- Lines 105-108: Row header click selects block via `getSelectionState().selectBlock()`
- Lines 161-164: Single edge click selects edge via `getSelectionState().selectEdge()`
- Lines 212-234: Bus section header and rows

**Integration** (`src/main.ts`):
- Lines 29-33: Global variables for UI components
- Lines 278-280: ConnectionMatrix receives patch updates
- Lines 405-411: Matrix tab setup in center panel

### Critical Issue #1: Role Assignment Missing

**Problem**: The demo patch doesn't assign roles to blocks.

**Evidence**:
- `src/main.ts` lines 135-251: Demo patch calls `b.addBlock()` without `role` option
- `src/graph/Patch.ts` line 108: PatchBuilder defaults to `role: { kind: 'user', meta: {} }`
- `src/ui/components/ConnectionMatrix.tsx` line 53: Filters `role.kind === 'timeRoot'`

**Impact**: 
- TimeRoot block (InfiniteTimeRoot at line 137) has `role.kind === 'user'`
- ConnectionMatrix won't filter it out (criterion #9 FAILS)
- No bus blocks in demo, so bus grouping untested (criterion #8)

**Root Cause**: Role assignment is manual, not derived from block type. Block registry doesn't include role information.

### Critical Issue #2: Multi-Edge Selection Not Implemented

**Problem**: Clicking cell with multiple edges only selects first edge, not all edges.

**Evidence**:
- `src/ui/components/ConnectionMatrix.tsx` lines 179-182:
  ```typescript
  onClick={() => {
    // Select the first edge (TODO: support multi-edge selection)
    getSelectionState().selectEdge(edges[0].id);
  }}
  ```
- Line 172: Comment says "could be enhanced to select all edges"

**Impact**: Criterion #5 "Click cell → selects all edges between those blocks" FAILS

**Note**: Criterion says "all edges" but current implementation only selects one.

## Assessment

### ✅ Working (Code Analysis)
- [x] **Matrix structure**: DataGrid renders with row/column headers (lines 74-116, 192-237)
- [x] **Display names**: Uses `displayName || label || id` fallback (line 43)
- [x] **Connection indicators**: Shows ● for single edge (lines 154-168)
- [x] **Multiple edge count**: Shows ●2, ●3, etc. (lines 174-186)
- [x] **Row header selection**: Click row header selects block (lines 105-108)
- [x] **Self-reference indicator**: Diagonal cells show = (lines 138-143)
- [x] **Bus section structure**: BUSES header row exists (lines 212-220)
- [x] **Horizontal scroll**: DataGrid provides horizontal scrolling by default

### ❌ Not Working (Code Analysis)
- [ ] **TimeRoot filtering**: TimeRoot blocks not filtered (role assignment missing)
  - Demo patch doesn't assign `timeRootRole()` to InfiniteTimeRoot block
  - All blocks default to `userRole()`
  - Matrix will show time block in first row
  
- [ ] **Multi-edge selection**: Clicking cell selects only first edge, not all
  - Lines 179-182: Explicit TODO comment
  - Implementation calls `selectEdge(edges[0].id)` for multiple edges
  - Selection API may not support multi-selection

### ⚠️ Untested (No Runtime Data)
- [ ] **Bus grouping**: No bus blocks in demo patch to verify grouping works
- [ ] **Cell edge selection**: Single edge selection not manually verified
- [ ] **Visual appearance**: Colors, fonts, spacing not verified in browser
- [ ] **Horizontal scroll**: Not manually tested with wide matrix

## Break-It Testing (Not Performed)

Manual testing not completed. Should test:

**Input attacks:**
- Patch with no blocks (empty matrix)
- Patch with many blocks (>50, test performance)
- Blocks with very long displayNames
- Blocks with null/undefined displayNames
- Blocks with special characters in names

**State attacks:**
- Click multiple cells rapidly
- Click cell while patch is updating
- Resize window while viewing matrix

**Edge cases:**
- Patch with only TimeRoot blocks
- Patch with only Bus blocks  
- Patch with multiple edges same source/target
- Patch with edges to/from same block (self-loops)

## Data Flow Verification (Not Performed)

Should verify:
1. `buildPatch()` creates patch with correct roles
2. `compile()` preserves block metadata
3. `setPatch()` updates ConnectionMatrix state
4. Matrix re-renders when patch changes
5. Selection state updates propagate to other UI components

## Evidence

**Code locations:**
- `src/ui/components/ConnectionMatrix.tsx`: Full implementation
- `src/main.ts` lines 405-411: Tab integration
- `src/graph/Patch.ts` line 108: Default role assignment

**Manual testing**: NOT PERFORMED
- Browser UI not manually inspected
- No screenshots captured
- Selection behavior not verified

## Ambiguities Found

| Decision | What Was Assumed | Should Have Asked | Impact |
|----------|------------------|-------------------|--------|
| Role assignment | Blocks get roles from block type | Should roles be derived from BlockType or set manually? | TimeRoot filtering broken |
| Multi-edge selection | Selection API supports multi-select | Does selection state support selecting multiple edges? | Criterion incomplete |
| Bus block testing | Bus blocks exist in demo | Should demo include bus blocks? | Bus section untested |

## Missing Checks (implementer should create)

1. **Unit test for categorizeBlocks** (`src/ui/components/__tests__/ConnectionMatrix.test.ts`)
   - TimeRoot blocks filtered correctly
   - Bus blocks separated from regular blocks
   - Empty patch returns empty arrays
   
2. **Unit test for getBlockDisplayName**
   - displayName takes precedence
   - Falls back to label
   - Falls back to id
   - Handles null/undefined gracefully

3. **Integration test for Matrix rendering**
   - Matrix renders with demo patch
   - Correct number of rows/columns
   - Cells show connection indicators
   - Bus section appears when buses present

4. **E2E test for selection** (`tests/e2e/matrix-selection.test.ts`)
   - Click row header → block selected
   - Click cell with single edge → edge selected
   - Click cell with multiple edges → all edges selected (when implemented)

## Verdict: INCOMPLETE

## What Needs to Change

### HIGH PRIORITY (Blocking DoD)

1. **Fix TimeRoot filtering** - `src/main.ts` lines 135-137
   ```typescript
   // WRONG:
   const time = b.addBlock('InfiniteTimeRoot', { periodAMs: 16000, periodBMs: 32000 });
   
   // CORRECT:
   const time = b.addBlock('InfiniteTimeRoot', 
     { periodAMs: 16000, periodBMs: 32000 },
     { role: timeRootRole() }
   );
   ```
   Import `timeRootRole` from `../types`

2. **Implement multi-edge selection** - `src/ui/components/ConnectionMatrix.tsx` lines 179-182
   - Check if `SelectionState` supports multi-edge selection
   - If yes: iterate all edges and select each
   - If no: needs selection API enhancement OR change DoD to "selects first edge"

### MEDIUM PRIORITY (Testing)

3. **Add bus block to demo** - `src/main.ts` after line 137
   ```typescript
   const signalBus = b.addBlock('Bus', {}, { 
     role: busRole(),
     displayName: 'Signal Bus' 
   });
   ```
   Wire it into the patch to verify bus section appears

4. **Add unit tests** - Create `src/ui/components/__tests__/ConnectionMatrix.test.ts`
   - Test `categorizeBlocks()` with all role types
   - Test `getBlockDisplayName()` fallback chain
   - Mock patch data, verify filtering logic

### LOW PRIORITY (Polish)

5. **Manual runtime testing** - Launch browser, verify:
   - Matrix visual appearance matches mockups
   - Colors, fonts, spacing correct
   - Horizontal scroll works smoothly
   - Selection updates Inspector panel

## Questions Needing Answers (if PAUSE)

None - issues are clear implementation gaps, not ambiguities requiring clarification.

## Manual Testing TODO (for next evaluation)

After fixes applied, perform manual testing:
1. Start dev server: `npm run dev`
2. Open http://localhost:5177 in Chrome
3. Click "Matrix" tab in center panel
4. Verify TimeRoot block NOT visible in matrix
5. Verify bus blocks appear in separate "BUSES" section
6. Click row header → check Inspector shows selected block
7. Click cell with single edge → check Inspector shows edge
8. Click cell with multiple edges → verify all edges selected
9. Test horizontal scrolling with wide matrix
10. Take screenshots for documentation

## Next Steps

1. Fix role assignment in demo patch (5 min)
2. Investigate multi-edge selection (SelectionState API review)
3. Decide: implement multi-select OR update DoD to "first edge"
4. Add bus block to demo (5 min)
5. Manual browser testing (15 min)
6. Write unit tests (30 min)

Estimated time to COMPLETE: 1-2 hours
