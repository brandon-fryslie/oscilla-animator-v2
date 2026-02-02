# Definition of Done: Error Isolation & Compiler Robustness

**Generated**: 2026-02-02
**Sprint**: Fix TypeScript errors and test failures from type system refactor
**Epic**: oscilla-animator-v2-juhf

## Acceptance Criteria

### 1. TypeScript Compilation — Zero Errors

- [ ] `npm run typecheck` exits with code 0
- [ ] Fix `InputSuggestion` → `Suggestion` rename in AutocompleteDropdown test + component
- [ ] Fix `AnyBlockDef` vs `BlockDef` in `sync.ts` (handle `CompositeBlockDef` missing `lower`)

### 2. Test Suite — Zero Failures

- [ ] `npm test` reports 0 failures (skipped tests OK)
- [ ] Fix adapter-spec.test.ts (6 failures): update to match current adapter API after type system refactor
- [ ] Fix unit-validation.test.ts (2 failures): replace `unitPhase01()` with current API
- [ ] Fix FloatValueRenderer.test.tsx (3 failures): update norm01 renderer expectations or fix renderer
- [ ] Fix ValueRenderer.test.ts (2 failures): update registry matching expectations
- [ ] Fix connection-validation.test.ts (2 failures): update adapter-aware validation expectations

### 3. Code Quality

- [ ] No `as any` casts introduced to silence errors
- [ ] Tests updated to match actual behavior (not behavior bent to match old tests)
- [ ] If test expectations were wrong (testing old API), update tests
- [ ] If implementation is wrong (regression), fix implementation

### 4. Verification Commands

```bash
# Both must pass
npm run typecheck
npm test
```

## Exit Criteria

All checkboxes above must be checked. Zero typecheck errors, zero test failures.
