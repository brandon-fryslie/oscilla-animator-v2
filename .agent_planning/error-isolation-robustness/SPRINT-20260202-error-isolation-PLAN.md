# Sprint Plan: Error Isolation & Compiler Robustness

**Epic:** oscilla-animator-v2-juhf
**Sprint:** 2026-02-02
**Confidence:** HIGH

## Context

The Error Isolation feature was previously implemented. This sprint is cleanup: fixing TypeScript errors, test failures, adding missing tests, and final verification.

## Work Items

### 1. Fix TypeScript Errors (AC1)

**AutocompleteDropdown issues (2 errors):**
- `src/ui/expression-editor/__tests__/AutocompleteDropdown.test.tsx:9` - imports `InputSuggestion` which doesn't exist. Check `src/expr/suggestions.ts` for correct export name.
- `src/ui/expression-editor/AutocompleteDropdown.tsx:59` - uses `"input"` as a SuggestionType value. Check `SuggestionType` union and either add `"input"` or use correct variant.

**sync.ts issues (3 errors):**
- `src/ui/reactFlowEditor/sync.ts:207,274,491` - `AnyBlockDef` includes `CompositeBlockDef` which lacks `lower`. Need to either:
  - Add type guard to narrow `AnyBlockDef` to `BlockDef` before passing
  - Or handle `CompositeBlockDef` separately in these callsites

### 2. Fix Failing Tests (AC2)

**connection-validation.test.ts (4 failures):**
- All in "Payload constraint validation" section
- Tests expect `payloadVar` + `allowedPayloads` to correctly block/allow connections
- Root cause: `validateConnection` doesn't properly check `allowedPayloads` against `payloadVar` constraints
- Fix is in `src/ui/reactFlowEditor/connectionValidation.ts` (or equivalent)

### 3. Add Integration Test (AC3)

- Add test to `src/compiler/__tests__/compile.test.ts` in error isolation describe block
- Test: Create a patch where a block connected to render has an error → compilation should fail
- This validates reachability analysis correctly identifies connected blocks

### 4. Verify Error Isolation Demo (AC4)

- Start dev server
- Load Error Isolation Demo patch
- Check: warnings for unreachable errored blocks, failures for connected errored blocks
- Check: animation renders

### 5. Resolve Unstaged Changes (AC5)

- `git diff` on each file to understand what changed
- Determine appropriate action for each

## Dependencies
None - all items are independent and can be worked in order listed.

## Unknowns to Resolve
None - all issues have clear root causes.
