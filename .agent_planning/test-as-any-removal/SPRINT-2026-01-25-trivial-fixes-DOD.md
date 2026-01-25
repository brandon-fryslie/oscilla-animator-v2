# Definition of Done: Sprint 1 - Trivial Fixes

**Sprint:** Trivial Fixes - SigExprId & Block Mocks
**Generated:** 2026-01-25
**Type:** DOD (Definition of Done)

## Verification Criteria

All of the following must be true for this sprint to be COMPLETE:

### Acceptance Criteria

**Item 1: SigExprId branded type replacement**
- [ ] `event-blocks.test.ts`: All `0 as any` SigExprId casts replaced with `sigExprId(0)` calls
- [ ] `EventEvaluator.test.ts`: All SigExprId `as any` casts replaced with proper factory calls
- [ ] Tests execute: `npm run test -- event-blocks.test.ts` → PASS
- [ ] Tests execute: `npm run test -- EventEvaluator.test.ts` → PASS
- [ ] Zero remaining `as any` in both files (verify with grep)

**Item 2: Block definition mock SignalTypes**
- [ ] All mock block definitions in affected files use `signalType('float')` or equivalent factory
- [ ] No `{ payload: ... } as any` patterns remain in SignalType usage
- [ ] Tests execute: `npm run test -- exportFormats.test.ts` → PASS
- [ ] Export serialization works correctly (exportFormats test covers this)
- [ ] Zero remaining `as any` in block mock definitions (verify with grep)

### Code Quality Checks
- [ ] `npm run typecheck` → PASS (no new type errors)
- [ ] All affected test files show zero new compiler warnings
- [ ] Changes are localized to test files only (no production code affected)

### Process Completion
- [ ] All changed files are committed
- [ ] Commit message clearly states which files were updated and which casts were removed
- [ ] No uncommitted changes remain

## How to Verify

```bash
# Check for remaining 'as any' casts in affected files
grep -n "as any" src/blocks/event-blocks.test.ts
grep -n "as any" src/evaluators/EventEvaluator.test.ts
grep -n "as any" src/blocks/exportFormats.test.ts

# Run the specific tests
npm run test -- event-blocks.test.ts
npm run test -- EventEvaluator.test.ts
npm run test -- exportFormats.test.ts

# Full type check
npm run typecheck
```

If all of these commands succeed and return zero matches for remaining 'as any', this sprint is COMPLETE.

## Notes

- This is the simplest sprint - all fixes are mechanical replacements
- No architectural changes, no new functions needed
- All factory functions already exist and are stable
- Tests are expected to pass as-is (just removing casts, not changing behavior)
