# Definition of Done: test-infra-fix

Generated: 2026-01-26T05:02:00

## Mandatory Checks

- [ ] **All crossfade tests pass**: `npx vitest run src/runtime/__tests__/continuity-integration.test.ts` shows 17/17 passing
- [ ] **No type errors**: `npx tsc --noEmit` produces no errors for modified files
- [ ] **No regressions**: `npm run test` passes (or only pre-existing failures)

## Verification Commands

```bash
# Run just the continuity integration tests
npx vitest run src/runtime/__tests__/continuity-integration.test.ts

# Check types
npx tsc --noEmit 2>&1 | grep -i "continuity\|runtime-test"

# Run all tests
npm run test
```

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Crossfade tests passing | 0/2 | 2/2 |
| Type errors in test file | 20+ | 0 |
| Total continuity integration tests | 15/17 | 17/17 |
