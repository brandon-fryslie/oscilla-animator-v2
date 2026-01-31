# Definition of Done: validation-cutover

Generated: 2026-01-31-120000
Status: PARTIALLY READY
Plan: SPRINT-20260131-120000-validation-cutover-PLAN.md
Source: EVALUATION-20260131-110000.md

## Acceptance Criteria

### WI-1: Make Shadow/Cutover Flags Injectable
- [ ] EvalMode config object replaces 6 hardcoded const flags
- [ ] Tests can enable any flag without source edits
- [ ] Default behavior is legacy-only
- [ ] TypeScript compiles, all tests pass

### WI-2: Add Event Cutover Flag
- [ ] `valueExprEvent` flag exists in EvalMode
- [ ] When enabled, StepEvalEvent routes through ValueExpr evaluator
- [ ] TypeScript compiles, all tests pass

### WI-3: Shadow Mode Validation
- [ ] 3+ compiled patches × 10+ frames × all 3 shadow modes = zero mismatches
- [ ] Any mismatches are fixed in evaluators (not suppressed)

### WI-4: Cutover Mode Validation
- [ ] All 2057+ tests pass with all 3 cutover flags enabled simultaneously
- [ ] No rendering differences

### WI-5: Cleanup
- [ ] No `.orig` files
- [ ] No `as any` casts for type construction in materializer
- [ ] Reduce bridge uses ValueExpr materializer directly

## Global Exit Criteria
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] `npx vitest run` passes all tests
- [ ] Shadow mode validated: zero mismatches across all evaluators
- [ ] Cutover mode validated: all tests pass in ValueExpr-only mode
