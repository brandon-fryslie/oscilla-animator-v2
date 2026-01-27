# Execution Model: Two-Phase Frame Execution

**Target audience:** Runtime maintainers
**Last updated:** 2026-01-27
**Implementation:** `src/runtime/ScheduleExecutor.ts`

---

## Table of Contents

1. [Overview](#overview)
2. [The Problem: State Causality](#the-problem-state-causality)
3. [The Solution: Two-Phase Execution](#the-solution-two-phase-execution)
4. [Phase 1: Signal Evaluation and Reads](#phase-1-signal-evaluation-and-reads)
5. [Phase 2: State Writes](#phase-2-state-writes)
6. [Schedule Structure and Step Types](#schedule-structure-and-step-types)
7. [Invariants Enforced by Phasing](#invariants-enforced-by-phasing)
8. [Examples](#examples)
9. [Failure Modes](#failure-modes)
10. [Buffer Management and Memory Model](#buffer-management-and-memory-model)
11. [Integration with Other Systems](#integration-with-other-systems)
12. [Maintenance Guidelines](#maintenance-guidelines)

---

## Overview

The Oscilla runtime executes each animation frame using a **two-phase execution model**:

- **Phase 1** evaluates all signals, materializes fields, applies continuity, fires events, and collects render operations. All state reads see values from the **previous frame**.
- **Phase 2** writes new state values that will be used in the **next frame**.

This separation is **non-negotiable**. It ensures stateful blocks (like `UnitDelay`, `Lag`, `Phasor`, `SampleAndHold`) maintain proper delay semantics and prevents causality violations in feedback loops.

### Key Properties

| Property | Guaranteed By |
|----------|--------------|
| State reads see consistent t-1 values | Phase 1 never modifies state array |
| Stateful blocks exhibit one-frame delay | Phase 2 deferred until all reads complete |
| Feedback loops are acyclic within a frame | Phase 1 forms a DAG; cycles only via Phase 2 |
| Hot-swap doesn't corrupt state | Phase boundaries provide clean migration points |

### Frame Execution Lifecycle

```
Frame N:
  ┌─ Phase 1 ───────────────────────────────────┐
  │ 1. Read external inputs (mouse, time)       │
  │ 2. Evaluate all signal expressions          │
  │    └─> State reads: get state[i] (t-1)      │
  │ 3. Materialize field buffers                │
  │ 4. Build continuity mappings                │
  │ 5. Apply continuity policies                │
  │ 6. Fire events (edge detection)             │
  │ 7. Collect render operations                │
  └──────────────────────────────────────────────┘
  ┌─ Phase 2 ───────────────────────────────────┐
  │ 8. Write new state values (for frame N+1)   │
  │    └─> State writes: state[i] = value (t)   │
  └──────────────────────────────────────────────┘
  ┌─ Post-Frame ─────────────────────────────────┐
  │ 9. Render to canvas                          │
  │ 10. Advance frame counter                    │
  └──────────────────────────────────────────────┘
```

---

## The Problem: State Causality

Stateful blocks must output the **previous frame's value**, not the current frame's. Without phase separation, we risk creating **combinatorial loops** instead of proper delays.

### Concrete Example: UnitDelay Feedback Loop

Consider a simple feedback loop:
```
signal → UnitDelay → output
  ↑                     |
  └─────────────────────┘
```

**Correct semantics** (what we want):
- Frame 0: `input = 5.0`, `output = 0.0` (initial state)
- Frame 1: `input = 10.0`, `output = 5.0` (delay shows previous input)
- Frame 2: `input = 15.0`, `output = 10.0` (delay shows previous input)

**Without phasing** (naive implementation):
```typescript
// Frame N execution (hypothetical broken version)
for (const step of steps) {
  if (step.kind === 'evalSig' && step.expr === inputExpr) {
    slots[inputSlot] = 10.0;
  }
  if (step.kind === 'stateWrite' && step.stateSlot === delayState) {
    state[delayState] = slots[inputSlot]; // Write happens too early!
  }
  if (step.kind === 'evalSig' && step.expr === outputExpr) {
    slots[outputSlot] = state[delayState]; // Reads the just-written value!
  }
}
// Result: output = 10.0 immediately (no delay)
```

The delay block becomes a **feedthrough**—it outputs the current input instead of the delayed input. This violates the block's semantic contract.

### Why This Matters

1. **Correctness**: Delay semantics are fundamental to animation (smooth transitions, lag, momentum)
2. **Determinism**: Without phasing, execution order affects output (non-deterministic)
3. **Cycles**: Feedback loops become combinatorial (infinite recursion or wrong values)
4. **Composition**: Higher-level blocks built on stateful primitives would inherit the bug

---

## The Solution: Two-Phase Execution

Phase separation ensures **state reads happen before state writes**:

```typescript
// Phase 1: All reads, no writes
for (const step of steps) {
  if (step.kind === 'evalSig') {
    // State reads see PREVIOUS frame's values
    const value = evaluateSignal(step.expr, signals, state);
    slots[step.target] = value;
  }
  // ... other non-state-write steps ...

  // SKIP stateWrite steps (handled in Phase 2)
  if (step.kind === 'stateWrite' || step.kind === 'fieldStateWrite') {
    continue;
  }
}

// Phase 2: Only writes, no reads
for (const step of steps) {
  if (step.kind === 'stateWrite') {
    const value = evaluateSignal(step.value, signals, state);
    state[step.stateSlot] = value; // Writes for NEXT frame
  }
  // ... fieldStateWrite handled similarly ...
}
```

This pattern guarantees:
- All state reads in Phase 1 see consistent t-1 values
- All state writes in Phase 2 prepare t values for the next frame
- No step can read a value written in the same frame

---

## Phase 1: Signal Evaluation and Reads

**Purpose:** Compute all derived values and prepare rendering without modifying persistent state.

### Step Types Executed in Phase 1

| Step Type | Purpose | State Interaction |
|-----------|---------|------------------|
| `evalSig` | Evaluate signal expression, cache result | **Reads** state via `SigExprStateRead` nodes |
| `slotWriteStrided` | Write multi-component values (vec2, vec3, color) | None (slot writes only) |
| `materialize` | Instantiate field buffers for arrays | None (allocates buffers, reads slots) |
| `continuityMapBuild` | Detect domain changes, build element mappings | **Reads** previous domain from continuity store |
| `continuityApply` | Apply slew/snap policies to field transitions | **Reads** previous field values from continuity store |
| `evalEvent` | Fire events based on edge detection | **Reads** previous event state |
| `render` | Collect render operations for canvas | None (reads slots only) |

### Key Invariant (Phase 1)

**The state array is read-only during Phase 1.**

Any step that modifies `state[i]` must be deferred to Phase 2. This invariant is enforced by:
1. **Compiler**: Only `stateWrite` and `fieldStateWrite` steps emit state modifications
2. **Runtime**: Phase 1 loop skips these step types entirely
3. **Type system**: State-modifying operations return `StepStateWrite`, not `StepEvalSig`

### State Reads in Phase 1

Signal expressions may read state using `SigExprStateRead` nodes:

```typescript
interface SigExprStateRead {
  kind: 'stateRead';
  stateSlot: StateSlotId; // Positional index into state array
}
```

During evaluation, this reads from the state array populated by the **previous frame's Phase 2**:

```typescript
case 'stateRead':
  return state.state[expr.stateSlot]; // Previous frame's value
```

### Why Continuity Operations Are Phase 1

Continuity (slew, snap) must see **stable domain state** from the previous frame. If continuity ran in Phase 2:
- Domain changes could conflict with state writes
- Gauges (continuity state) wouldn't be available for rendering
- Render operations would use pre-continuity values (janky animations)

By placing continuity in Phase 1, we ensure smoothed values are ready for rendering.

---

## Phase 2: State Writes

**Purpose:** Persist values for the next frame's execution.

### Step Types Executed in Phase 2

| Step Type | Purpose | State Interaction |
|-----------|---------|------------------|
| `stateWrite` | Write scalar value to state array | **Writes** `state[stateSlot] = value` |
| `fieldStateWrite` | Write field values (per-lane) to state array | **Writes** each lane to contiguous state slots |

### Key Invariant (Phase 2)

**Phase 2 never evaluates new signals or reads slots populated by state writes.**

Phase 2 steps only:
1. Read signal expressions already evaluated in Phase 1 (from cache)
2. Read field buffers already materialized in Phase 1
3. Write results to the state array

No new computation occurs; Phase 2 is purely **persistence**.

### State Writes in Phase 2

#### Scalar State Write
```typescript
interface StepStateWrite {
  kind: 'stateWrite';
  stateSlot: StateSlotId; // Where to write
  value: SigExprId;       // What to write (already evaluated in Phase 1)
}

// Execution:
const value = state.cache.sigValues[step.value]; // Read cached result
state.state[step.stateSlot] = value;             // Write to state array
```

#### Field State Write
```typescript
interface StepFieldStateWrite {
  kind: 'fieldStateWrite';
  stateSlot: StateSlotId; // Base slot (first lane)
  value: FieldExprId;     // Field to persist (already materialized)
}

// Execution:
const buffer = state.values.f64Fields.get(step.value); // Materialized buffer
for (let i = 0; i < buffer.length; i++) {
  state.state[step.stateSlot + i] = buffer[i]; // Write each lane
}
```

### Why State Writes Are Separate Steps

Why not embed state writes directly in `evalSig` steps? Because:

1. **Clarity**: State writes are side effects; separating them makes data flow explicit
2. **Phasing**: Deferring writes to Phase 2 is a type-level property, not runtime logic
3. **Scheduling**: Compiler can reason about state dependencies independently
4. **Hot-swap**: State writes form a clean migration boundary (more below)

---

## Schedule Structure and Step Types

The schedule is built by `src/compiler/passes-v2/pass7-schedule.ts` with explicit phase ordering.

### Phase Ordering in Schedule Construction

From `pass7-schedule.ts` (lines 4-15):
```
1. Update rails/time inputs       [Phase 1]
2. Execute continuous scalars     [Phase 1: evalSig]
3. Build continuity mappings      [Phase 1: continuityMapBuild]
4. Execute continuous fields      [Phase 1: materialize]
5. Apply continuity policies      [Phase 1: continuityApply]
6. Apply discrete ops             [Phase 1: evalEvent]
7. Sinks (render)                 [Phase 1: render]
8. State writes                   [Phase 2: stateWrite, fieldStateWrite]
```

### Step Definitions

All step types are defined in `src/compiler/ir/types.ts` (lines 434-550).

**Union type:**
```typescript
type Step =
  | StepEvalSig           // Phase 1
  | StepSlotWriteStrided  // Phase 1
  | StepMaterialize       // Phase 1
  | StepRender            // Phase 1
  | StepContinuityMapBuild // Phase 1
  | StepContinuityApply   // Phase 1
  | StepEvalEvent         // Phase 1
  | StepStateWrite        // Phase 2
  | StepFieldStateWrite;  // Phase 2
```

The runtime uses this union to dispatch execution in `ScheduleExecutor.ts`.

### Schedule Validation

The compiler guarantees:
- All `stateWrite` and `fieldStateWrite` steps appear after Phase 1 steps
- Dependencies within Phase 1 are topologically sorted (DAG ordering)
- No Phase 1 step depends on a Phase 2 write (impossible by construction)

The runtime **trusts** the schedule; it does not re-validate phase ordering.

---

## Invariants Enforced by Phasing

### Invariant I7: Cycles Must Cross Stateful Boundary

**Spec reference:** `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md`

> **I7: Cycles must cross stateful boundary**
> Feedback loops are only legal if they pass through a stateful block (UnitDelay, Lag, Phasor, SampleAndHold).

**How two-phase execution enforces this:**

1. **Phase 1 forms a DAG**: All signal evaluation, materialization, and rendering are acyclic within a frame.
2. **Cycles only via Phase 2**: Stateful blocks introduce delays by writing to state in Phase 2 and reading from state in Phase 1.
3. **Mechanical enforcement**: The compiler rejects graphs with combinatorial cycles; the only legal cycles pass through `stateWrite` steps.

**Example:**
```
        ┌─────────────────┐
        ↓                 │
[input] → [UnitDelay] → [output]
```

- Frame N, Phase 1: `output = state[delay]` (reads t-1 value)
- Frame N, Phase 2: `state[delay] = input` (writes t value)
- Frame N+1, Phase 1: `output = state[delay]` (reads t value, written in N)

The cycle is broken by the phase boundary. Without it, the graph would be cyclic within Phase 1 (illegal).

### Other Invariants Depending on Phasing

| Invariant | How Phasing Helps |
|-----------|------------------|
| **I1: Time is monotonic** | Phase 1 sees consistent time; Phase 2 doesn't re-evaluate time |
| **I3: State continuity with stable IDs** | Phase 2 boundary provides migration point for hot-swap |
| **I5: Continuity preserves smooth transitions** | Continuity applies in Phase 1 using stable t-1 state |
| **(Implicit) One-frame delay for stateful blocks** | Guaranteed by Phase 1 reads before Phase 2 writes |

---

## Examples

### Example 1: Correct Feedback Loop (UnitDelay)

**Graph:**
```
signal → UnitDelay → output
  ↑                     |
  └─────────────────────┘
```

**Schedule IR:**
```typescript
{
  steps: [
    // Phase 1
    { kind: 'evalSig', expr: signalExpr, target: signalSlot },
    { kind: 'evalSig', expr: delayOutputExpr, target: outputSlot },
    // delayOutputExpr = SigExprStateRead(stateSlot=0)

    { kind: 'render', ... },

    // Phase 2
    { kind: 'stateWrite', stateSlot: 0, value: signalExpr }
  ]
}
```

**Execution (Frame N):**

| Time | Action | State Array | Output Slot |
|------|--------|-------------|-------------|
| Frame N-1 end | (previous frame wrote state) | `[5.0]` | — |
| **Phase 1 start** | Evaluate `signal` → 10.0 | `[5.0]` | — |
| | Evaluate `delayOutput` = `state[0]` | `[5.0]` | `5.0` |
| | Collect render ops | `[5.0]` | `5.0` |
| **Phase 2 start** | Write `state[0] = 10.0` | `[10.0]` | `5.0` |
| Frame N end | State ready for next frame | `[10.0]` | `5.0` |

**Result:** Output is `5.0` in Frame N (previous input), not `10.0` (current input). ✅ Correct delay semantics.

---

### Example 2: Violation Scenario (What Would Break Without Two-Phase)

**Hypothetical broken implementation** (single-phase execution):

```typescript
// BAD: No phase separation
for (const step of steps) {
  switch (step.kind) {
    case 'evalSig':
      if (step.expr.kind === 'stateRead') {
        slots[step.target] = state[step.expr.stateSlot]; // Reads state
      } else {
        slots[step.target] = evaluateSignal(step.expr, signals, state);
      }
      break;
    case 'stateWrite':
      state[step.stateSlot] = evaluateSignal(step.value, signals, state); // Writes state
      break;
  }
}
```

**Schedule IR (same as Example 1):**
```typescript
{
  steps: [
    { kind: 'evalSig', expr: signalExpr, target: signalSlot },
    { kind: 'stateWrite', stateSlot: 0, value: signalExpr }, // Happens too early!
    { kind: 'evalSig', expr: delayOutputExpr, target: outputSlot },
    { kind: 'render', ... }
  ]
}
```

**Execution (Frame N):**

| Step | Action | State Array | Output Slot |
|------|--------|-------------|-------------|
| Frame N-1 end | (previous frame wrote state) | `[5.0]` | — |
| 1 | Evaluate `signal` → 10.0 | `[5.0]` | — |
| 2 | Write `state[0] = 10.0` | `[10.0]` ❌ | — |
| 3 | Evaluate `delayOutput` = `state[0]` | `[10.0]` | `10.0` ❌ |
| 4 | Collect render ops | `[10.0]` | `10.0` |

**Result:** Output is `10.0` in Frame N (current input). ❌ No delay; block is feedthrough.

**Why this is catastrophic:**
- UnitDelay no longer delays
- Lag blocks become instant
- Phasor state would corrupt
- Feedback loops could diverge or oscillate unpredictably

---

### Example 3: Schedule Structure with Multiple Blocks

**Graph:**
```
time → sin → slew → render
         ↓
      unitDelay (feedback)
```

**Schedule IR:**
```typescript
{
  steps: [
    // Phase 1: Evaluate signals
    { kind: 'evalSig', expr: timeExpr, target: timeSlot },
    { kind: 'evalSig', expr: sinExpr, target: sinSlot },
    { kind: 'evalSig', expr: delayOutputExpr, target: delaySlot },
    // delayOutputExpr reads state[0]

    // Phase 1: Materialize fields (if any)
    { kind: 'materialize', field: positionField, instanceId: 'circles', target: posSlot },

    // Phase 1: Apply continuity (slew)
    { kind: 'continuityApply', targetKey: 'slew1', instanceId: 'circles', policy: 'slew', baseSlot: sinSlot, outputSlot: slewedSlot, semantic: 'custom', stride: 1 },

    // Phase 1: Render
    { kind: 'render', instanceId: 'circles', positionSlot: posSlot, colorSlot: slewedSlot, shape: {...} },

    // Phase 2: State writes
    { kind: 'stateWrite', stateSlot: 0, value: sinExpr }
  ]
}
```

**Key observations:**
- `delayOutputExpr` reads `state[0]` in Phase 1 (sees previous frame's sine value)
- `continuityApply` (slew) runs in Phase 1, using the slewed value for rendering
- `stateWrite` persists the current sine value for the next frame
- Dependencies within Phase 1 are resolved by topological ordering (time → sin → slew → render)

---

## Failure Modes

### What Breaks If Phases Are Violated

| Violation | Symptom | Impact |
|-----------|---------|--------|
| **State write in Phase 1** | Delays become feedthrough | Loss of temporal continuity, animations glitch |
| **State read in Phase 2** | Reads see current frame's writes | Non-deterministic output (depends on step order) |
| **Reordering steps across phase boundary** | Cycles within a frame | Compiler errors or infinite loops |
| **Merging phases into one loop** | State reads see inconsistent values | Combinatorial feedback loops, crashes |

### Why These Failures Are Hard to Debug

1. **Symptoms are subtle**: A delay of 16ms (one frame) vs. 0ms is hard to notice visually
2. **Non-determinism**: Execution order affects output, making bugs flaky
3. **Cascade effects**: Higher-level blocks built on stateful primitives inherit the bug
4. **Silent corruption**: State arrays may contain invalid values without throwing errors

### Preventing Violations

**Design-time:**
- Type system enforces step kinds (`stateWrite` is a distinct type)
- Compiler pass ordering documented in `pass7-schedule.ts`

**Runtime:**
- Phase 1 loop explicitly skips `stateWrite` and `fieldStateWrite` steps
- Phase 2 loop only processes state-write steps

**Code review:**
- Any new step type must declare its phase explicitly
- Changes to `ScheduleExecutor.ts` require phase-awareness justification

---

## Buffer Management and Memory Model

### State Array Layout

The state array is a `Float64Array` of scalar values:

```typescript
interface RuntimeState {
  state: Float64Array; // Persistent state across frames
  // ... other fields ...
}
```

**Properties:**
- **Size**: Fixed at schedule construction time (`stateSlotCount`)
- **Positional indexing**: State slots are numbered 0, 1, 2, ... (not stable across recompilation)
- **Stable IDs**: `StableStateId` (semantic identifier) maps to positional slots via `StateMigration`

### Slot Cache vs. State Array

| Storage | Lifetime | Purpose | Phase Interaction |
|---------|----------|---------|------------------|
| **Slot cache** (`values.f64`) | Single frame | Intermediate signal values | Written in Phase 1, read-only after |
| **State array** (`state`) | Persistent | Stateful block memory | Read in Phase 1, written in Phase 2 |

**Critical distinction:**
- Slots are **ephemeral** (cleared each frame)
- State is **persistent** (survives across frames)

### Memory Safety

**No aliasing:** State array and slot cache are separate allocations. A bug in slot writes cannot corrupt state.

**Buffer pooling:** Field buffers (e.g., for arrays) are pooled to avoid GC pressure. Buffers are reset at the start of each frame, but state array is never reset.

---

## Integration with Other Systems

### Hot-Swap and State Migration

When the graph is recompiled (live editing), state must be migrated from the old state array to the new one.

**Migration happens between frames:**
```
Frame N:
  Phase 1 (old schedule)
  Phase 2 (old schedule)
  [State migration: old state → new state]

Frame N+1:
  Phase 1 (new schedule) ← reads migrated state
  Phase 2 (new schedule)
```

**Why phase boundaries matter:**
- Phase 2 completes before migration (state is consistent)
- Phase 1 of new schedule reads migrated state (no partial updates)

See `src/runtime/StateMigration.ts` for details.

### Continuity System

Continuity (slew, snap) stores per-instance "gauges" that track element-wise state for smooth transitions.

**Interaction with phasing:**
- `continuityMapBuild` (Phase 1): Detects domain changes, builds mappings
- `continuityApply` (Phase 1): Applies policies using gauges from previous frame
- Gauges are updated at the end of Phase 1 (before Phase 2)

Continuity state is **separate from the state array**. It does not participate in Phase 2 writes.

### Event System

Events fire based on edge detection (rising/falling edges of predicates).

**Phasing:**
- `evalEvent` runs in Phase 1
- Reads previous event state (`eventPrevPredicate` array) to detect edges
- Writes to current event scalars (`eventScalars` array, Phase 1)
- Previous state is updated at the end of Phase 1 (before Phase 2)

Events do not write to the main state array.

---

## Maintenance Guidelines

### Adding a New Step Type

**Decision tree:**

1. **Does the step write to the state array?**
   - Yes → Phase 2 step (`stateWrite` or `fieldStateWrite`)
   - No → Go to step 2

2. **Does the step depend on a Phase 2 write?**
   - Yes → **ERROR**: Phase 1 cannot depend on Phase 2 (would create cycle)
   - No → Go to step 3

3. **Does the step read from state?**
   - Yes → Phase 1 step (reads t-1 state)
   - No → Phase 1 step (pure computation)

**Checklist:**
- [ ] Define step interface in `src/compiler/ir/types.ts`
- [ ] Add to `Step` union type
- [ ] Add case to Phase 1 or Phase 2 loop in `ScheduleExecutor.ts`
- [ ] Update schedule construction in `pass7-schedule.ts`
- [ ] Add tests in `src/runtime/__tests__/ScheduleExecutor.test.ts`
- [ ] Document in this file (if semantically significant)

### Modifying Execution Order

**Allowed:**
- Reordering steps within Phase 1 (as long as dependencies are respected)
- Reordering steps within Phase 2 (state writes are independent)

**Forbidden:**
- Moving a Phase 2 step to Phase 1
- Moving a Phase 1 step to Phase 2 (unless it's a new state-write operation)
- Interleaving Phase 1 and Phase 2 steps

**Validation:**
- Check that all tests pass (especially `phase7-kernel-sanity.test.ts`)
- Manually verify UnitDelay feedback loop behavior (Example 1 above)
- Ensure hot-swap still works (state migration relies on phase boundaries)

### Performance Optimization

**Safe optimizations:**
- Batch similar steps together (e.g., all `evalSig` steps with same cache locality)
- Parallelize independent Phase 1 steps (future work, requires dependency analysis)
- Reuse buffers across frames (already done for field buffers)

**Unsafe optimizations:**
- Merging Phase 1 and Phase 2 loops (violates invariants)
- Early state writes to "reduce latency" (breaks delay semantics)
- Lazy evaluation of state writes (state must be ready for next frame)

### Common Mistakes to Avoid

1. **Assuming slots persist across frames**: Slots are cleared; state is not.
2. **Reading state in Phase 2**: Phase 2 should only write, not read.
3. **Adding side effects to signal evaluation**: Signals are pure; side effects go in steps.
4. **Skipping Phase 2**: All state writes must execute (even if "unused").

---

## Further Reading

- **Canonical Spec**: `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md` (Invariant I7)
- **Implementation**: `src/runtime/ScheduleExecutor.ts` (lines 167-505)
- **Schedule Construction**: `src/compiler/passes-v2/pass7-schedule.ts`
- **Step Definitions**: `src/compiler/ir/types.ts` (lines 434-550)
- **State Migration**: `src/runtime/StateMigration.ts`
- **Continuity System**: `design-docs/CANONICAL-oscilla-v2.5-20260109/11-continuity-system.md`

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-27 | Initial | First version documenting two-phase execution model |
