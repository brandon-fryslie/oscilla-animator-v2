# Definition of Done: single-write-path

Generated: 2026-01-25
Status: RESEARCH REQUIRED
Plan: SPRINT-20260125-single-write-path-PLAN.md

## Acceptance Criteria

### P0: Design Unified Write Step

- [ ] StepWriteSlot type defined in src/compiler/ir/types.ts
- [ ] Design document in this directory captures semantics
- [ ] Compile-time stride verification approach decided
- [ ] No runtime stride validation needed (invariant established at compile)

### P1: Update IRBuilder

- [ ] `emitSlotWrite(slot, inputs)` method added
- [ ] `registerSigSlot` method deleted from interface and impl
- [ ] `stepSlotWriteStrided` deleted or renamed
- [ ] `getSigSlots` deleted or returns empty
- [ ] All slot writes tracked in builder in emission order
- [ ] All existing tests pass

### P2: Update ScheduleExecutor

- [ ] Single 'writeSlot' case in switch statement
- [ ] 'evalSig' case deleted
- [ ] 'slotWriteStrided' case deleted
- [ ] No runtime stride validation (trusts compiler)
- [ ] Shape2d slots handled (if applicable)
- [ ] All existing tests pass

### P2: Update pass7-schedule.ts

- [ ] No `stridedWriteSlots` Set construction
- [ ] No filtering of sigSlots
- [ ] No separate evalSigStepsPre/evalSigStepsPost/slotWriteStridedSteps arrays
- [ ] Slot write section is <= 20 lines
- [ ] Event dependency ordering preserved
- [ ] All existing tests pass

## Exit Criteria (for MEDIUM confidence items)

### P0: Design Unified Write Step

- [ ] Design reviewed and approved
- [ ] Compile-time vs runtime stride verification decided
- [ ] Edge cases documented (empty inputs, shape slots)

### P1: Update IRBuilder

- [ ] All usages of getSigSlots audited
- [ ] Debug tap alternative designed
- [ ] No consumers of sigSlots mapping remain

### P2: Update ScheduleExecutor

- [ ] Scalar vs loop performance benchmarked
- [ ] Shape slot handling designed
- [ ] Debug tap integration verified

## Verification Commands

```bash
# Verify no evalSig step type
rg "case 'evalSig'" --type ts -c
# Expected: 0 (after completion)

# Verify no slotWriteStrided step type
rg "case 'slotWriteStrided'" --type ts -c
# Expected: 0 (after completion)

# Verify no registerSigSlot
rg "registerSigSlot" --type ts -c
# Expected: 0 (after completion)

# Verify no stridedWriteSlots
rg "stridedWriteSlots" --type ts -c
# Expected: 0 (after completion)

# Run tests
npm run test

# Run benchmarks (if available)
npm run bench
```
