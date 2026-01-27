# Implementation Context: Execution Model Documentation

**Generated**: 2026-01-27
**Timestamp**: 20260127-050130
**Topic**: Document why two-phase execution pattern in ScheduleExecutor is non-negotiable

## Key Source Files to Reference

### Primary Implementation
- `src/runtime/ScheduleExecutor.ts` - Two-phase execution implementation
  - Phase 1: Lines 184-410 (all non-stateWrite steps)
  - Phase 2: Lines 464-505 (stateWrite steps only)
  - Key comment: Lines 167-171

### Schedule Construction
- `src/compiler/passes-v2/pass7-schedule.ts` - Schedule generation
  - Phase ordering documented: Lines 4-15
  - ScheduleIR structure: Lines 43-67

### Step Type Definitions
- `src/compiler/ir/types.ts` - IR types
  - Step types: Lines 434-550
  - StepStateWrite: Scalar state write (Phase 2 only)
  - StepFieldStateWrite: Field state write (Phase 2 only)
  - All other steps: Phase 1

### State Management
- `src/runtime/RuntimeState.ts` - State container
- `src/runtime/SignalEvaluator.ts` - Signal evaluation (reads state in Phase 1)

### Spec References
- `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md` - Invariant I7
- `design-docs/CANONICAL-oscilla-v2.5-20260109/00-invariants.md` - All invariants

## Key Concepts to Document

### The Problem (State Causality)
```
Stateful blocks like UnitDelay must output the PREVIOUS frame's value.
Without phase separation, a delay block could read its own output
in the same frame, creating a combinatorial loop instead of a delay.
```

### The Solution (Two-Phase Model)
```
Phase 1: Evaluate all signals, read from PREVIOUS frame's state
Phase 2: Write new values to state for NEXT frame
```

### Invariant I7
```
Cycles must cross stateful boundary.
→ Phase 1 forms a DAG within a frame
→ Cycles are only possible via Phase 2 state writes
→ Guaranteed by: stateWrite always deferred to Phase 2
```

### Step Types by Phase

**Phase 1 Steps:**
- `evalSig` - Evaluate signal expression, cache result
- `slotWriteStrided` - Write multi-component values to slots
- `materialize` - Instantiate field buffers
- `render` - Collect render operations
- `continuityMapBuild` - Detect domain changes
- `continuityApply` - Smooth field transitions
- `evalEvent` - Fire events based on edge detection

**Phase 2 Steps:**
- `stateWrite` - Write scalar value to state array
- `fieldStateWrite` - Write field values (per-lane) to state array

## Example Patterns to Include

### Example 1: Correct Feedback Loop (UnitDelay)
```
Graph: signal → UnitDelay → output
       output ──────────┘ (feedback)

Frame N:
  Phase 1: Read state[delay] = previous value (e.g., 5.0)
           Evaluate signal = 10.0
           Output = 5.0 (from state read)
  Phase 2: Write state[delay] = 10.0 (for next frame)

Frame N+1:
  Phase 1: Read state[delay] = 10.0 (written in previous Phase 2)
           ...
```

### Example 2: Violation Scenario (What Would Break)
```
If stateWrite happened in Phase 1:

Frame N:
  Step 1: evalSig → input = 10.0
  Step 2: stateWrite → state[delay] = 10.0  // TOO EARLY!
  Step 3: Read state[delay] → gets 10.0 instead of 5.0
  Result: Delay becomes feedthrough (no delay)
```

### Example 3: Schedule Structure
```
ScheduleIR {
  steps: [
    { kind: 'evalSig', slotId: 'time', expr: ... },
    { kind: 'evalSig', slotId: 'input', expr: ... },
    { kind: 'evalSig', slotId: 'delay_output', expr: SigExprStateRead(0) },
    { kind: 'render', ... },
    { kind: 'stateWrite', stateSlot: 0, value: SigExprSlotRead('input') }
  ]
}

Execution:
  Phase 1: evalSig(time), evalSig(input), evalSig(delay_output), render
  Phase 2: stateWrite(0, input)
```

## Folder Structure to Create

```
docs/
├── README.md                    # Navigation, purpose, conventions
└── runtime/
    └── execution-model.md       # This sprint's main deliverable
```

## CLAUDE.md Addition (Brief)

Add to "Key Design Patterns" section:
```markdown
#### Two-Phase Execution
The runtime executes each frame in two phases: Phase 1 evaluates all signals
and reads from the previous frame's state, while Phase 2 writes new state
values for the next frame. This separation is non-negotiable—it ensures
stateful blocks (like UnitDelay) maintain proper delay semantics and prevents
causality loops. See `docs/runtime/execution-model.md` for full details.
```

## ScheduleExecutor.ts Comment Update

Expand lines 167-171 to include doc link:
```typescript
// ═══════════════════════════════════════════════════════════════════════════
// TWO-PHASE EXECUTION MODEL
// ═══════════════════════════════════════════════════════════════════════════
//
// Phase 1 (below): Evaluate all signals, materialize fields, fire events,
//                  collect render ops. Reads state from PREVIOUS frame.
// Phase 2 (line ~464): Write new state values for NEXT frame.
//
// This separation is NON-NEGOTIABLE. It ensures:
// - Stateful blocks (UnitDelay, Lag, etc.) maintain proper delay semantics
// - Cycles only cross frame boundaries via state (invariant I7)
// - All signals see consistent state within a frame
//
// See: docs/runtime/execution-model.md for full rationale and examples.
// ═══════════════════════════════════════════════════════════════════════════
```
