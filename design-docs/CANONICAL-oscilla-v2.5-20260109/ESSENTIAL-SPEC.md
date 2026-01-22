# Oscilla v2.5: Essential Specification

> **Purpose:** Condensed spec for agent consumption during implementation.
> For full detail, rationale, and examples, see individual topic files.
> Token target: <30k (vs ~124k for full spec)

---

## System Invariants

> **These rules are non-negotiable. Violations indicate bugs.**

### A. Time, Continuity, and Edit-Safety

| ID | Rule | Enforcement |
|----|------|-------------|
| I1 | Time is monotonic, never wraps/resets/clamps | TimeRoot implementation |
| I2 | Gauge invariance: effective values continuous across discontinuities | Continuity System |
| I3 | State migration with stable StateIds | State migration system |
| I4 | Deterministic event ordering | Explicit ordering in scheduler |
| I5 | Single time authority per patch | Single TimeRoot |

### B. Graph Semantics

| ID | Rule | Enforcement |
|----|------|-------------|
| I6 | Compiler never mutates the graph | NormalizedGraph is immutable input |
| I7 | Cycles must cross stateful boundary | Tarjan's SCC + validation |
| I8 | Slot-addressed execution (no string lookups) | CompiledProgramIR uses indices |
| I9 | Schedule is inspectable data | Schedule IR is explicit |
| I10 | Uniform transform semantics (table-driven) | Transform registry |

### C. Fields, Identity, and Performance

| ID | Rule | Enforcement |
|----|------|-------------|
| I11 | Stable element identity | Pool-based allocation |
| I12 | Lazy fields with explicit materialization | Field expr DAGs |
| I13 | Structural sharing / hash-consing | ExprId canonicalization |
| I14 | Explicit cache keys | Cache key model |

### D. Rendering

| ID | Rule | Enforcement |
|----|------|-------------|
| I15 | Renderer is sink only (no creative logic) | Render IR |
| I16 | Real render IR (generic intermediate) | Render IR spec |
| I17 | Planned batching | Style/material keys in commands |
| I18 | Temporal stability (no flicker on swap) | Atomic swap |

### E. Debuggability

| ID | Rule | Enforcement |
|----|------|-------------|
| I19 | First-class error taxonomy | Error types in compiler |
| I20 | Traceability by stable IDs | Structural instrumentation |
| I21 | Deterministic replay | Seeded randomness only |
| I28 | Diagnostic attribution to targets | TargetRef required |
| I29 | Error taxonomy by domain/severity | DiagnosticCode enum |

### F. Live Performance

| ID | Rule | Enforcement |
|----|------|-------------|
| I22 | Safe modulation ranges (normalized domains) | Unit discipline |

### G. Scaling

| ID | Rule | Enforcement |
|----|------|-------------|
| I23 | Patch vs instance separation | Architecture |
| I24 | Snapshot/transaction model | Transaction-based edits |
| I25 | Asset system with stable IDs | Asset registry |

### H. Architecture Laws

| ID | Rule | Enforcement |
|----|------|-------------|
| I26 | Every input has a source (DefaultSource) | GraphNormalization |
| I27 | Toy detector: explicit execution order, identity, state | Entire invariant set |
| I30 | Continuity is deterministic | Uses t_model_ms only |
| I31 | Export matches playback | Same schedule/continuity |

---

## Glossary (Core Terms)

### Type System

**PayloadType**: Base data type - `'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit'`

**Extent**: 5-axis coordinate (cardinality, temporality, binding, perspective, branch)

**SignalType**: Complete type = `{ payload: PayloadType; extent: Extent }`

**AxisTag<T>**: `{ kind: 'default' } | { kind: 'instantiated'; value: T }`

**Cardinality**: `zero` (constant) | `one` (signal) | `many(instance)` (field)

**Temporality**: `continuous` (every frame) | `discrete` (events only)

**Domain**: Classification defining element kind (shape, circle, particle). NOT a count.

**DomainSpec**: Compile-time domain type spec with parent and intrinsics

**Instance**: Specific collection of domain elements with count and lifecycle

**InstanceDecl**: Per-patch instance declaration (id, domainType, maxCount, lifecycle)

**InstanceRef**: `{ kind: 'instance'; domainType: DomainTypeId; instanceId: InstanceId }`

### Derived Type Concepts

| Concept | Cardinality | Temporality |
|---------|-------------|-------------|
| Signal | `one` | `continuous` |
| Field | `many(instance)` | `continuous` |
| Trigger | `one` | `discrete` |

### Block System

**Block**: Only compute unit. Has `id`, `kind` (NOT type), `role`, `inputs`, `outputs`

**BlockRole**: `{ kind: 'user' }` | `{ kind: 'derived'; meta: DerivedBlockMeta }`

**DerivedBlockMeta**: `defaultSource` | `wireState` | `bus` | `rail` | `lens`

**EdgeRole**: `user` | `default` | `busTap` | `auto`

**Stateful Primitives (4)**: UnitDelay, Lag, Phasor, SampleAndHold

### Architecture

**Primitive Block**: Creates ONE element (Signal output). Circle, Rectangle, Polygon.

**Array Block**: Cardinality transform. Signal → Field. Creates Instance.

**Layout Block**: Computes positions for field elements. Grid, Spiral, Random.

### Compilation

**NormalizedGraph**: Fully explicit graph the compiler consumes

**CompiledProgramIR**: Output of compilation, executed by runtime

**Schedule**: Explicit execution order as data structure

### Runtime

**StateSlot**: Persistent storage for stateful primitive

**ScalarSlot**: Storage for single-lane value

**FieldSlot**: Storage for multi-lane value (dense array)

### Combine System

**CombineMode**: Strategy for multi-writer inputs
- Numeric: `sum`, `avg`, `min`, `max`, `mul`
- Any: `last`, `first`, `layer`
- Boolean: `or`, `and`

### Rails (System Buses)

| Rail | Type | Description |
|------|------|-------------|
| `time` | `one + continuous + int` | tMs value |
| `phaseA` | `one + continuous + phase` | Primary phase |
| `phaseB` | `one + continuous + phase` | Secondary phase |
| `pulse` | `one + discrete + unit` | Frame tick |
| `palette` | `one + continuous + color` | Chromatic reference |

---

## Type System (Core)

### PayloadType Semantics

| Type | Size | Range/Notes |
|------|------|-------------|
| `float` | 4 bytes | IEEE 754 |
| `int` | 4 bytes | Signed 32-bit |
| `vec2` | 8 bytes | Two floats |
| `color` | 16 bytes | RGBA, 0..1 each |
| `phase` | 4 bytes | 0..1 with wrap |
| `bool` | 1 byte | true/false |
| `unit` | 4 bytes | 0..1 clamped |

### Extent (Five-Axis Coordinate)

```typescript
type Extent = {
  cardinality: AxisTag<Cardinality>;
  temporality: AxisTag<Temporality>;
  binding: AxisTag<Binding>;      // v0: 'unbound' only
  perspective: AxisTag<string>;   // v0: 'global' only
  branch: AxisTag<string>;        // v0: 'main' only
};
```

### Cardinality

```typescript
type Cardinality =
  | { kind: 'zero' }                           // compile-time constant
  | { kind: 'one' }                            // single lane (Signal)
  | { kind: 'many'; instance: InstanceRef };   // N lanes (Field)
```

### Temporality

```typescript
type Temporality =
  | { kind: 'continuous' }  // every frame
  | { kind: 'discrete' };   // events only
```

### Axis Unification Rules (v0)

```
default + default                → default
default + instantiated(X)        → instantiated(X)
instantiated(X) + instantiated(X) → instantiated(X)
instantiated(X) + instantiated(Y), X≠Y → TYPE ERROR
```

### Domain vs Instance

**Domain** = Classification (what kind of thing)
**Instance** = Collection (how many, which pool)

```typescript
interface DomainSpec {
  readonly id: DomainTypeId;
  readonly parent: DomainTypeId | null;
  readonly intrinsics: readonly IntrinsicSpec[];
}

interface InstanceDecl {
  readonly id: InstanceId;
  readonly domainType: DomainTypeId;
  readonly primitiveId: PrimitiveId;
  readonly maxCount: number;
  readonly countExpr?: SigExprId;
  readonly lifecycle: 'static' | 'pooled';
}
```

### Phase Arithmetic

| Operation | Result |
|-----------|--------|
| `phase + float` | `phase` |
| `phase * float` | `phase` |
| `phase + phase` | TYPE ERROR |

---

## Block System (Core)

### Block Structure

```typescript
interface Block {
  id: BlockId;
  kind: string;        // "Add", "UnitDelay" - NOT 'type'
  role: BlockRole;
  inputs: PortBinding[];
  outputs: PortBinding[];
}

interface PortBinding {
  id: PortId;
  dir: { kind: 'in' } | { kind: 'out' };
  type: SignalType;
  combine: CombineMode;
}
```

### Block Roles

```typescript
type BlockRole =
  | { kind: "user" }
  | { kind: "derived"; meta: DerivedBlockMeta };

type DerivedBlockMeta =
  | { kind: "defaultSource"; target: { kind: "port"; port: PortRef } }
  | { kind: "wireState"; target: { kind: "wire"; wire: WireId } }
  | { kind: "bus"; target: { kind: "bus"; busId: BusId } }
  | { kind: "rail"; target: { kind: "bus"; busId: BusId } }
  | { kind: "lens"; target: { kind: "node"; node: NodeRef } };
```

### Key Invariants

1. **Roles are for editor, not compiler** - Compiler sees all blocks equally
2. **Compiler ignores roles** - Roles inform UI, undo/redo, persistence
3. **User entities are canonical** - Derived can be regenerated

### Three-Stage Architecture

```
Primitive → Array → Layout

[Circle] ──Signal<circle>──▶ [Array] ──Field<circle>──▶ [Grid] ──position──▶ [Render]
```

1. **Primitive**: ONE element (Signal output)
2. **Array**: Cardinality transform (Signal → Field, creates Instance)
3. **Layout**: Spatial arrangement (computes positions)

### Stateful Primitives

| Block | Behavior |
|-------|----------|
| **UnitDelay** | `y(t) = x(t-1)` |
| **Lag** | Smooth toward target |
| **Phasor** | 0..1 phase accumulator with wrap |
| **SampleAndHold** | Latch on trigger |

### Cardinality-Generic Blocks

Blocks whose computation is **per-lane** and valid for both Signal (one) and Field (many):

**Contract**: (1) lane-local, (2) cardinality-preserving, (3) instance-aligned, (4) deterministic per-lane.

**Are generic**: Math (Add, Mul, Hash, Noise), Stateful (UnitDelay, Lag, Phasor, SampleAndHold)
**Are NOT generic**: Array (transform), Reduce (aggregation), Layout (lane-coupled), Render (sink)

Compiler specializes each instance to either scalar or field step — no runtime generics.

### Cycle Validation

Every strongly connected component must contain at least one stateful primitive.

### Default Sources

Every input always has exactly one source. DefaultSource blocks provide fallbacks:

| PayloadType | Default |
|-------------|---------|
| `float` | `phaseA` rail or `Constant(0.5)` |
| `int` | `Constant(1)` |
| `vec2` | `Constant([0.5, 0.5])` |
| `color` | `HueRainbow(phaseA)` or white |
| `phase` | `phaseA` rail |
| `bool` | `Constant(true)` |

---

## Compilation (Core)

### Pipeline

```
RawGraph → GraphNormalization → NormalizedGraph → Compilation → CompiledProgramIR
```

### NormalizedGraph

Fully explicit graph the compiler consumes:

```typescript
type NormalizedGraph = {
  domains: DomainDecl[];
  nodes: Node[];
  edges: Edge[];
};
```

Properties:
- All derived blocks materialized
- Every input connected
- Every port typed
- Immutable to compiler

### Anchor-Based Stable IDs

Structural artifacts keyed by anchor:

| Type | Anchor Format |
|------|---------------|
| Default source | `defaultSource:<blockId>:<portName>:<in|out>` |
| Wire-state | `wireState:<wireId>` |
| Bus junction | `bus:<busId>:<pub|sub>:<typeKey>` |

### Type Resolution

1. **Propagation**: Infer missing structure
2. **Unification**: Ensure agreement
3. **Resolution**: Resolve defaults to concrete types

### Scheduling

```typescript
interface Schedule {
  steps: Step[];
  stateSlots: StateSlotDecl[];
  fieldSlots: FieldSlotDecl[];
  scalarSlots: ScalarSlotDecl[];
}

type Step =
  | { kind: 'eval_scalar'; nodeId: NodeId; output: ScalarSlot }
  | { kind: 'eval_field'; nodeId: NodeId; domain: DomainId; output: FieldSlot }
  | { kind: 'state_read'; stateId: StateId; output: SlotRef }
  | { kind: 'state_write'; input: SlotRef; stateId: StateId }
  | { kind: 'combine'; inputs: SlotRef[]; mode: CombineMode; output: SlotRef }
  | { kind: 'render'; sinkId: string; input: SlotRef };
```

### Slot Allocation

| Cardinality | Slot Type |
|-------------|-----------|
| `zero` | Inlined constant |
| `one` | ScalarSlot |
| `many(domain)` | FieldSlot |

### Runtime Erasure

No type information at runtime:
- No axis tags in runtime values
- No referent ids
- No domain objects (only loop bounds)
- Perspective/Branch erased (v0 defaults)

---

## Runtime (Core)

### Execution Model

Every tick:
1. Sample external inputs
2. Update time (tMs, phases)
3. Execute schedule (topological order)
4. Process events
5. Write to render sinks

Target: **5-10ms per frame** (60-200 fps)

### Storage Model

```typescript
interface RuntimeState {
  scalars: Float32Array;
  fields: Map<number, Float32Array>;
  events: Map<number, EventPayload[]>;
  state: Map<number, Float32Array>;
}
```

### State Management

State keyed by `(blockId, laneIndex)`:

| Cardinality | State Allocation |
|-------------|------------------|
| `one` | Single value |
| `many(domain)` | N(domain) values |
| `zero` | No state |

### State Migration

| Condition | Action |
|-----------|--------|
| Same StateId + same layout | Copy |
| Same StateId + compatible | Transform |
| Different/incompatible | Reset + diagnostic |

### Hot-Swap

- Old program renders until new is ready
- Atomic swap, no flicker
- State migrates based on StateId
- Caches invalidated

### Performance Constraints

- **No string lookups**: Use slot indices
- **No runtime type dispatch**: Compile-time slot selection
- **Dense arrays**: Not sparse maps
- **No Math.random()**: Seeded randomness only

---

## Quick Reference

### World → Axes Mapping (v2 Migration)

| Old World | Cardinality | Temporality |
|-----------|-------------|-------------|
| `static` | `zero` | `continuous` |
| `signal` | `one` | `continuous` |
| `field(domain)` | `many(domain)` | `continuous` |
| `event` | `one` or `many` | `discrete` |

### Deprecated Terms

| Deprecated | Use Instead |
|------------|-------------|
| `Block.type` | `Block.kind` |
| `DomainTag` | `PayloadType` |
| `World` | `Extent` |
| `structural` role | `derived` |
| State block | `UnitDelay` |
| `DomainN` | Primitive + Array |
| `GridDomain` | Primitive + Array + Grid Layout |

### Error Types

- **Type Error**: Axis mismatch, domain mismatch, invalid phase op
- **Graph Error**: Invalid cycle, missing input, invalid edge
- **Runtime Error**: Division by zero, NaN, buffer overflow

---

## When to Read Full Topics

| Task | Read |
|------|------|
| Implementing diagnostics | 07-diagnostics-system.md, 08-observation-system.md |
| Implementing UI | 09-debug-ui-spec.md, 14-modulation-table-ui.md, 15-graph-editor-ui.md |
| Disputed design questions | RESOLUTION-LOG.md |
| Deep type system questions | 01-type-system.md (full) |
| Continuity/anti-jank | 11-continuity-system.md |
| Event coordination | 12-event-hub.md, 13-event-diagnostics-integration.md |
