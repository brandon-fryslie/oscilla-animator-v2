# Definition of Done: Step Format Unification

Generated: 2026-02-01T14:00:00Z
Updated: 2026-02-01T15:00:00Z
Plan: SPRINT-20260201-140000-step-format-PLAN.md

## Gate: Sprint Complete

- [ ] `StepEvalValue` interface exists with `kind: 'evalValue'`, `expr`, `target: EvalTarget`, `strategy: EvalStrategy`
- [ ] `EvalTarget` discriminated union exists with `storage: 'value' | 'event'` and typed slot
- [ ] `EvalStrategy` const enum exists with 4 values (ContinuousScalar, ContinuousField, DiscreteScalar, DiscreteField)
- [ ] `StepEvalSig` and `StepEvalEvent` interfaces deleted
- [ ] Step union has 8 variants (was 9)
- [ ] Zero `evalSig` or `evalEvent` string literals in `src/compiler/ir/types.ts`
- [ ] Zero `evalSig` or `evalEvent` case labels in `src/runtime/ScheduleExecutor.ts`
- [ ] `StepMaterialize` remains separate (has `instanceId`, different semantics)
- [ ] `deriveStrategy()` function exists in schedule-program.ts, derives from CanonicalType
- [ ] IRBuilderImpl has `stepEvalValue()` replacing `stepEvalSig()` + `stepEvalEvent()`
- [ ] No runtime type inspection in hot loop (strategy pre-resolved at compile time)
- [ ] Enforcement test 4 (from Sprint 1) un-skipped and green
- [ ] Frame execution benchmark shows no regression (±5%)
- [ ] TypeScript compiles with zero errors
- [ ] Full test suite passes

## Verification Commands

```bash
# No evalSig/evalEvent in IR types
grep -r 'evalSig\|evalEvent' src/compiler/ir/types.ts
# Expected: 0 hits

# No evalSig/evalEvent in executor
grep -r 'evalSig\|evalEvent' src/runtime/ScheduleExecutor.ts
# Expected: 0 hits

# StepMaterialize still exists (separate)
grep -r 'StepMaterialize' src/compiler/ir/types.ts
# Expected: 1+ hits

# New types exist
grep -r 'EvalStrategy\|EvalTarget\|StepEvalValue' src/compiler/ir/types.ts
# Expected: 3+ hits

# Enforcement test
npm run test -- --include "**/forbidden-patterns*"

# Benchmark
npm run bench

# Full suite
npm run typecheck && npm run test
```
