# Definition of Done: signal-eval

Generated: 2026-01-31-100000
Status: PARTIALLY READY
Plan: SPRINT-20260131-100000-signal-eval-PLAN.md
Source: EVALUATION-20260131-090000.md

## Acceptance Criteria

### WI-1: ValueExpr Signal Evaluator Function
- [ ] `evaluateValueExprSignal(id, valueExprs, state)` exists and handles all signal-extent kinds
- [ ] Caching works via `state.cache.valueExprValues[id]` and `state.cache.valueExprStamps[id]`
- [ ] NaN/Inf detection matches existing SignalEvaluator behavior
- [ ] Exhaustive switch with `never` check -- no silent fallbacks
- [ ] Unit tests cover all 10 signal-extent cases

### WI-2: ValueExpr Cache in RuntimeState
- [ ] `RuntimeState.cache` has `valueExprValues` and `valueExprStamps` arrays
- [ ] Arrays are sized from `program.valueExprs.nodes.length` during state creation
- [ ] Cache invalidation follows same frame-stamp pattern as existing signal cache
- [ ] No performance regression in existing code paths

### WI-3: Shadow Evaluation Mode
- [ ] Shadow mode runs both evaluators for every signal step
- [ ] Mismatches logged with expression ID, legacy value, ValueExpr value
- [ ] Shadow mode can be enabled/disabled without code changes (flag)
- [ ] At least one end-to-end test compiles a real patch and runs shadow mode for 10 frames with zero mismatches
- [ ] No performance regression when shadow mode is disabled

### WI-4: Signal-Only Cutover
- [ ] ScheduleExecutor can use ValueExpr-only path for signal steps
- [ ] All 2004+ tests pass in ValueExpr-only mode
- [ ] No rendering differences visible in manual testing
- [ ] Performance benchmark shows no significant regression (< 5%)

## Exit Criteria (MEDIUM -> HIGH)
- [ ] Cache sizing strategy decided
- [ ] Cross-evaluator call behavior confirmed correct
- [ ] StepSlotWriteStrided translation approach decided
- [ ] Shadow mode prototype running for at least one simple program

## Global Exit Criteria
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] `npx vitest run` passes all tests
- [ ] Shadow mode test: compile 3+ different patches, run 10+ frames each, zero mismatches
- [ ] ValueExpr-only mode: all tests pass without legacy signal evaluation
