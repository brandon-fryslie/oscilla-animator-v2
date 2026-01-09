---
parent: ../INDEX.md
topic: runtime
order: 5
---

# Runtime

> How compiled programs execute frame by frame.

**Related Topics**: [04-compilation](./04-compilation.md), [03-time-system](./03-time-system.md)
**Key Terms**: [StateSlot](../GLOSSARY.md#stateslot), [Schedule](../GLOSSARY.md#schedule)
**Relevant Invariants**: [I1](../INVARIANTS.md#i1-time-is-monotonic-and-unbounded), [I3](../INVARIANTS.md#i3-state-continuity-with-stable-ids), [I8](../INVARIANTS.md#i8-slot-addressed-execution)

---

## Overview

The runtime executes CompiledProgramIR each frame. Key properties:

- **Slot-addressed**: No string lookups in hot loops
- **Axis-erased**: No type tags at runtime
- **Deterministic**: Same inputs → same outputs
- **State-explicit**: Only stateful primitives have memory

---

## Execution Model

### One Tick (Frame)

Every tick:

1. **Sample inputs**: External inputs (UI, MIDI, etc.)
2. **Update time**: `tMs`, `phaseA`, `phaseB`, `progress`
3. **Execute schedule**: Continuous subgraph in order
4. **Process events**: Discrete events for this tick
5. **Write sinks**: Render outputs

### Tick Timing

- Target: **5-10ms per frame** (60-200 fps)
- All axis resolution happens at compile time
- No runtime type checking or dispatch

---

## Storage Model

### Runtime Slots

```typescript
// Scalar value (one lane)
type ScalarSlot = {
  kind: 'scalar_slot';
  id: number;
  value: number | boolean | [number, number] | [number, number, number, number];
};

// Field value (many lanes)
type FieldSlot = {
  kind: 'field_slot';
  id: number;
  domain: DomainId;
  values: Float32Array | Int32Array | Uint8Array;  // Dense array
};

// Event buffer (discrete occurrences)
type EventSlot = {
  kind: 'event_slot';
  id: number;
  events: EventPayload[];  // Per-tick buffer
};

// Persistent state
type StateSlot = {
  kind: 'state_slot';
  id: number;
  value: number | Float32Array;  // Scalar or per-lane
};
```

### Slot Layout

Slots are contiguous arrays indexed by slot ID:

```typescript
interface RuntimeState {
  scalars: Float32Array;        // All scalar values
  fields: Map<number, Float32Array>;  // Field slot id → values
  events: Map<number, EventPayload[]>;  // Event slot id → buffer
  state: Map<number, Float32Array>;  // State slot id → persistent values
}
```

---

## State Management

### State Slots

Only stateful primitives (UnitDelay, Lag, Phasor, SampleAndHold) have state slots.

### State Keying

State is keyed by `(blockId, laneIndex)`:

```typescript
interface StateKey {
  blockId: BlockId;      // Stable UUID
  laneIndex: number;     // 0 for scalar, 0..N-1 for field
}
```

### State Allocation by Cardinality

| Cardinality | State Allocation |
|-------------|------------------|
| `one` | Single value |
| `many(domain)` | Array of N(domain) values |
| `zero` | No state (compile-time constant) |

### State Migration (Invariant I3)

When hot-swapping, state migrates based on StateId:

| Condition | Action |
|-----------|--------|
| Same StateId + same type/layout | Copy |
| Same StateId + compatible layout | Transform |
| Different StateId or incompatible | Reset + diagnostic |

```typescript
interface StateMigration {
  stateId: StateId;
  action: 'copy' | 'transform' | 'reset';
  diagnostic?: string;  // Shown to user if reset
}
```

---

## Scheduling

### Schedule Execution

The schedule is a list of steps executed in order:

```typescript
function executeSchedule(schedule: Schedule, state: RuntimeState): void {
  for (const step of schedule.steps) {
    executeStep(step, state);
  }
}

function executeStep(step: Step, state: RuntimeState): void {
  switch (step.kind) {
    case 'eval_scalar':
      state.scalars[step.output.id] = evaluateNode(step.nodeId, state);
      break;
    case 'eval_field':
      const domain = getDomain(step.domain);
      for (let i = 0; i < domain.count; i++) {
        state.fields.get(step.output.id)![i] = evaluateNode(step.nodeId, state, i);
      }
      break;
    case 'state_read':
      state.scalars[step.output.id] = state.state.get(step.stateId)![0];
      break;
    case 'state_write':
      state.state.get(step.stateId)![0] = state.scalars[step.input.id];
      break;
    // ... etc
  }
}
```

### Deterministic Order

Schedule order is deterministic:
1. Topologically sorted by data dependencies
2. State reads before dependent computations
3. State writes after computations complete
4. Render sinks last

---

## Domain Loops

### Field Evaluation

Fields evaluate over domain loops:

```typescript
// Fixed count domain
for (let i = 0; i < domain.count; i++) {
  output[i] = operation(inputs.map(inp => inp[i]));
}

// Grid 2D domain
for (let y = 0; y < domain.height; y++) {
  for (let x = 0; x < domain.width; x++) {
    const i = y * domain.width + x;
    output[i] = operation(inputs.map(inp => inp[i]), x, y);
  }
}
```

### Loop Bounds

Domain loop bounds are **compile-time constants**:
- `fixed_count`: Direct count
- `grid_2d`: width × height
- `voices`: maxVoices
- `mesh_vertices`: Resolved from asset at load time

---

## Event Processing

### Event Buffer Model

Events are per-tick scratch buffers:

```typescript
interface EventBuffer {
  events: EventPayload[];  // Occurrences this tick
  capacity: number;        // Preallocated size
}

interface EventPayload {
  key: string;
  value: number;  // float or int
}
```

### Event Ordering (Invariant I4)

Events have deterministic ordering:
1. Stable across combine operations
2. Stable within-frame scheduling
3. Order matches writer connection order

### Event-to-Continuous Conversion

Events don't implicitly become continuous. Explicit blocks required:
- **SampleAndHold**: Latch value on event
- **Accumulator**: Sum event values (post-MVP)

---

## Performance Constraints

### Runtime Erasure

**No type information at runtime**:

```typescript
// WRONG: Runtime type dispatch
if (value.type === 'field') { ... }  // NO!

// RIGHT: Compile-time slot selection
state.fields.get(fieldSlotId)[laneIndex] = value;  // YES
```

### No String Lookups

```typescript
// WRONG: String key lookup
const value = state.values[block.name];  // NO!

// RIGHT: Slot index
const value = state.scalars[slotId];  // YES
```

### Dense Arrays

Field values are dense arrays, not sparse maps:

```typescript
// RIGHT: Dense array
const field = new Float32Array(domainCount);

// WRONG: Sparse map
const field = new Map<number, number>();  // NO!
```

---

## Hot-Swap

### Continuity Guarantees

When recompiling:

| What | Behavior |
|------|----------|
| `tMs` | Continues unchanged |
| Rails | Continue |
| State (matching StateId) | Preserved or migrated |
| State (changed StateId) | Reset with diagnostic |
| Caches | Invalidated, rebuilt on demand |

### Atomic Swap

1. Old program continues rendering
2. New program compiles in background
3. When ready, atomic swap occurs
4. No blank frames or flicker

```typescript
interface HotSwap {
  oldProgram: CompiledProgramIR;
  newProgram: CompiledProgramIR;
  stateMigrations: StateMigration[];
  swapFrame: number;  // Atomic at this frame
}
```

---

## Caching

### Cache Keys (Invariant I14)

Every cache has explicit keys:

```typescript
interface CacheEntry {
  key: CacheKey;
  value: Float32Array | number;
  validUntil: number;  // Frame number or 'forever'
}

interface CacheKey {
  stepId: StepId;
  frame: number | 'stable';  // Per-frame or stable
  inputs: number[];  // Hash of input values
  params: number;    // Hash of parameters
}
```

### Cache Invalidation

Caches invalidate when:
- Input values change
- Parameters change
- Hot-swap changes StepId
- Frame changes (for time-varying caches)

---

## Traceability (Invariant I20)

Every value is attributable:

```typescript
interface ValueAttribution {
  slot: SlotRef;
  producedBy: NodeId;
  transformChain: NodeId[];  // Lenses applied
  combinedOn?: BusId;        // If multi-writer
  materializedFor?: SinkId;  // If forced by sink
}
```

This enables answering "why is this value X?" quickly.

---

## Deterministic Replay (Invariant I21)

Given:
- `PatchRevision` (exact patch state)
- `Seed` (random seed)
- `InputRecord` (external inputs over time)

Output is **identical**.

Requirements:
- No `Math.random()` - All randomness seeded
- Deterministic event ordering
- Stable scheduling
- Reproducible floating-point (within IEEE 754)

---

## Debugging Support

### Low-Overhead Tracing

Ring buffers for tracing with minimal allocation:

```typescript
interface TraceBuffer {
  entries: TraceEntry[];  // Circular buffer
  head: number;
  capacity: number;
}

interface TraceEntry {
  frame: number;
  stepId: StepId;
  slotId: number;
  value: number;
}
```

Can be enabled without recompiling.

### Structural Instrumentation

Every meaningful runtime action maps to stable IR identifiers:
- `NodeId` → which block
- `StepId` → which schedule step
- `ExprId` → which expression
- `ValueSlot` → which storage location

Tracing is not heuristic.

---

## Error Handling at Runtime

### No Silent Fallbacks

Errors are explicit, not hidden:

```typescript
interface RuntimeError {
  kind: 'division_by_zero' | 'nan_produced' | 'buffer_overflow';
  location: StepId;
  frame: number;
  context: Record<string, unknown>;
}
```

### Error Recovery

For non-fatal errors:
- Log error with attribution
- Use safe fallback value (0, NaN marker, etc.)
- Continue execution
- Surface in UI

---

## See Also

- [04-compilation](./04-compilation.md) - How IR is generated
- [03-time-system](./03-time-system.md) - Time management
- [06-renderer](./06-renderer.md) - Render output
- [Glossary: StateSlot](../GLOSSARY.md#stateslot)
- [Invariant: I8](../INVARIANTS.md#i8-slot-addressed-execution)
