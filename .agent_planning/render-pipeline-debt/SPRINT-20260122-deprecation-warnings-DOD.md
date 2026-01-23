# Definition of Done: deprecation-warnings

## Acceptance Criteria

### Rate-Limiting
- [ ] Each deprecated kernel (sin, cos, tan) warns at most once per session
- [ ] Subsequent evaluations of the same kernel produce no additional warnings
- [ ] Different deprecated kernels warn independently

### Correctness
- [ ] Deprecated kernels still delegate to their replacements correctly
- [ ] Output values match the replacement kernels exactly

### Tests
- [ ] Test file exists: `src/runtime/__tests__/signal-kernel-deprecation.test.ts`
- [ ] Tests pass: `npm run test -- signal-kernel-deprecation`
- [ ] Coverage: once-per-session behavior for all 3 deprecated kernels
- [ ] Coverage: independence between different deprecated kernels
- [ ] Coverage: output correctness (same as replacement)
- [ ] Coverage: warning message content includes replacement name

### Code Quality
- [ ] No new lint errors
- [ ] TypeScript compiles cleanly
- [ ] `resetDeprecationWarnings()` exported for test isolation

## Verification Commands

```bash
npm run typecheck
npm run test -- signal-kernel-deprecation
npm run test -- signal-kernel-contracts  # existing tests still pass
```
