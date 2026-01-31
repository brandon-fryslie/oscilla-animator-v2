# Definition of Done: type-fixes

Generated: 2026-01-31-100000
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260131-100000-type-fixes-PLAN.md
Source: EVALUATION-20260131-090000.md

## Acceptance Criteria

### WI-1: Flatten ValueExpr References to ValueExprId
- [ ] No `ValueExpr` type appears as a field value in any ValueExpr variant (only `ValueExprId`)
- [ ] TypeScript compiles with zero errors
- [ ] All existing tests pass (2004+)

### WI-2: Add mode to Event Combine
- [ ] `ValueExprEvent` combine variant has `readonly mode: 'any' | 'all'`
- [ ] Constructing a combine without `mode` is a TypeScript compile error
- [ ] Invariant test updated to verify mode presence

### WI-3: Expand ValueExprTime.which to 7 Cases
- [ ] `ValueExprTime.which` accepts all 7 time signal names
- [ ] TypeScript compiles with zero errors
- [ ] Invariant test updated to verify all 7 values are accepted

### WI-4: Add controlPointField to ValueExprShapeRef
- [ ] `ValueExprShapeRef` has optional `controlPointField: ValueExprId`
- [ ] Comment documents field-extent validation requirement
- [ ] TypeScript compiles with zero errors

### WI-5: Create ValueExprSlotRead as 10th Kind
- [ ] `ValueExprSlotRead` exists with kind `'slotRead'`
- [ ] Added to the `ValueExpr` union type
- [ ] EXPECTED_KINDS updated to 10 in invariant test
- [ ] Compile-time exhaustiveness check passes
- [ ] All existing tests pass

### WI-6: Fix Event Naming (fired, pulse source)
- [ ] `ValueExprEvent` const variant has `readonly fired: boolean` (not `value`)
- [ ] `ValueExprEvent` pulse variant has `readonly source: 'timeRoot'` (not `pulseTimeMs`)
- [ ] Invariant test mock objects updated to match new field names
- [ ] TypeScript compiles with zero errors

### WI-7: Make Kernel Variants a Discriminated Sub-Union
- [ ] `ValueExprKernel` is a discriminated union on `kernelKind`
- [ ] `fn` is required on `map`, `zip`, `zipSig` variants only
- [ ] `fn` does not exist on `broadcast`, `reduce`, `pathDerivative` variants
- [ ] Each kernel variant has semantically named input fields (not generic `args`)
- [ ] Invariant test updated for new kernel sub-union structure
- [ ] TypeScript compiles with zero errors

## Global Exit Criteria
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] `npx vitest run` passes all tests (2004+)
- [ ] `value-expr-invariants.test.ts` updated and passing with 10 kinds
- [ ] No ValueExpr variant contains embedded `ValueExpr` objects (all references are `ValueExprId`)
- [ ] Every legacy variant field has a documented mapping in ValueExpr (add completeness test)
