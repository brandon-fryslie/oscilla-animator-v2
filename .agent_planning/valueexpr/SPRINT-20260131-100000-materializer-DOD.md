# Definition of Done: materializer

Generated: 2026-01-31-100000
Status: RESEARCH REQUIRED
Plan: SPRINT-20260131-100000-materializer-PLAN.md
Source: EVALUATION-20260131-090000.md

## Acceptance Criteria

### WI-1: ValueExpr Field Materializer Function
- [ ] `materializeValueExpr(veId, valueExprs, instanceId, count, state)` returns Float32Array
- [ ] Buffer caching by ValueExprId (frame-stamped)
- [ ] Per-lane evaluation for all field kernel types
- [ ] Cross-evaluator calls to signal evaluator work correctly
- [ ] Instance identity derived from `requireManyInstance(expr.type)`
- [ ] Unit tests cover all field-extent cases

### WI-2: Shadow Materialization Mode
- [ ] Shadow mode runs both materializers for every StepMaterialize
- [ ] Element-wise float comparison with epsilon tolerance
- [ ] Mismatches logged with field ID, lane index, component, legacy value, ValueExpr value
- [ ] End-to-end test: real patch, 10 frames, zero mismatches
- [ ] No performance regression when shadow mode is disabled

### WI-3: Field Buffer Cache Migration
- [ ] ValueExpr field buffer cache exists in RuntimeState
- [ ] Buffers are reused across frames when expression and count match
- [ ] Buffer invalidation works when count changes
- [ ] No memory leaks from orphaned buffers

## Exit Criteria (LOW -> MEDIUM/HIGH)
- [ ] Buffer pool sharing strategy decided
- [ ] Instance identity resolution approach confirmed
- [ ] Reduce cross-evaluator call graph verified cycle-free
- [ ] Intrinsic field production reuse path identified
- [ ] Sprint 3 and Sprint 4 shadow modes validated

## Global Exit Criteria
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] `npx vitest run` passes all tests
- [ ] Shadow materialization: all test patches produce zero mismatches over 10+ frames
- [ ] After cutover: all tests pass with ValueExpr-only materialization
- [ ] Performance benchmark: materialization within 10% of legacy speed
