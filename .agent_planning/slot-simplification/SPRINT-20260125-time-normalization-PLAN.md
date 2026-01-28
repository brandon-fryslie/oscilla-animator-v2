# Sprint: time-normalization - Remove Time Signal Special Cases

Generated: 2026-01-25
Confidence: HIGH: 1, MEDIUM: 1, LOW: 1
Status: RESEARCH REQUIRED
Source: EVALUATION-20260125.md

## Sprint Goal

Remove hardcoded time signal handling by making time signals flow through the normal slot system. Time blocks should allocate slots like any other block, and the schedule executor should not have special-case code for time.

## Scope

**Deliverables:**
- Remove hardcoded TIME_PALETTE_SLOT = 0
- Remove reserveSystemSlot in IRBuilder constructor
- Time blocks allocate slots normally
- ScheduleExecutor writes time values through normal writeSlot steps

**Out of scope:**
- Event special handling (separate concern)
- Time model changes (just slot allocation)

## Work Items

### P0 [HIGH] Remove Reserved Slot 0

**Dependencies**: unified-slots sprint
**Spec Reference**: N/A
**Status Reference**: EVALUATION-20260125.md "System reserved slots hardcoded"

#### Description

Currently IRBuilderImpl constructor reserves slot 0:
```typescript
constructor() {
  this.reserveSystemSlot(0, canonicalType('color')); // time.palette at slot 0
}
```

And ScheduleExecutor has matching constant:
```typescript
const TIME_PALETTE_SLOT = 0 as ValueSlot;
```

This creates a hidden contract between compiler and runtime. Instead, time.palette should use a slot allocated through normal allocSlot() and passed through the schedule.

#### Acceptance Criteria

- [ ] No `reserveSystemSlot` method or calls
- [ ] No `TIME_PALETTE_SLOT` constant in ScheduleExecutor
- [ ] Slot 0 is not special - any slot can be first allocated
- [ ] time.palette slot ID is passed through schedule, not hardcoded

#### Technical Notes

The time.palette slot needs to be communicated from compiler to runtime. Options:
1. Add to ScheduleIR: `paletteSlot: ValueSlot`
2. Add to TimeModel: `paletteSlot: ValueSlot`
3. Emit a writeSlot step for palette from InfiniteTimeRoot block

---

### P1 [MEDIUM] Update InfiniteTimeRoot Block

**Dependencies**: P0 Remove Reserved Slot, single-write-path sprint
**Spec Reference**: N/A
**Status Reference**: src/blocks/time-blocks.ts

#### Description

Currently InfiniteTimeRoot allocates slots but they're not used for time values. The actual time values come from `state.time.tMs`, `state.time.phaseA`, etc.

New approach:
1. InfiniteTimeRoot emits writeSlot steps for all time outputs
2. These steps read from time system and write to allocated slots
3. Downstream blocks read from slots like any other signal

This may require a new SigExpr kind or changes to how time expressions work.

#### Acceptance Criteria

- [ ] InfiniteTimeRoot emits writeSlot steps for tMs, dt, phaseA, phaseB, palette, energy
- [ ] Time slots are allocated normally (not reserved)
- [ ] Downstream blocks read from slots, not directly from state.time

#### Unknowns to Resolve

1. How do time values get from resolveTime() output into slots?
2. Should there be a StepWriteTimeValue or reuse writeSlot?
3. Performance impact of going through slots vs direct state.time access?

#### Exit Criteria (to reach HIGH confidence)

- [ ] Design for time value → slot flow
- [ ] Benchmark time signal path performance

---

### P2 [LOW] Remove SigExprTime Direct State Access

**Dependencies**: P1 Update InfiniteTimeRoot
**Spec Reference**: N/A
**Status Reference**: src/runtime/SignalEvaluator.ts

#### Description

SignalEvaluator has special case for time expressions:
```typescript
case 'time': {
  switch (timeExpr.which) {
    case 'tMs': return state.time.tMs;
    case 'palette': return 0; // Returns slot number, not value!
    // ...
  }
}
```

If time values go through slots, this case can be simplified or removed. Time signals become slot reads like any other signal.

However, this is a larger change that affects how time propagates through the signal graph.

#### Acceptance Criteria

- [ ] SigExprTime case simplified or removed
- [ ] Time signals read from slots via SigExprSlot
- [ ] Performance equivalent or better

#### Unknowns to Resolve

1. Is direct state.time access a performance optimization we want to keep?
2. How do we handle the phase wrap detection that uses state.timeState?

#### Exit Criteria (to reach HIGH confidence)

- [ ] Benchmark slot access vs direct access
- [ ] Understand timeState dependency

## Dependencies

```
unified-slots sprint (prerequisite)
single-write-path sprint (prerequisite)
    |
    v
P0: Remove Reserved Slot 0
    |
    v
P1: Update InfiniteTimeRoot
    |
    v
P2: Remove SigExprTime Direct Access
```

## Risks

1. **Risk**: Performance regression from indirection
   **Mitigation**: Benchmark before committing

2. **Risk**: Time wrap detection depends on special state
   **Mitigation**: Understand timeState before changing

3. **Risk**: Breaking change to time signal graph traversal
   **Mitigation**: Comprehensive test coverage

## Blocked Questions

1. Is the direct state.time access load-bearing for performance?
2. How does the palette signal work - it returns 0 (slot number), which is weird?
3. Should time values be written once per frame (at schedule start) or evaluated lazily?
