# Sprint: Error Isolation for Unused Blocks

**Generated**: 2026-01-27
**Confidence**: HIGH: 5, MEDIUM: 0, LOW: 0
**Status**: READY FOR IMPLEMENTATION

## Sprint Goal

Enable patches to compile successfully even when disconnected/unused blocks have errors, converting those errors to warnings.

## Scope

**Deliverables**:
1. Reachability computation extracted into reusable module
2. Error filtering based on reachability
3. Warning emission for unreachable block errors
4. Comprehensive test coverage

## Work Items

### P0: Extract Reachability Computation

**Acceptance Criteria**:
- [ ] New `src/compiler/reachability.ts` module exports `computeRenderReachableBlocks()`
- [ ] Function takes `AcyclicOrLegalGraph` and returns `Set<BlockIndex>` of reachable blocks
- [ ] Logic mirrors Pass 7's `findRenderBlocks()` + backward traversal
- [ ] Unit tests verify reachability for various graph topologies

**Technical Notes**:
- Reuse `getBlockDefinition()` to identify render blocks (capability === 'render')
- Traverse edges backward from render blocks to find all dependencies
- Handle cycles gracefully (use visited set)
- Consider instance-creating blocks (Array) as always reachable if any downstream is

### P1: Filter Errors by Reachability

**Acceptance Criteria**:
- [ ] After Pass 6, compute reachable blocks
- [ ] Partition `unlinkedIR.errors` into "reachable" and "unreachable"
- [ ] Only "reachable" errors cause compilation failure
- [ ] "Unreachable" errors are preserved for warning conversion

**Technical Notes**:
- Modify `compile.ts` after line 262 (error check)
- Error has `blockId` field that maps to block index
- Need `blockIdToIndex` map (already in Pass 6)

### P2: Convert Unreachable Errors to Warnings

**Acceptance Criteria**:
- [ ] New diagnostic code `W_BLOCK_UNREACHABLE_ERROR` in diagnostics system
- [ ] Unreachable block errors emit warnings instead of errors
- [ ] Warning message includes: original error message, block ID, reason (disconnected)
- [ ] Warnings appear in DiagnosticConsole with appropriate severity

**Technical Notes**:
- Add to `src/diagnostics/types.ts`: `W_BLOCK_UNREACHABLE_ERROR` code
- Modify `src/compiler/diagnosticConversion.ts` or emit warnings directly
- Warning target should be the block (kind: 'block')

### P3: Test Coverage

**Acceptance Criteria**:
- [ ] Test: Disconnected block with error compiles, emits warning
- [ ] Test: Connected block with error fails compilation
- [ ] Test: Mix of reachable/unreachable errors - only reachable fail
- [ ] Test: Completely disconnected subgraph with errors - compiles
- [ ] Test: Block connected to non-render sink - still unreachable

**Technical Notes**:
- Add tests to `src/compiler/__tests__/compile.test.ts`
- Use fixture pattern for test patches
- Test both the filter function and end-to-end compile()

### P4: Update Error Messages

**Acceptance Criteria**:
- [ ] Warning message clearly explains why block was skipped
- [ ] Message suggests connecting the block or removing it
- [ ] Original error details preserved in warning

**Technical Notes**:
- Message format: "Block '{blockId}' has error but is not connected to render pipeline: {original error}. Consider connecting it or removing the block."

## Dependencies

- None (standalone change to compilation pipeline)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Users miss warnings for broken blocks | Medium | Low | Clear UI highlighting of warnings |
| Performance regression from double reachability | Low | Low | Can optimize later with Option B |
| Edge case in reachability (e.g., Camera block) | Medium | Medium | Test Camera and other special blocks |

## Out of Scope

- Optimizing Pass 6 to skip lowering unreachable blocks (future Option B)
- UI changes to highlight disconnected blocks differently
- Runtime handling of partial compilation (not needed - unreachable blocks never in schedule)
