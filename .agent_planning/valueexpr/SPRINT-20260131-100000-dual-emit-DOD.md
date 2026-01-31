# Definition of Done: dual-emit

Generated: 2026-01-31-100000
Status: PARTIALLY READY
Plan: SPRINT-20260131-100000-dual-emit-PLAN.md
Source: EVALUATION-20260131-090000.md

## Acceptance Criteria

### WI-1: Add ValueExprTable to CompiledProgramIR
- [ ] `CompiledProgramIR` has `valueExprs: ValueExprTable`
- [ ] `ValueExprTable` has `nodes`, `sigToValue`, `fieldToValue`, `eventToValue`
- [ ] Mapping arrays are parallel to legacy tables (same length, indexed by legacy ID)
- [ ] TypeScript compiles with zero errors

### WI-2: IRBuilder Dual-Emit for Signal Expressions
- [ ] Every `sig*` method in IRBuilderImpl also emits a ValueExpr
- [ ] `sigToValue` mapping is populated for every SigExprId
- [ ] All existing tests pass (no behavioral change to legacy path)
- [ ] New test: `program.valueExprs.sigToValue.length === program.signalExprs.nodes.length`

### WI-3: IRBuilder Dual-Emit for Field Expressions
- [ ] Every `field*` method in IRBuilderImpl also emits a ValueExpr
- [ ] `fieldToValue` mapping is populated for every FieldExprId
- [ ] Cross-table references (SigExprId -> ValueExprId) correctly resolved via sigToValue
- [ ] All existing tests pass
- [ ] New test: `program.valueExprs.fieldToValue.length === program.fieldExprs.nodes.length`

### WI-4: IRBuilder Dual-Emit for Event Expressions
- [ ] Every `event*` method in IRBuilderImpl also emits a ValueExpr
- [ ] `eventToValue` mapping is populated for every EventExprId
- [ ] Cross-table references correctly resolved
- [ ] All existing tests pass
- [ ] New test: `program.valueExprs.eventToValue.length === program.eventExprs.nodes.length`

## Exit Criteria (MEDIUM -> HIGH)
- [ ] Hash-consing approach decided and documented
- [ ] Reduce `op` and pathDerivative `operation` gap resolved
- [ ] One signal method dual-emitting and tested end-to-end
- [ ] For a real compiled program, every legacy ID maps to a valid ValueExprId

## Global Exit Criteria
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] `npx vitest run` passes all tests
- [ ] New integration test: compile a real patch, verify `valueExprs.nodes.length > 0`
- [ ] New integration test: verify all mapping arrays have correct lengths
- [ ] New integration test: verify every ValueExpr in the table has valid `type: CanonicalType`
