# Definition of Done: valueexpr-consumer

Generated: 2026-01-30T21:10:00
Status: RESEARCH REQUIRED
Plan: SPRINT-20260130-211000-valueexpr-consumer-PLAN.md

## Acceptance Criteria

### P0: Migration Strategy Research
- [ ] Decision document written: which evaluator migrates first and why
- [ ] Decision written: single values[] array vs. three typed arrays
- [ ] Decision written: IRBuilder dual-emit vs. replacement strategy
- [ ] Prototype: IRBuilder emits at least one ValueExpr kind (test proves plumbing)
- [ ] All 4 unknowns documented with answers

### P1: SignalEvaluator Migration
- [ ] evaluateSigExpr accepts ValueExpr instead of SigExpr
- [ ] SigExprSlot handling documented (kept or moved)
- [ ] All signal-related tests pass
- [ ] No behavioral changes (same outputs for same inputs)
- [ ] No measurable performance regression in npm run bench

### P2: IRBuilder Emission Audit
- [ ] Complete catalog of expression-emitting builder methods
- [ ] Dual-emit vs. replacement decision documented
- [ ] At least one builder method prototyped with ValueExpr emission

## Exit Criteria (to raise overall confidence to HIGH)
- [ ] P0 research complete with all unknowns resolved
- [ ] At least one ValueExpr kind round-trips through IRBuilder -> evaluator in a test
- [ ] Migration approach validated as safe for incremental adoption
- [ ] SigExprSlot handling strategy decided
- [ ] Type-level guard strategy for evaluator dispatch decided
