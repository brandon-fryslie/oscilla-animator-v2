# Definition of Done: Test Renderer Block

**Sprint:** Fix Hash Block failing tests
**Created:** 2026-01-17

## Acceptance Criteria

### AC1: TestSignal Block Registration
- [ ] `import '../blocks/test-blocks';` added to `src/compiler/compile.ts`
- [ ] TestSignal block can be used in `buildPatch()` without errors
- [ ] Block appears in registry with correct metadata

### AC2: Signal Evaluation Works
- [ ] Compiling a patch with TestSignal produces `evalSig` step in schedule
- [ ] After `executeFrame()`, TestSignal's input signal value is stored in `state.values.f64`
- [ ] Value can be retrieved from known slot index

### AC3: Hash Block Tests Pass
- [ ] `different seeds produce different results` test passes
- [ ] `output is always in [0, 1) range` test passes
- [ ] Tests use TestSignal pattern (not cache array hacking)
- [ ] Tests assert on actual slot values, not fragile cache searches

### AC4: Test Pattern Documented
- [ ] TestSignal block has JSDoc explaining its purpose
- [ ] Usage example in block comment shows correct wiring
- [ ] Test file shows pattern for future test authors

### AC5: No Regressions
- [ ] `npm run test` passes all tests (including existing stateful-primitives tests)
- [ ] `npm run typecheck` passes with no errors
- [ ] Demo app still runs (`npm run dev`)

## Verification Commands

```bash
# Run specific tests
npm run test -- src/blocks/__tests__/stateful-primitives.test.ts

# Run all tests
npm run test

# Type check
npm run typecheck
```

## Success Evidence

```
✓ Hash Block > different seeds produce different results
✓ Hash Block > output is always in [0, 1) range

Tests: 2 passing (Hash Block)
```

## Notes

The key insight is that signals are lazy - they only evaluate when consumed by schedule steps (evalSig, materialize, render). The TestSignal block provides a test-only sink that forces evaluation via `StepEvalSig`, making the value available in runtime state for assertions.
