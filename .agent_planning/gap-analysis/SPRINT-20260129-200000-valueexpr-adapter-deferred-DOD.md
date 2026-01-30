# Definition of Done: Sprint valueexpr-adapter-deferred

## Gate Criteria

### Per-Item Gates
- [ ] #23: ValueExpr union defined with 6 variants; legacy types aliased; at least 1 consumer migrated
- [ ] #24: All expression discriminant values are consistent camelCase `kind` fields
- [ ] #25: No `instanceId` field on FieldExprIntrinsic/Placement/StateRead; callers use requireManyInstance
- [ ] #26: AdapterSpec has branded `id`, `name`, `blockId`; all 10 rules updated
- [ ] #27: ExtentPattern is per-axis; `extentMatches()` checks each axis; broadcast TODO resolved
- [ ] #28: Zero-cardinality lifts either have explicit IR ops or documented design decision
- [ ] #29: IR const expressions verified against spec ValueExprConst shape

### Sprint-Level Gates
- [ ] TypeScript compiles: `npx tsc --noEmit` exits 0
- [ ] All gap-analysis-scoped tests pass
- [ ] `grep -r 'instanceId' src/compiler/ir/types.ts` returns 0 for field expression types
- [ ] No regressions in passing tests
