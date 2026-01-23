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

### State Identity: StateId

State is keyed by stable `StateId` — a semantic identifier that survives recompilation. StateId identifies the **state array** (the conceptual unit), not individual lanes.

```
StateId = blockId + primitive_kind [+ state_key_disambiguator]
```

- For scalar state: StateId maps to one slot (stride floats)
- For field state: StateId maps to a contiguous range of `laneCount × stride` floats
- Lane index is NOT part of StateId — it is a positional offset within the array

### State Mapping Types

The compiler emits state mappings that describe how StateIds map to buffer positions:

```typescript
// Scalar state (cardinality: one)
interface StateMappingScalar {
  stateId: StateId;     // stable semantic identity
  slotIndex: number;    // unstable positional offset
  stride: number;       // floats per state element (often 1)
  initial: number[];    // length = stride, per-element initial values
}

// Field state (cardinality: many)
interface StateMappingField {
  stateId: StateId;         // stable (identifies the whole state array)
  instanceId: InstanceId;   // ties buffer to lane set identity
  slotStart: number;        // unstable start offset
  laneCount: number;        // N at compile time
  stride: number;           // floats per lane state (>=1)
  initial: number[];        // length = stride (per-lane init template)
}
```

### State Allocation by Cardinality

| Cardinality | State Allocation | Mapping Type |
|-------------|------------------|--------------|
| `one` | `stride` floats | `StateMappingScalar` |
| `many(instance)` | `laneCount × stride` floats | `StateMappingField` |
| `zero` | No state (compile-time constant) | None |

### Stride

The `stride` field represents how many floats each state element requires:
- Simple state (e.g., UnitDelay on float): stride = 1
- Multi-component state (e.g., UnitDelay on vec3): stride = 3
- Multi-value state (e.g., filter storing y and dy): stride = 2 (even for float payload)

### State Migration (Invariant I3)

When hot-swapping, state migrates based on StateId:

**Scalar state** (StateMappingScalar):

| Condition | Action |
|-----------|--------|
| Same StateId + same stride | Copy |
| Same StateId + different stride | Reset + diagnostic |
| StateId in old but not new | Discard (block deleted) |
| StateId in new but not old | Use initial values (new block) |

**Field state** (StateMappingField):

| Condition | Action |
|-----------|--------|
| Same StateId + stable identity mode | Migrate per-lane using continuity's lane mapping (old lane → new lane) |
| Same StateId + non-stable identity | Reset all lanes (strict) or copy by index (declared fallback) |
| Lane count grew | Copy existing lanes, initialize new lanes with `initial` |
| Lane count shrank | Copy only retained lanes |
| StateId in old but not new | Discard |
| StateId in new but not old | Use initial values |

```typescript
interface StateMigration {
  stateId: StateId;
  action: 'copy' | 'remap' | 'reset';
  laneMappingUsed?: boolean;  // true if continuity mapping applied
  diagnostic?: string;        // Shown to user if reset
}
```

**Important**: For field-state migration, lane index is NOT semantic identity. When the continuity system provides stable element IDs (identityMode='stable'), the migrator builds an `oldLaneIndex → newLaneIndex` mapping and copies state per lane via that mapping. Without stable identity, use the declared fallback policy.

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

## Three-Layer Execution Architecture

The runtime organizes computation into three layers with strict boundary rules. This defines what belongs in each layer, preventing monolithic "do everything" functions.

### Layer 1: Opcode Layer

Pure scalar numeric operations. Generic math with no domain semantics.

**Contract**:
- Input/Output: `number[] → number`
- No phase/coordinate semantics
- No domain knowledge (doesn't know what values represent)
- Fixed arity per opcode

**Examples**: `sin`, `cos`, `add`, `mul`, `clamp`, `lerp`, `hash`, `abs`, `floor`, `pow`

**Boundary rule**: If the operation makes sense for arbitrary numbers regardless of their domain meaning, it belongs here.

### Layer 2: Signal Kernel Layer

Domain-specific `scalar → scalar` functions with documented domain/range contracts.

**Contract**:
- Input/Output: scalar → scalar (fixed arity)
- Documented domain and range for each kernel
- Phase-aware, easing-aware, noise-aware

**Categories**:

| Category | Examples | Domain → Range |
|----------|----------|---------------|
| Oscillators | `oscSin`, `oscCos`, `triangle`, `square`, `sawtooth` | phase ∈ [0,1] → [-1,1] |
| Easing | `easeInQuad`, `easeOutCubic`, `smoothstep` | t ∈ [0,1] → u ∈ [0,1] |
| Noise | `noise1` | any real → [0,1) |

**Boundary rule**: If the operation is scalar→scalar but requires knowledge of what the value represents (phase, normalized time, etc.), it belongs here.

### Layer 3: Field Kernel Layer

Vec2/color/field operations applied lane-wise across field buffers.

**Contract**:
- Input: field buffers (vec2, color, float arrays)
- Output: field buffers
- Lane-wise application (per-element)
- May allocate temporary buffers

**Categories**:

| Category | Examples |
|----------|----------|
| Geometry | `polarToCartesian`, `polygonVertex`, `circleLayout` |
| Color | `hsvToRgb`, `hueFromPhase`, `applyOpacity` |
| Effects | `jitter2d`, `attract2d`, `fieldPulse` |

**Boundary rule**: If the operation works on multi-component values (vec2, color) or operates across field lanes, it belongs here.

### Materializer (Orchestrator)

The materializer orchestrates execution across layers:

1. Interpret IR → allocate buffers
2. Execute intrinsics (domain loop bounds, active masks)
3. Dispatch to appropriate layer based on operation type
4. Call field kernels for lane-wise operations
5. Write to render sinks

The materializer is NOT a layer — it's the coordinator that invokes the three layers in the correct order.

### Layer Boundary Summary

| Question | Answer | Layer |
|----------|--------|-------|
| Is it generic math on numbers? | Yes | Opcode |
| Is it scalar→scalar with domain meaning? | Yes | Signal Kernel |
| Does it work on vec2/color/fields? | Yes | Field Kernel |
| Does it orchestrate execution? | Yes | Materializer |

---

## Typed Scalar/Field Banks (T3 Implementation Note)

The abstract `RuntimeState` (defined above) uses `Float32Array` for all scalar storage and `Map<number, Float32Array>` for fields. An implementation may use typed banks for better type safety and stride-aware allocation:

```typescript
// T3: Implementation option — typed banks
interface TypedRuntimeState {
  scalarsF32: Float32Array;
  scalarsI32: Int32Array;
  scalarsShape2D: Uint32Array;       // packed shape references
  fieldsF32: Map<number, Float32Array>;
  fieldsVec2: Map<number, Float32Array>;  // stride=2
  fieldsColor: Map<number, Uint8ClampedArray>;
}
```

This is an optimization, not architecture. The abstract `RuntimeState` definition (single `scalars: Float32Array`) remains canonical. Implementations may use typed banks to avoid stride calculations and enable more efficient access patterns, but must maintain equivalent semantics.

---

## Render Assembly (RenderAssembler)

### Purpose

RenderAssembler is the final stage of frame execution. It bridges the gap between schedule evaluation (which produces slot/expr outputs) and the renderer (which consumes concrete buffers). It lives in the runtime, NOT the renderer.

This stage enforces Invariant I15 (Renderer is sink-only) by ensuring ALL interpretation of IR concepts happens before the renderer sees anything.

### Execution Pipeline

```
1. Schedule executes → fills scalar banks, evaluates field exprs
         ↓
2. RenderAssembler walks render sinks:
   a. Materializes required fields via Materializer
   b. Reads scalar banks for uniforms (scale, rotation, opacity)
   c. Resolves shape2d handles → (topologyId, pointsBuffer, flags/style)
   d. Composes world position: positionXY(Field<vec2>) + positionZ(Field<float>, default 0.0) → Field<vec3>
   e. Resolves camera parameters (preview override → Camera block → system defaults)
   f. Runs projection kernel → screenPosition(Field<vec2>), depth(Field<float>), visible(Field<bool>)
   g. Computes depth ordering (two-phase: fast-path detection, then stable sort if needed)
   h. Groups into passes by shared geometry+style
         ↓
3. RenderAssembler outputs RenderFrameIR
   - Only concrete typed arrays
   - Only numeric topology IDs
   - No slot/expr IDs, no IR references
   - Includes screenPosition, depth permutation, visible mask
         ↓
4. Renderer consumes RenderFrameIR (pure sink)
```

For full camera/projection pipeline details, see [18-camera-projection](./18-camera-projection.md).

### Responsibilities

1. **Materialize field references** — Call `Materializer.materialize(fieldExprId, instanceId, ...)` for every field the pass needs
2. **Read scalar values** — Read scalar slot banks directly for uniforms
3. **Resolve shape2d** — Unpack the shape2d handle type (8 u32 words):
   - Read topologyId from packed struct
   - Fetch points field buffer by slot/expr ID
   - Validate verbs/arity/pointCount match (once per pass)
4. **Emit normalized passes** — No "shape modes", no "param name mapping", no side channels

### Shape2D Resolution

The shape2d PayloadType (handle type, stride=8) is resolved here:

```
shape2d packed words → {
  topologyId: words[0]          → PathTopologyDef lookup
  pointsFieldSlot: words[1]     → Materializer.materialize() → Float32Array
  pointsCount: words[2]         → Validation against topology
  styleRef: words[3]            → PathStyle construction
  flags: words[4]               → closed/fillRule/etc
}
```

The renderer never sees shape2d handles — it only receives resolved PathGeometryTemplate.

### What RenderAssembler Does NOT Do

- **No canvas/GPU calls** — That's the renderer
- **No creative logic** — That's the patch
- **No field evaluation** — That's the Materializer (which it calls)
- **No topology definition** — That's the topology registry

---

## See Also

- [04-compilation](./04-compilation.md) - How IR is generated
- [03-time-system](./03-time-system.md) - Time management
- [06-renderer](./06-renderer.md) - Render output
- [16-coordinate-spaces](./16-coordinate-spaces.md) - Coordinate space model
- [Glossary: StateSlot](../GLOSSARY.md#stateslot)
- [Invariant: I8](../INVARIANTS.md#i8-slot-addressed-execution)
