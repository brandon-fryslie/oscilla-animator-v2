# Domain Transformation Blocks - Architecture & Specification

**Author**: User guidance (2026-01-25)
**Status**: ARCHITECTURE SPECIFICATION
**Scope**: Core set of 6 explicit adapter blocks for cardinality and temporality transforms

---

## Principles

Domain transformations **must always be explicit**:
1. Never inserted implicitly by the compiler
2. Represented as first-class blocks in the normalized graph
3. Each carries a specific, nailed-down policy
4. Visible in IR for debugging and inspection

## Why Explicit Blocks

**Semantic clarity**: Users see exactly what transformation happens
**Performance visibility**: Transformations that change complexity (one→many scales with lane count) are obvious
**Determinism**: No hidden compiler rewrites, schedule is inspectable data
**Unit strictness**: Transforms don't smuggle meaning across type boundaries

## The 6 Core Blocks

### Cardinality Transforms (many ↔ one)

#### 1. Reduce
**Purpose**: Collapse a field to a scalar
**Type Signature**: `many+continuous<T> → one+continuous<T>`
**Inputs**:
- `field`: many+continuous<T>
- `op` (param): enum {mean | sum | min | max | rms | any | all}

**Output**: one+continuous<T>

**Semantics**:
- Computed every frame from current field buffer
- `any`/`all` for bool fields only
- Numeric ops for numeric types
- Example: reduce(positionField, "mean") → camera target position

**Why**: Other half of Broadcast; closes loops between field computations and global control

---

#### 2. SampleFieldAt
**Purpose**: Pick one lane's value by index
**Type Signature**: `many+continuous<T> × one+continuous<int> → one+continuous<T>`
**Inputs**:
- `field`: many+continuous<T>
- `index`: one+continuous<int> (lane selector)

**Output**: one+continuous<T>

**Semantics**:
- Index floored to int
- Out-of-range clamps to [0, count-1]
- If count=0, output is fixed default (required param)
- Example: select one shape's position for highlight

**Why**: Enables UI selection, probes, "hero instance" control without inventing runtime paths

---

#### 3. ScatterToField
**Purpose**: Inject signal into one lane of a field
**Type Signature**: `one+continuous<T> × one+continuous<int> × many+continuous<T> → many+continuous<T>`
**Inputs**:
- `value`: one+continuous<T> (scalar to inject)
- `index`: one+continuous<int> (lane selector)
- `baseField`: many+continuous<T> (field template)

**Output**: many+continuous<T>

**Semantics**:
- Output starts as baseField (untouched)
- Writes value into lane at index
- Index rules same as SampleFieldAt
- Example: override one shape while keeping others from baseField

**Why**: Enables per-lane overrides (selection highlights, special behavior) without special-casing sinks

---

### Temporality Transforms (discrete ↔ continuous)

#### 4. EventToSignalHold
**Purpose**: Convert momentary events to continuous signal
**Type Signature**: `one+discrete<T> → one+continuous<T>`
**Inputs**:
- `event`: one+discrete<T>
- `initial` (param): T (initial value before first event)

**Output**: one+continuous<T>

**Semantics**:
- Output holds the last event payload indefinitely
- If multiple events in one frame: last-wins in schedule order
- Initialization: starts at `initial` value
- Example: toggle event → sustained on/off signal for animation

**Why**: Clean bridge from momentary triggers into continuous modulation (toggles, mode switches, captures)

---

#### 5. SignalToEventCrossing
**Purpose**: Convert continuous signal to discrete events via threshold
**Type Signature**: `one+continuous<float> → one+discrete<unit>` (or discrete<float> with payload)
**Inputs**:
- `signal`: one+continuous<float>
- `threshold` (param or input): float
- `hysteresis` (param): float (epsilon to prevent chatter)

**Output**: one+discrete<unit>

**Semantics**:
- Emits event when signal crosses threshold upwards
- Hysteresis prevents rapid re-triggering
- At most one event per frame
- Threshold can be static param or dynamic signal input
- Example: animation progress crossing 0.5 → spawn event

**Why**: Turns continuous animation into triggers (spawn, latch, snapshot, step sequencers) without polling

---

### Time Primitives (continuous time → discrete)

#### 6. Clock
**Purpose**: Time-domain primitive: emit events at regular intervals
**Type Signature**: `one+continuous<seconds> → one+discrete<unit>` (or discrete<float> with phase)
**Inputs**:
- `time`: one+continuous<seconds> (typically from TimeRoot)
- `period` (param): float (seconds between events)

**State**:
- `phase`: float (accumulated time mod period)

**Output**: one+discrete<unit>

**Semantics**:
- Emits event every period seconds
- Stable under variable dt by accumulating phase internally
- Deterministic given TimeRoot + state
- Schedule ordering: one event per frame maximum
- Example: beat every 0.5 seconds for step sequencer

**Why**: Minimal source of discrete structure; makes event-driven patterns explicit

---

## Schedule Integration Requirements

### Temporality Boundaries

For blocks 4-6 (discrete↔continuous transforms), need to define:
1. **Event timing**: Does event fire before/after continuous evaluation?
2. **Continuity tracking**: How do identity mappings work when cardinality changes?
3. **Frame ordering**: If multiple temporality transforms, what's the schedule?

**Current assumption**: Events are evaluated with continuous signals (same schedule tier), but order within tier is explicit via block dependencies.

---

## Type System Additions

Each block requires type signature definition in block registry:

```typescript
registerBlock({
  type: 'Reduce',
  form: 'primitive',
  inputs: {
    field: {
      label: 'Field',
      type: signalTypeField('*', 'default'),  // Polymorphic on payload
    },
    op: {
      label: 'Operation',
      type: signalTypeScalar('select'),  // Enum parameter
    },
  },
  outputs: {
    out: {
      label: 'Scalar',
      type: signalTypeScalar('*'),  // Same payload as field
    },
  },
  // ... cardinality & temporality rules
});
```

---

## Implementation Phases

### Phase 1: Cardinality Only (Blocks 1-3)
- Reduce, SampleFieldAt, ScatterToField
- No temporality changes
- **Effort**: 3-4 days
- **Confidence**: HIGH
- **Deliverable**: All 3 blocks working, tests passing, UI can connect/highlight

### Phase 2: Temporality Bridges (Blocks 4-5)
- EventToSignalHold, SignalToEventCrossing
- Requires schedule spec details
- **Effort**: 3-4 days
- **Confidence**: MEDIUM (needs schedule coordination)
- **Deliverable**: Both blocks working with proper state, schedule integration

### Phase 3: Time Primitives (Block 6)
- Clock
- Requires state management
- **Effort**: 1-2 days
- **Confidence**: MEDIUM (depends on TimeRoot design)
- **Deliverable**: Clock block emitting events at intervals

---

## Testing Strategy

**Per-block tests**:
- Type checker accepts valid connections
- Runtime evaluation produces correct output
- Edge cases (empty fields, out-of-range indices, threshold hysteresis)

**Integration tests**:
- Connect blocks in series (e.g., Broadcast → Reduce → use as signal)
- Schedule ordering for temporality transforms
- Hot reload preserves block state (Clock phase)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Schedule coordination (Phase 2) | Document schedule tier clearly before implementation |
| Instance identity in Scatter (Phase 1) | Define continuity mapping for injected lanes |
| Clock state persistence (Phase 3) | Use immutable state snapshots |
| Type system growth | Keep block signatures simple, no per-payload variants |

---

## Non-Goals (Out of Scope)

- Implicit domain transformation by compiler
- Inference of adapter blocks (users must add explicitly)
- Magic "helpful" coercions (strict everywhere)
- Value-space transforms (degrees→radians, normalization) - those are value adapters
- Domain remapping beyond cardinality/temporality

---

## Success Criteria

1. All 6 blocks implement their spec exactly
2. Type checker correctly validates connections
3. No implicit compiler rewrites (all transforms explicit)
4. Every transform visible in normalized graph and IR
5. No hidden performance cliffs (users understand complexity changes)
6. Tests cover edge cases and integration scenarios
