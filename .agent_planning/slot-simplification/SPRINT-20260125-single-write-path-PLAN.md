# Sprint: single-write-path - Eliminate Dual Execution Paths

Generated: 2026-01-25
Confidence: HIGH: 1, MEDIUM: 3, LOW: 0
Status: RESEARCH REQUIRED
Source: EVALUATION-20260125.md

## Sprint Goal

Eliminate the evalSig vs slotWriteStrided dual code path by creating ONE unified slot write mechanism that handles both scalar and multi-component values.

## Scope

**Deliverables:**
- Single step type for writing signal values to slots
- Eliminate special-case filtering in pass7-schedule.ts
- Simplify ScheduleExecutor to one write path
- Remove registerSigSlot complexity

**Out of scope:**
- Event slots (different semantics)
- Field/object slots (materialize is fundamentally different)
- Time signal special handling (separate sprint)

## Work Items

### P0 [MEDIUM] Design Unified Write Step

**Dependencies**: unified-slots sprint (allocSlot returns stride)
**Spec Reference**: N/A
**Status Reference**: EVALUATION-20260125.md "evalSig vs slotWriteStrided"

#### Description

Currently we have two step types:
```typescript
StepEvalSig { expr: SigExprId, target: ValueSlot }        // stride=1 only
StepSlotWriteStrided { slotBase: ValueSlot, inputs: SigExprId[] }  // stride>1
```

Design a unified step that handles both:
```typescript
StepWriteSlot {
  target: ValueSlot;
  inputs: SigExprId[];  // length = stride (1 for scalars)
}
```

The executor just evaluates each input and writes to `offset + i`.

#### Acceptance Criteria

- [ ] Single StepWriteSlot type defined in types.ts
- [ ] StepEvalSig and StepSlotWriteStrided are deprecated
- [ ] Design document captures the new semantics

#### Unknowns to Resolve

1. Should StepWriteSlot include the stride, or look it up from slotMeta?
2. Can we verify inputs.length matches stride at compile time?

#### Exit Criteria (to reach HIGH confidence)

- [ ] Design document reviewed
- [ ] Compile-time vs runtime stride verification decided

---

### P1 [MEDIUM] Update IRBuilder to Emit Unified Steps

**Dependencies**: P0 Design
**Spec Reference**: N/A
**Status Reference**: EVALUATION-20260125.md

#### Description

Currently:
- Scalar signals call `registerSigSlot(id, slot)` and pass7 generates evalSig
- Multi-component signals call `stepSlotWriteStrided(slot, components)`

New approach:
- All signals call `emitSlotWrite(slot, components)` where components = [id] for scalars
- IRBuilder tracks all slot writes, pass7 just returns them in order

This eliminates:
- registerSigSlot method
- The filtering in pass7 that skips strided slots
- The separate slot tracking maps (sigSlots, fieldSlots)

#### Acceptance Criteria

- [ ] New method: `emitSlotWrite(slot: ValueSlot, inputs: SigExprId[]): void`
- [ ] `registerSigSlot` deleted
- [ ] `stepSlotWriteStrided` deleted (or renamed to emitSlotWrite)
- [ ] `getSigSlots` returns empty or is deleted
- [ ] Builder tracks slot writes in order emitted

#### Unknowns to Resolve

1. How does debug tap work without sigSlots map?
2. Does anything depend on the mapping from sigId to slot?

#### Exit Criteria (to reach HIGH confidence)

- [ ] Audit all usages of getSigSlots
- [ ] Verify debug tap can work with new model

---

### P2 [MEDIUM] Update ScheduleExecutor

**Dependencies**: P1 IRBuilder changes
**Spec Reference**: N/A
**Status Reference**: EVALUATION-20260125.md

#### Description

Simplify the executor switch statement from:

```typescript
case 'evalSig': {
  if (stride !== 1) throw Error(...);
  const value = evaluateSignal(...);
  writeF64Scalar(state, lookup, value);
}
case 'slotWriteStrided': {
  if (inputs.length !== stride) throw Error(...);
  for (let i = 0; i < inputs.length; i++) {
    state.values.f64[offset + i] = evaluateSignal(inputs[i], ...);
  }
}
```

To:

```typescript
case 'writeSlot': {
  for (let i = 0; i < step.inputs.length; i++) {
    state.values.f64[offset + i] = evaluateSignal(step.inputs[i], ...);
  }
}
```

The stride check becomes a compile-time invariant (inputs.length matches slot allocation).

#### Acceptance Criteria

- [ ] Single 'writeSlot' case handles all signal slot writes
- [ ] No stride validation at runtime (compile-time invariant)
- [ ] evalSig case deleted
- [ ] slotWriteStrided case deleted

#### Unknowns to Resolve

1. Performance impact of always using loop (vs specialized scalar path)?
2. Shape slots need different handling - how to dispatch?

#### Exit Criteria (to reach HIGH confidence)

- [ ] Benchmark scalar vs loop performance
- [ ] Shape slot handling designed

---

### P2 [HIGH] Update pass7-schedule.ts

**Dependencies**: P1 IRBuilder changes
**Spec Reference**: N/A
**Status Reference**: EVALUATION-20260125.md

#### Description

Remove the complexity in pass7 that:
1. Collects stridedWriteSlots set
2. Filters sigSlots to exclude strided slots
3. Generates evalSig steps for scalar slots
4. Orders evalSigStepsPre and slotWriteStridedSteps

New approach:
- Builder emits all slot writes in dependency order
- pass7 just retrieves them: `builder.getSlotWriteSteps()`

#### Acceptance Criteria

- [ ] No stridedWriteSlots Set
- [ ] No filtering of sigSlots
- [ ] No separate evalSigStepsPre/evalSigStepsPost arrays
- [ ] Slot write steps come from builder in correct order
- [ ] pass7 slot write section is <20 lines

#### Technical Notes

The "pre" vs "post" event ordering is still needed. Consider:
- Builder tracks which slot writes depend on events
- pass7 orders based on that dependency info

## Dependencies

```
unified-slots sprint (prerequisite)
    |
    v
P0: Design Unified Write Step
    |
    v
P1: Update IRBuilder
    |
    +-----> P2: Update ScheduleExecutor
    |
    +-----> P2: Update pass7-schedule.ts
```

## Risks

1. **Risk**: Debug tap relies on sigSlots mapping
   **Mitigation**: Audit debug tap before starting, design alternative

2. **Risk**: Performance regression from loop vs scalar write
   **Mitigation**: Benchmark before committing to design

3. **Risk**: Event dependency ordering breaks
   **Mitigation**: Keep event ordering logic, just simplify slot write emission

## Blocked Questions

1. How does the debug probe get notified of slot values without sigSlots?
2. Does shape2d storage need special handling in writeSlot?
