# Definition of Done: Step Format Unification

Generated: 2026-02-01T14:00:00Z
Plan: SPRINT-20260201-140000-step-format-PLAN.md

## Gate: Sprint Complete

- [ ] Zero `evalSig` or `evalEvent` string literals in `src/compiler/ir/types.ts`
- [ ] Zero `evalSig` or `evalEvent` case labels in `src/runtime/ScheduleExecutor.ts`
- [ ] Schedule construction derives strategy from CanonicalType
- [ ] No runtime type inspection in hot loop
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

# Enforcement test
npm run test -- --include "**/forbidden-patterns*"

# Benchmark
npm run bench
```
