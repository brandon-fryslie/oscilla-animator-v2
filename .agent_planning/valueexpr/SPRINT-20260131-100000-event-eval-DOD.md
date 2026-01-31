# Definition of Done: event-eval

Generated: 2026-01-31-100000
Status: RESEARCH REQUIRED
Plan: SPRINT-20260131-100000-event-eval-PLAN.md
Source: EVALUATION-20260131-090000.md

## Acceptance Criteria

### WI-1: ValueExpr Event Evaluator Function
- [ ] `evaluateValueExprEvent(veId, valueExprs, state)` exists and returns boolean
- [ ] Handles all 5 event kinds (const, never, pulse, combine, wrap)
- [ ] Combine mode 'any'/'all' correctly implements OR/AND semantics
- [ ] Wrap edge detection uses same predicate as legacy (>= 0.5, rising edge)
- [ ] Uses `evaluateValueExprSignal` for wrap's signal input
- [ ] Unit tests cover all 5 event kinds

### WI-2: Event Shadow Evaluation Mode
- [ ] Shadow mode covers StepEvalEvent in ScheduleExecutor
- [ ] Boolean comparison (exact equality)
- [ ] Mismatches logged with expression ID and both values
- [ ] End-to-end test: compile patch with events, run shadow mode, zero mismatches

### WI-3: Event Edge Detection State Migration
- [ ] Edge detection state for ValueExpr events uses ValueExprId indexing
- [ ] Rising edge detection produces identical results to legacy for all test cases
- [ ] State persists across frames correctly

## Exit Criteria (LOW/MEDIUM -> HIGH)
- [ ] Edge detection state strategy decided
- [ ] Combine recursion depth confirmed safe
- [ ] Event caching decision made
- [ ] Sprint 3 shadow mode validated

## Global Exit Criteria
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] `npx vitest run` passes all tests
- [ ] Shadow mode: all event-using patches produce zero mismatches over 10+ frames
