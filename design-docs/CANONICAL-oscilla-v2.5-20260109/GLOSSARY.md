---
parent: INDEX.md
---

# Glossary

> Authoritative definitions for all terms in this specification.

Use these definitions consistently. When in doubt, this is the canonical source.

---

## Core Type System

### PayloadType

**Definition**: The base data type of a value - what the payload is made of.

**Type**: type

**Canonical Form**: `PayloadType`

**Values**: `'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit'`

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: Replaces `ValueType` and `DomainTag`. Does NOT include 'event' or 'domain'.

---

### Extent

**Definition**: The 5-axis coordinate describing where/when/about-what a value exists.

**Type**: type

**Canonical Form**: `Extent`

**Structure**:
```typescript
type Extent = {
  cardinality: AxisTag<Cardinality>;
  temporality: AxisTag<Temporality>;
  binding: AxisTag<Binding>;
  perspective: AxisTag<PerspectiveId>;
  branch: AxisTag<BranchId>;
};
```

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: Replaces `World`. Independent of payload.

---

### SignalType

**Definition**: Complete type description for a port or wire. The full contract.

**Type**: type

**Canonical Form**: `SignalType`

**Structure**:
```typescript
type SignalType = {
  payload: PayloadType;
  extent: Extent;
};
```

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: Replaces `Type` / `TypeDesc`. No optional fields.

---

### AxisTag

**Definition**: Discriminated union representing "default unless instantiated".

**Type**: type

**Canonical Form**: `AxisTag<T>`

**Structure**:
```typescript
type AxisTag<T> =
  | { kind: 'default' }
  | { kind: 'instantiated'; value: T };
```

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### Cardinality

**Definition**: How many lanes a value has.

**Type**: type

**Canonical Form**: `Cardinality`

**Values**:
- `{ kind: 'zero' }` - compile-time constant
- `{ kind: 'one' }` - single lane
- `{ kind: 'many'; domain: DomainRef }` - N lanes aligned by domain

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### Temporality

**Definition**: When a value exists.

**Type**: type

**Canonical Form**: `Temporality`

**Values**:
- `{ kind: 'continuous' }` - every frame/tick
- `{ kind: 'discrete' }` - event occurrences only

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### Binding

**Definition**: Referential anchoring - what is this value about?

**Type**: type

**Canonical Form**: `Binding`

**Values**:
- `{ kind: 'unbound' }` - pure value
- `{ kind: 'weak'; referent: ReferentRef }` - measurement-like
- `{ kind: 'strong'; referent: ReferentRef }` - property-like
- `{ kind: 'identity'; referent: ReferentRef }` - stable identity

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: v0 uses `unbound` default only. Independent of domain.

---

### Domain

**Definition**: Compile-time declared stable index set defining element topology.

**Type**: concept / compile-time resource

**Canonical Form**: `Domain`, `DomainId`, `DomainDecl`

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: NOT a wire value. Referenced by SignalType's Cardinality axis.

---

## Derived Type Concepts

### Field

**Definition**: A SignalType where `cardinality = many(domain)` and `temporality = continuous`.

**Type**: concept (type constraint)

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: UI still uses "field" terminology; it's a constraint, not a separate type.

---

### Signal

**Definition**: A SignalType where `cardinality = one` and `temporality = continuous`.

**Type**: concept (type constraint)

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### Trigger

**Definition**: A SignalType where `cardinality = one` and `temporality = discrete`.

**Type**: concept (type constraint)

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

## Block System

### Block

**Definition**: The only compute unit in the system. Has stable identity, typed ports.

**Type**: concept

**Canonical Form**: `Block`

**Structure**:
```typescript
interface Block {
  id: BlockId;
  kind: string;  // NOT type
  role: BlockRole;
  inputs: PortBinding[];
  outputs: PortBinding[];
}
```

**Source**: [02-block-system.md](./topics/02-block-system.md)

---

### Block.kind

**Definition**: Identifies which block definition this instance uses.

**Type**: property

**Canonical Form**: `kind` (not `type`)

**Example**: `"Add"`, `"UnitDelay"`, `"RenderInstances2D"`

**Source**: [02-block-system.md](./topics/02-block-system.md)

**Note**: `type` is reserved for the type system.

---

### BlockRole

**Definition**: Discriminated union identifying whether a block is user-created or derived.

**Type**: type

**Canonical Form**: `BlockRole`

**Structure**:
```typescript
type BlockRole =
  | { kind: "user" }
  | { kind: "derived"; meta: DerivedBlockMeta };
```

**Source**: [02-block-system.md](./topics/02-block-system.md)

---

### DerivedBlockMeta

**Definition**: Metadata for derived blocks specifying their purpose.

**Type**: type

**Canonical Form**: `DerivedBlockMeta`

**Values**:
- `defaultSource` - fallback value for port
- `wireState` - state on a wire
- `bus` - user-created global bus
- `rail` - system-provided bus
- `lens` - transform/adapter

**Source**: [02-block-system.md](./topics/02-block-system.md)

---

### EdgeRole

**Definition**: Discriminated union identifying edge purpose.

**Type**: type

**Canonical Form**: `EdgeRole`

**Values**: `user`, `default`, `busTap`, `auto`

**Source**: [02-block-system.md](./topics/02-block-system.md)

---

## Stateful Primitives

### UnitDelay

**Definition**: Fundamental stateful primitive. `y(t) = x(t-1)`.

**Type**: block

**Source**: [02-block-system.md](./topics/02-block-system.md)

---

### Lag

**Definition**: Stateful primitive. Smoothing filter toward target.

**Type**: block

**Source**: [02-block-system.md](./topics/02-block-system.md)

---

### Phasor

**Definition**: Stateful primitive. Phase accumulator (0..1 with wrap).

**Type**: block

**Source**: [02-block-system.md](./topics/02-block-system.md)

---

### SampleAndHold

**Definition**: Stateful primitive. Latches value when trigger fires.

**Type**: block

**Source**: [02-block-system.md](./topics/02-block-system.md)

---

## Time System

### TimeRoot

**Definition**: Single authoritative time source. System-managed.

**Type**: block

**Canonical Form**: `TimeRoot`

**Outputs**: `tMs`, `phaseA`, `phaseB`, `progress`, `pulse`

**Source**: [03-time-system.md](./topics/03-time-system.md)

---

### tMs

**Definition**: Simulation time in milliseconds. Monotonic and unbounded.

**Type**: variable

**Canonical Form**: `tMs`

**SignalType**: `one + continuous + int`

**Source**: [03-time-system.md](./topics/03-time-system.md)

---

### Rail

**Definition**: Immutable system-provided bus. Cannot be deleted or renamed.

**Type**: concept

**Canonical Form**: `Rail`

**MVP Rails**: `time`, `phaseA`, `phaseB`, `pulse`, `palette`

**Source**: [03-time-system.md](./topics/03-time-system.md)

**Note**: Rails are blocks - can have inputs overridden.

---

## Combine System

### CombineMode

**Definition**: Strategy for combining multiple writers to an input.

**Type**: type

**Canonical Form**: `CombineMode`

**Values**:
- Numeric: `sum`, `avg`, `min`, `max`, `mul`
- Any: `last`, `first`, `layer`
- Boolean: `or`, `and`

**Source**: [02-block-system.md](./topics/02-block-system.md)

**Note**: Built-in only. No custom registry.

---

## Compilation

### NormalizedGraph

**Definition**: Canonical compile-time representation the compiler consumes.

**Type**: type

**Canonical Form**: `NormalizedGraph`

**Structure**:
```typescript
type NormalizedGraph = {
  domains: DomainDecl[];
  nodes: Node[];
  edges: Edge[];
};
```

**Source**: [04-compilation.md](./topics/04-compilation.md)

---

### CompiledProgramIR

**Definition**: Output of compilation. What the runtime executes.

**Type**: type

**Canonical Form**: `CompiledProgramIR`

**Source**: [04-compilation.md](./topics/04-compilation.md)

---

### Schedule

**Definition**: Explicit execution order as data structure.

**Type**: type

**Canonical Form**: `Schedule`

**Source**: [04-compilation.md](./topics/04-compilation.md)

---

## Runtime

### StateSlot

**Definition**: Persistent storage for stateful primitive.

**Type**: type

**Canonical Form**: `StateSlot`

**Source**: [05-runtime.md](./topics/05-runtime.md)

---

### ScalarSlot

**Definition**: Storage for single-lane value.

**Type**: type

**Canonical Form**: `ScalarSlot`

**Source**: [05-runtime.md](./topics/05-runtime.md)

---

### FieldSlot

**Definition**: Storage for multi-lane value (dense array).

**Type**: type

**Canonical Form**: `FieldSlot`

**Source**: [05-runtime.md](./topics/05-runtime.md)

---

## Renderer

### RenderInstances2D

**Definition**: Primary render sink block.

**Type**: block

**Canonical Form**: `RenderInstances2D`

**Source**: [06-renderer.md](./topics/06-renderer.md)

---

### RenderIR

**Definition**: Generic render intermediate produced by patch.

**Type**: type

**Canonical Form**: `RenderIR`

**Source**: [06-renderer.md](./topics/06-renderer.md)

---

## UI & Interaction

### Transform

**Definition**: Umbrella term for value transformations and type conversions on edges.

**Type**: concept

**Canonical Form**: `Transform` (abstract), `Adapter` (subtype), `Lens` (subtype)

**Subtypes**:
- **Adapter**: Type conversion that enables ports of different types to connect (mechanical compatibility, no value transformation)
- **Lens**: Value transformation (scale, offset, easing, etc.) - may or may not change type

**Source**: [14-modulation-table-ui.md](./topics/14-modulation-table-ui.md)

**Implementation**: Transforms compile to blocks in the patch

**Note**: Transform registry and detailed transform system are deferred (roadmap item)

---

### Adapter

**Definition**: A transform that changes signal type to enable port connections, without transforming the value itself.

**Type**: concept (transform subtype)

**Canonical Form**: `Adapter`

**Purpose**: Mechanical port compatibility

**Example**: `phase → float` adapter allows phase output to connect to float input by converting type representation

**Source**: [14-modulation-table-ui.md](./topics/14-modulation-table-ui.md)

---

### Lens

**Definition**: A transform that modifies signal values, possibly changing type as a side effect.

**Type**: concept (transform subtype)

**Canonical Form**: `Lens`

**Purpose**: Value transformation and modulation

**Examples**:
- `scale(0..1 → 0..360)` - range mapping
- `ease(inOut)` - easing curve
- `offset(+0.5)` - value shift

**Source**: [14-modulation-table-ui.md](./topics/14-modulation-table-ui.md)

**Note**: Lens system details deferred to future spec topic

---

## Naming Conventions

### Type Names

- **PascalCase**: `SignalType`, `PayloadType`, `BlockRole`, `Extent`
- No generic syntax in names: `SignalType`, not `Signal<T>`

### Block Names

- **PascalCase**: `UnitDelay`, `RenderInstances2D`
- Use `kind` property (not `type`)

### Variable Names

- **camelCase**: `tMs`, `dtMs`, `phaseA`
- Time values suffixed with unit: `tMs`, `durationMs`

### Discriminated Unions

- Use `kind` as discriminator everywhere
- Closed unions (no free-form keys)
- No optional fields - use union branches

---

## Diagnostics & Observability

### Diagnostic

**Definition**: A timestamped, structured record describing a condition (error/warn/info/perf) attached to a specific target in the graph.

**Type**: type

**Canonical Form**: `Diagnostic`

**Structure**:
```typescript
interface Diagnostic {
  id: string;  // stable hash for dedupe
  code: DiagnosticCode;
  severity: Severity;
  domain: Domain;
  primaryTarget: TargetRef;
  title: string;
  message: string;
  actions?: DiagnosticAction[];
  metadata: DiagnosticMetadata;
}
```

**Source**: [07-diagnostics-system.md](./topics/07-diagnostics-system.md)

**Note**: Diagnostics are stateful facts, not messages. They have lifecycle and can be deduped/updated.

---

### DiagnosticHub

**Definition**: Central state manager for all diagnostic events. Maintains compile/authoring/runtime scopes with snapshot semantics.

**Type**: class

**Canonical Form**: `DiagnosticHub`

**Source**: [07-diagnostics-system.md](./topics/07-diagnostics-system.md)

**Note**: Subscribes to GraphCommitted, CompileBegin, CompileEnd, ProgramSwapped, RuntimeHealthSnapshot events.

---

### TargetRef

**Definition**: Discriminated union pointing to a graph element (block, port, bus, edge, etc.). Every diagnostic must have one.

**Type**: type

**Canonical Form**: `TargetRef`

**Values**:
```typescript
type TargetRef =
  | { kind: 'block'; blockId: string }
  | { kind: 'port'; blockId: string; portId: string }
  | { kind: 'bus'; busId: string }
  | { kind: 'binding'; bindingId: string; ... }
  | { kind: 'timeRoot'; blockId: string }
  | { kind: 'graphSpan'; blockIds: string[]; ... }
  | { kind: 'composite'; compositeDefId: string; ... }
```

**Source**: [07-diagnostics-system.md](./topics/07-diagnostics-system.md)

**Note**: Target addressing makes diagnostics clickable/navigable in UI.

---

### DiagnosticCode

**Definition**: Machine-readable enum for diagnostic types. Follows naming convention: E_ (error), W_ (warn), I_ (info), P_ (perf).

**Type**: enum

**Canonical Form**: `DiagnosticCode`

**Examples**: `E_TIME_ROOT_MISSING`, `W_BUS_EMPTY`, `I_REDUCE_REQUIRED`, `P_FIELD_MATERIALIZATION_HEAVY`

**Source**: [07-diagnostics-system.md](./topics/07-diagnostics-system.md)

**Note**: 22 canonical codes defined. Stable across patches for deduplication.

---

### Severity

**Definition**: Diagnostic severity level. Determines UI treatment and urgency.

**Type**: enum

**Canonical Form**: `Severity`

**Values**: `'hint' | 'info' | 'warn' | 'error' | 'fatal'`

**Source**: [07-diagnostics-system.md](./topics/07-diagnostics-system.md)

**Semantics**:
- `fatal`: Patch cannot run
- `error`: Cannot compile/meaningless result
- `warn`: Runs but important issue
- `info`: Guidance
- `hint`: Suggestions (dismissible)

---

### DiagnosticAction

**Definition**: Structured fix action attached to a diagnostic. Serializable, replayable, deterministic.

**Type**: type

**Canonical Form**: `DiagnosticAction`

**Examples**:
- `{ kind: 'goToTarget'; target: TargetRef }`
- `{ kind: 'insertBlock'; blockType: 'UnitDelay'; ... }`
- `{ kind: 'createTimeRoot'; timeRootKind: 'Cycle' }`

**Source**: [07-diagnostics-system.md](./topics/07-diagnostics-system.md)

**Note**: Actions are intentions, not code. UI/runtime knows how to execute them.

---

### EventHub

**Definition**: Typed, synchronous, non-blocking event coordination spine. Central dispatcher for all domain events (graph changes, compilation, runtime lifecycle).

**Type**: class

**Canonical Form**: `EventHub`

**API**:
```typescript
class EventHub {
  emit(event: EditorEvent): void;
  on<T>(type: T, handler: (event: Extract<EditorEvent, { type: T }>) => void): () => void;
  subscribe(handler: (event: EditorEvent) => void): () => void;
}
```

**Source**: [12-event-hub.md](./topics/12-event-hub.md)

**Note**: Events emitted after state changes are committed. Handlers cannot synchronously mutate core state.

---

### EditorEvent

**Definition**: Discriminated union of all event types. Strongly typed to enable exhaustiveness checking.

**Type**: type

**Canonical Form**: `EditorEvent`

**Examples**:
```typescript
type EditorEvent =
  | GraphCommittedEvent
  | CompileBeginEvent
  | CompileEndEvent
  | ProgramSwappedEvent
  | RuntimeHealthSnapshotEvent
  | MacroInsertedEvent
  | BusCreatedEvent
  | BlockAddedEvent
  | ...
```

**Source**: [12-event-hub.md](./topics/12-event-hub.md)

**Note**: Every event includes `EventMeta` (patchId, rev, tx, origin, at).

---

### GraphCommitted

**Definition**: Event emitted exactly once after any user operation changes the patch graph (blocks/buses/bindings/time root).

**Type**: event

**Canonical Form**: `GraphCommittedEvent`

**Payload**:
```typescript
{
  type: 'GraphCommitted';
  patchId: string;
  patchRevision: number;  // Monotonic, increments on every edit
  reason: 'userEdit' | 'macroExpand' | 'compositeSave' | 'migration' | 'import' | 'undo' | 'redo';
  diffSummary: { blocksAdded, blocksRemoved, busesAdded, busesRemoved, bindingsChanged, timeRootChanged };
  affectedBlockIds?: string[];
  affectedBusIds?: string[];
}
```

**Source**: [12-event-hub.md](./topics/12-event-hub.md), [13-event-diagnostics-integration.md](./topics/13-event-diagnostics-integration.md)

**Note**: Triggers authoring validators in DiagnosticHub. Single boundary event for all graph mutations.

---

### CompileBegin

**Definition**: Event emitted when compilation begins for a specific graph revision.

**Type**: event

**Canonical Form**: `CompileBeginEvent`

**Payload**:
```typescript
{
  type: 'CompileBegin';
  compileId: string;      // UUID for this compile pass
  patchId: string;
  patchRevision: number;
  trigger: 'graphCommitted' | 'manual' | 'startup' | 'hotReload';
}
```

**Source**: [12-event-hub.md](./topics/12-event-hub.md)

**Note**: Marks compile diagnostics as "pending" in DiagnosticHub.

---

### CompileEnd

**Definition**: Event emitted when compilation completes. Contains authoritative diagnostic snapshot and status indicating success or failure.

**Type**: event

**Canonical Form**: `CompileEndEvent`

**Payload**:
```typescript
{
  type: 'CompileEnd';
  compileId: string;
  patchId: string;
  patchRevision: number;
  status: 'success' | 'failure';
  durationMs: number;
  diagnostics: Diagnostic[];  // Authoritative snapshot
  programMeta?: { timelineHint, busUsageSummary };
}
```

**Source**: [12-event-hub.md](./topics/12-event-hub.md), [13-event-diagnostics-integration.md](./topics/13-event-diagnostics-integration.md)

**Note**: DiagnosticHub replaces compile snapshot (not merge). Single event covering both success and failure cases.

---

### ProgramSwapped

**Definition**: Event emitted when runtime begins executing a newly compiled program.

**Type**: event

**Canonical Form**: `ProgramSwappedEvent`

**Payload**:
```typescript
{
  type: 'ProgramSwapped';
  patchId: string;
  patchRevision: number;
  compileId: string;
  swapMode: 'hard' | 'soft' | 'deferred';
  swapLatencyMs: number;
  stateBridgeUsed?: boolean;
}
```

**Source**: [12-event-hub.md](./topics/12-event-hub.md)

**Note**: Sets active revision pointer in DiagnosticHub. Runtime diagnostics attach to active revision.

---

### RuntimeHealthSnapshot

**Definition**: Low-frequency (2-5 Hz) event containing runtime performance metrics and optional diagnostic deltas.

**Type**: event

**Canonical Form**: `RuntimeHealthSnapshotEvent`

**Payload**:
```typescript
{
  type: 'RuntimeHealthSnapshot';
  patchId: string;
  activePatchRevision: number;
  tMs: number;
  frameBudget: { fpsEstimate, avgFrameMs, worstFrameMs };
  evalStats: { fieldMaterializations, nanCount, infCount, worstOffenders };
  diagnosticsDelta?: { raised: Diagnostic[]; resolved: string[] };
}
```

**Source**: [12-event-hub.md](./topics/12-event-hub.md), [13-event-diagnostics-integration.md](./topics/13-event-diagnostics-integration.md)

**Note**: Updates runtime diagnostics without per-frame spam. Emitted at 2-5 Hz, NOT 60 Hz.

---

### DebugGraph

**Definition**: Compile-time static metadata describing patch topology for debugging. Contains buses, publishers, listeners, pipelines, and reverse lookup indices.

**Type**: type / concept

**Canonical Form**: `DebugGraph`

**Source**: [08-observation-system.md](./topics/08-observation-system.md)

**Note**: Immutable per patch revision. Used by DebugService for probe operations.

---

### DebugSnapshot

**Definition**: Runtime sample of system state at a point in time. Contains bus values, binding values, health metrics, performance counters.

**Type**: type

**Canonical Form**: `DebugSnapshot`

**Source**: [08-observation-system.md](./topics/08-observation-system.md)

**Note**: Emitted at 10-15 Hz (configurable). Bounded data structures to avoid memory explosion.

---

### DebugTap

**Definition**: Optional interface passed to compiler/runtime to record debug information. Non-allocating, level-gated.

**Type**: interface

**Canonical Form**: `DebugTap`

**Source**: [08-observation-system.md](./topics/08-observation-system.md)

**Methods**:
- `onDebugGraph(g: DebugGraph)` - Called at compile time
- `onSnapshot(s: DebugSnapshot)` - Called at sample rate
- `recordBusNow(busId, value)` - Record bus value
- `recordBindingNow(bindingId, value)` - Record binding value
- `hitMaterialize(who)` - Count field materialization
- `hitAdapter(id)`, `hitLens(id)` - Count adapter/lens invocations

---

### DebugService

**Definition**: Central observation service. Manages DebugGraph, snapshots, and provides query APIs for UI.

**Type**: class

**Canonical Form**: `DebugService`

**Source**: [08-observation-system.md](./topics/08-observation-system.md)

**Note**: Separate from DiagnosticHub. Responsible for observation, not problem reporting.

---

### ValueSummary

**Definition**: Compact representation of a value for debug snapshots. Non-allocating tagged union.

**Type**: type

**Canonical Form**: `ValueSummary`

**Values**:
```typescript
type ValueSummary =
  | { t: 'num'; v: number }
  | { t: 'vec2'; x: number; y: number }
  | { t: 'color'; rgba: number }
  | { t: 'phase'; v: number }
  | { t: 'bool'; v: 0|1 }
  | { t: 'trigger'; v: 0|1 }
  | { t: 'none' }
  | { t: 'err'; code: string };
```

**Source**: [08-observation-system.md](./topics/08-observation-system.md)

**Note**: Never includes Field contents or large arrays.

---

## Deprecated Terms

| Deprecated | Use Instead | Notes |
|------------|-------------|-------|
| `DomainTag` | `PayloadType` | Domain is topology |
| `ValueType` | `PayloadType` | More precise name |
| `World` | `Extent` | 5-axis coordinate |
| `Type` / `TypeDesc` | `SignalType` | Complete contract |
| `config` / `scalar` (world) | `cardinality = zero` | Explicit axis |
| `signal` (world) | `one + continuous` | Explicit axes |
| `field` (world) | `many(domain) + continuous` | Explicit axes |
| `event` (world) | `discrete` temporality | Orthogonal axis |
| `Block.type` | `Block.kind` | Reserved for types |
| `structural` (role) | `derived` | System-generated |
| State block | `UnitDelay` | Proper name |
| custom combine | (removed) | Built-in only |
