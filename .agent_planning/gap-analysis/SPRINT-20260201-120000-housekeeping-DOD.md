# SUPERSEDED — See SPRINT-20260201-140000-purity-authority-DOD.md
# Definition of Done: Housekeeping

Generated: 2026-02-01T12:00:00Z
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260201-120000-housekeeping-PLAN.md

## Acceptance Criteria

### Delete Backup Files
- [ ] `src/compiler/ir/types.ts.bak` deleted
- [ ] `src/compiler/ir/types.ts.backup2` deleted
- [ ] `src/compiler/ir/__tests__/bridges.test.ts.bak` deleted
- [ ] `src/runtime/__tests__/FieldKernels-placement.test.ts.bak` deleted
- [ ] `src/runtime/__tests__/PlacementBasis.test.ts.bak` deleted
- [ ] `src/runtime/__tests__/PlacementBasis.test.ts.bak2` deleted
- [ ] `src/ui/components/BlockInspector.tsx.patch` deleted
- [ ] No `.bak`, `.backup`, `.backup2`, or `.patch` files remain under `src/`

### isTypeCompatible Purity Enforcement Test
- [ ] `it.skip` test exists that greps `analyze-type-graph.ts` for `sourceBlockType|targetBlockType`
- [ ] Test asserts zero matches (pure 2-param signature)
- [ ] Manually confirmed: un-skipping the test causes failure against current code
- [ ] Comment in test references Sprint B / SUMMARY.md P1 #1

### Backend Read-Only Contract Enforcement Test
- [ ] `it.skip` test exists that greps `backend/lower-blocks.ts` for `withInstance` calls
- [ ] Test asserts zero matches (backend reads types, never rewrites)
- [ ] Manually confirmed: un-skipping the test causes failure against current code
- [ ] Comment in test references Sprint C / SUMMARY.md P1 #2

### instanceId Enforcement Threshold
- [ ] Reviewed `instance-unification.test.ts` for thresholds
- [ ] Tightened or baseline assertion added (if applicable)

### ExpressionCompileError Rename (Optional)
- [ ] `ExpressionCompileError` renamed to `ExprCompileError` in `src/expr/index.ts`
- [ ] Zero grep hits for `ExpressionCompileError` in `src/`

### Global
- [ ] `npm run build` passes (zero typecheck errors)
- [ ] `npm run test` passes (all tests green)
