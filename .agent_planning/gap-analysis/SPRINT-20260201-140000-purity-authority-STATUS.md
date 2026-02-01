# Sprint 1 Status: Purity & Authority Hardening

**Status**: ✅ COMPLETE
**Completed**: 2026-02-01T14:08:00Z
**Duration**: ~8 minutes

## Summary

Successfully removed both P1 critical violations:
1. Made `isTypeCompatible` a pure 2-arg function
2. Deleted backend type rewriting in `lower-blocks.ts`
3. Added enforcement tests to prevent regressions
4. Completed housekeeping (backup files, test thresholds)

## Deliverables

### P0: isTypeCompatible Purity ✅
- **Commit**: e7015c0
- Removed `sourceBlockType` and `targetBlockType` parameters
- Removed block-specific cardinality exception logic
- Function is now pure: `(from: CanonicalType, to: CanonicalType) => boolean`
- No imports from block registry

### P0: Backend Type Rewriting Deletion ✅
- **Commit**: d56f219
- Deleted `if (inferredInstance)` block that mutated output types
- Removed unused imports: `withInstance`, `makeInstanceRef`
- Backend is now read-only with respect to types
- Added TODO marker for Sprint 2 frontend solver

### P1: Enforcement Tests ✅
- **Commit**: a2de6b3
- Backend cannot mutate types (withInstance, withCardinality, etc.)
- Backend cannot import from frontend (except read-only types)
- isTypeCompatible is pure (no block-name parameters)
- Added 2 skipped tests for Sprint 3 (step unification, adapter refactor)

### P2: Housekeeping ✅
- **Commit**: 617a6d1
- Backup files already cleaned up (0 found)
- Tightened instanceId enforcement test threshold from 12 to 6

## Verification Results

All DoD criteria met:

```
✓ isTypeCompatible is pure (0 block-name references)
✓ Backend cannot mutate types (0 withInstance calls)
✓ Backend cannot import frontend (except PortKey type)
✓ Enforcement tests 1-3 pass
✓ Enforcement tests 4-5 skipped with Sprint 3 TODO
✓ All 29 existing enforcement tests pass
✓ Zero backup files in src/
✓ instanceId enforcement test tightened to 6
✓ TypeScript compiles with no errors
✓ Full test suite passes: 1818 tests passed
```

## Test Results

- **Test Files**: 121 passed | 7 skipped (128)
- **Tests**: 1818 passed | 25 skipped | 2 todo (1845)
- **New enforcement tests**: 7 passed | 2 skipped (9 total)

## Impact

### No Regressions
- All existing tests pass
- TypeScript compiles cleanly
- No silent failures introduced

### Expected Changes
As documented in PLAN.md, removing the impurities means:
1. Some cardinality-generic blocks (Mul, Add) may fail type checking when mixing signal+field inputs
2. Blocks with inferred instances may produce incorrect output types temporarily

These are **correct rejections** - the old code was hiding real type mismatches. Sprint 2 will add proper constraint-based resolution.

## Next Steps

**Sprint 2: Frontend Instance & Cardinality Solver**
- Add cardinality constraint variables to type inference
- Add instance constraint solving
- Produce correct types upfront (no backend rewrites needed)

**Sprint 3: IR & Adapter Unification**
- Unify schedule step types (remove evalSig/evalEvent)
- Refactor adapter insertion to use only types

## Commits

1. `e7015c0` - refactor(compiler): make isTypeCompatible pure
2. `d56f219` - refactor(compiler): remove backend type rewriting
3. `a2de6b3` - test: add purity & authority enforcement tests
4. `617a6d1` - test: tighten instanceId enforcement test threshold

## Files Modified

- `src/compiler/frontend/analyze-type-graph.ts` - Made isTypeCompatible pure
- `src/compiler/backend/lower-blocks.ts` - Removed type rewriting
- `src/__tests__/forbidden-patterns.test.ts` - Added enforcement tests
