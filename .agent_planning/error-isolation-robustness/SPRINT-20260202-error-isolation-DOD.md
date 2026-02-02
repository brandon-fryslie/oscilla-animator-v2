# Definition of Done: Error Isolation & Compiler Robustness

**Epic:** oscilla-animator-v2-juhf
**Sprint:** 2026-02-02
**Confidence:** HIGH

## Acceptance Criteria

### AC1: Zero TypeScript Errors
- `npm run typecheck` passes with zero errors
- Specific fixes needed:
  - `AutocompleteDropdown.test.tsx`: Fix `InputSuggestion` import → `Suggestion`
  - `AutocompleteDropdown.tsx`: Fix `"input"` type in `SuggestionType`
  - `sync.ts` (3 errors): Handle `AnyBlockDef` vs `BlockDef` (`CompositeBlockDef` missing `lower`)

### AC2: Zero Test Failures
- `npx vitest run` passes with zero failures
- Specific fixes needed:
  - `connection-validation.test.ts`: 4 payload constraint validation tests failing
  - Root cause: payloadVar + allowedPayloads interaction logic

### AC3: Integration Test for Connected Block Compilation Failure
- New test in `src/compiler/__tests__/compile.test.ts` (error isolation describe block)
- Test verifies: If a block connected to render has an error, compilation fails (not isolated)
- Bead: oscilla-animator-v2-2kl7

### AC4: Error Isolation Demo Verification
- Start dev server, load Error Isolation Demo patch
- Verify: Unreachable blocks with errors → warnings (not hard failures)
- Verify: Connected blocks with errors → compilation failure
- Verify: Animation renders without glitches
- Bead: oscilla-animator-v2-p9ov

### AC5: Unstaged Changes Resolved
- Investigate changes in: path-blocks.ts, path-operators-blocks.ts, GraphEditorCore.tsx, graphEditor/index.ts, nodeDataTransform.ts
- Determine: commit, continue WIP, or revert
- Bead: oscilla-animator-v2-5gxk

## Machine Verification
- `npm run typecheck` → 0 errors
- `npx vitest run` → 0 failures
- `npm run dev` → loads without errors, Error Isolation Demo works

## Exit Criteria
All beads under oscilla-animator-v2-juhf are closed or explicitly deferred with rationale.
