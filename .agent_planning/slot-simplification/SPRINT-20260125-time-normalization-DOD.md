# Definition of Done: time-normalization

Generated: 2026-01-25
Status: RESEARCH REQUIRED
Plan: SPRINT-20260125-time-normalization-PLAN.md

## Acceptance Criteria

### P0: Remove Reserved Slot 0

- [ ] `reserveSystemSlot` method deleted from IRBuilderImpl
- [ ] No call to reserveSystemSlot in constructor
- [ ] `TIME_PALETTE_SLOT` constant deleted from ScheduleExecutor
- [ ] Slot 0 is not special - allocated to first caller
- [ ] time.palette slot communicated through schedule/timeModel
- [ ] All existing tests pass

### P1: Update InfiniteTimeRoot Block

- [ ] InfiniteTimeRoot emits writeSlot for tMs
- [ ] InfiniteTimeRoot emits writeSlot for dt
- [ ] InfiniteTimeRoot emits writeSlot for phaseA
- [ ] InfiniteTimeRoot emits writeSlot for phaseB
- [ ] InfiniteTimeRoot emits writeSlot for palette (4 components)
- [ ] InfiniteTimeRoot emits writeSlot for energy
- [ ] Time values flow through normal slot mechanism
- [ ] All existing tests pass

### P2: Remove SigExprTime Direct Access

- [ ] SigExprTime case in SignalEvaluator simplified or removed
- [ ] Time signals use SigExprSlot for reads
- [ ] No direct `state.time.*` access in signal evaluation
- [ ] Performance verified (no regression)
- [ ] All existing tests pass

## Exit Criteria (for MEDIUM/LOW confidence items)

### P1: Update InfiniteTimeRoot

- [ ] Design document for time value → slot flow
- [ ] Performance benchmark comparing slot vs direct access
- [ ] Test coverage for time signal paths

### P2: Remove SigExprTime Direct Access

- [ ] Benchmark slot access vs direct access
- [ ] timeState dependency understood
- [ ] Phase wrap detection verified working

## Verification Commands

```bash
# Verify no reserved slot
rg "reserveSystemSlot" --type ts -c
# Expected: 0

# Verify no TIME_PALETTE_SLOT constant
rg "TIME_PALETTE_SLOT" --type ts -c
# Expected: 0

# Verify no direct state.time access in evaluator
rg "state\.time\." src/runtime/SignalEvaluator.ts
# Expected: 0 (after P2 complete)

# Run tests
npm run test

# Run time-specific tests
npm run test -- --grep "time"
```
