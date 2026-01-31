# Definition of Done: valueexpr-cleanup

Generated: 2026-01-30T21:00:00
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260130-210000-valueexpr-cleanup-PLAN.md

## Acceptance Criteria

### ValueExprId Duplication Fix
- [ ] `ValueExprId` type defined in exactly one file (`Indices.ts`)
- [ ] `valueExprId()` factory defined in exactly one file (`Indices.ts`)
- [ ] `value-expr.ts` imports and re-exports both from `./Indices`
- [ ] `grep -r "type ValueExprId" src/` returns exactly 1 match
- [ ] All 2004 tests pass, 0 TS errors

### Dead Code Cleanup
- [ ] `requireSignalType`, `requireFieldType`, `requireEventType` deleted
- [ ] `isSignalType`, `isFieldType`, `isEventType` deleted
- [ ] `tryDeriveKind` deleted
- [ ] `deriveKind` either deleted or unexported (depends on test usage)
- [ ] No file in `src/` imports any deleted function (grep verified)
- [ ] All tests pass, 0 TS errors

### Delete bridges.ts.bak
- [ ] File `src/compiler/ir/bridges.ts.bak` does not exist
- [ ] No references to it anywhere

### Strengthen Invariant Test Exhaustiveness
- [ ] Adding a kind to ValueExpr without updating EXPECTED_KINDS causes compile-time error
- [ ] Removing a kind from EXPECTED_KINDS without updating ValueExpr causes compile-time error
- [ ] No `as` casts on kind field in exhaustiveness check
- [ ] All 8 invariant tests pass
