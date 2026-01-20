# Definition of Done: fix-typecheck-tests

**Generated**: 2026-01-20
**Sprint**: Fix TypeScript and Test Failures

## Acceptance Criteria

### 1. TypeScript Compilation

- [ ] `npm run typecheck` completes with exit code 0
- [ ] No TypeScript errors in `src/diagnostics/__tests__/DiagnosticHub.test.ts`
- [ ] No TypeScript errors in `src/runtime/SignalEvaluator.ts`

### 2. Test Execution

- [ ] `npm test` completes successfully
- [ ] All 6 tests in `DiagnosticHub.test.ts` pass
- [ ] No regressions in other test files

### 3. Code Quality

- [ ] Event shapes in tests match `src/events/types.ts` definitions exactly
- [ ] No `as any` type assertions used to bypass type checking
- [ ] Helper functions used to reduce test boilerplate

### 4. Verification Commands

```bash
# Must pass
npm run typecheck

# Must show 0 failures (skipped tests are OK)
npm test

# Specific test file must pass all tests
npm test -- src/diagnostics/__tests__/DiagnosticHub.test.ts
```

## Exit Criteria

All checkboxes above must be checked before this sprint is complete.
