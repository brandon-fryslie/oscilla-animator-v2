# Definition of Done: Error Isolation for Unused Blocks

**Sprint**: SPRINT-20260127-error-isolation
**Date**: 2026-01-27

## Acceptance Criteria

### Functional Requirements

- [ ] **F1**: A patch with only disconnected blocks having errors compiles successfully
- [ ] **F2**: A patch with connected blocks having errors still fails to compile
- [ ] **F3**: When unreachable block errors are converted to warnings, they appear in the diagnostic console
- [ ] **F4**: Warning message includes original error details and suggests resolution
- [ ] **F5**: Reachability correctly identifies blocks feeding into render blocks (transitively)

### Test Requirements

- [ ] **T1**: Unit test for `computeRenderReachableBlocks()` with simple graph
- [ ] **T2**: Unit test for reachability with diamond dependency pattern
- [ ] **T3**: Unit test for reachability with multiple render blocks
- [ ] **T4**: Integration test: disconnected Expression block with syntax error → compiles
- [ ] **T5**: Integration test: connected block with error → fails
- [ ] **T6**: Integration test: subgraph not connected to render → compiles with warnings

### Code Quality

- [ ] **Q1**: New code follows existing patterns in compile.ts
- [ ] **Q2**: Reachability module is independently testable
- [ ] **Q3**: No new `any` types without explicit justification
- [ ] **Q4**: TypeScript compiles with no errors

### Documentation

- [ ] **D1**: Brief inline comment in compile.ts explaining error filtering logic
- [ ] **D2**: Warning code documented in diagnostics types

## Verification Steps

1. Run `npm run typecheck` - passes
2. Run `npm run test` - all tests pass
3. Manual test:
   - Create patch with working render pipeline
   - Add disconnected Expression block with `syntax error!!!`
   - Verify: animation renders, warning appears in console
4. Manual test:
   - Connect that Expression block to render pipeline
   - Verify: compilation fails with error

## Exit Criteria

All checkboxes above must be checked before sprint is complete.
