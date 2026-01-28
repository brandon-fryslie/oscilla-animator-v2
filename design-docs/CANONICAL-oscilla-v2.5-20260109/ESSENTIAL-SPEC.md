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

**PayloadType**: Base data type - `'float' | 'int' | 'vec2' | 'vec3' | 'color' | 'bool' | 'unit' | 'shape2d'`

**Stride**: Floats per element. `float/int/bool/unit=1`, `vec2=2`, `vec3=3`, `color=4`, `shape2d=8` (u32 words, handle type)

**Phase**: Represented as `float` with `unit: 'phase01'`. Not a distinct PayloadType.

**Extent**: 5-axis coordinate (cardinality, temporality, binding, perspective, branch)

**CanonicalType**: Complete type = `{ payload: PayloadType; extent: Extent }`

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

**BlockRole**: `{ kind: 'user' }` | `{ kind: 'derived'; meta: DerivedBlockMeta }` (minimum variants; implementations may extend)

**DerivedBlockMeta**: `defaultSource` | `wireState` | `lens`

**EdgeRole**: `user` | `default` | `auto`

**Stateful Primitives (4)**: UnitDelay, Lag, Phasor, SampleAndHold

**Cardinality-Generic Block**: Per-lane semantics, works for both Signal and Field. Lane-local, cardinality-preserving.

**Payload-Generic Block**: Semantics defined over closed set of payload types. Fully specialized at compile time.

**Lane**: Individual element within a Field (positional offset, not semantic identity).

**StateId**: Stable identifier for a state array (not individual lanes). Format: `blockId + primitive_kind`.

### Architecture

**Primitive Block**: Creates ONE element (Signal output). Circle, Rectangle, Polygon.

**Array Block**: Cardinality transform. Signal → Field. Creates Instance.

**Layout Block**: Computes positions for field elements. Grid, Spiral, Random.

### Compilation

**NormalizedGraph**: Fully explicit graph the compiler consumes

**CompiledProgramIR**: Output of compilation — expression DAGs (computation shape) + schedule (execution ordering) + slot metadata (storage layout)

**Expression DAG**: Hash-consable tree of signal/field/event nodes. Referentially transparent, memoized per frame.

**Schedule**: Execution ordering as data — names which expr roots to evaluate/materialize, where to store results (slots), and phase ordering constraints

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
| `phaseA` | `one + continuous + float(phase01)` | Primary phase |
| `phaseB` | `one + continuous + float(phase01)` | Secondary phase |
| `pulse` | `one + discrete + unit` | Frame tick |
| `palette` | `one + continuous + color` | Chromatic reference |

---

## Type System (Core)

### PayloadType Semantics

| Type | Stride | Range/Notes |
|------|--------|-------------|
| `float` | 1 | IEEE 754 |
| `int` | 1 | Signed 32-bit |
| `vec2` | 2 | Two floats |
| `vec3` | 3 | Three floats |
| `color` | 4 | RGBA, 0..1 each |
| `float(phase01)` | 1 | float with unit:phase01, 0..1 with wrap semantics |
| `bool` | 1 | true/false |
| `unit` | 1 | 0..1 clamped |
| `shape2d` | 8 | Packed u32 words (handle — no arithmetic) |

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

### Unit System

Units refine payload types. A `float` may carry a unit that constrains valid operations.

| Unit | Meaning | Examples |
|------|---------|----------|
| `scalar` | Dimensionless | multipliers, ratios |
| `phase01` | 0..1 with wrap semantics | animation phase |
| `deg` | Degrees | rotation angles |
| `rad` | Radians | rotation angles |
| `px` | Pixels | screen positions |

**Unit checking is strict**: edges require exact unit match. No implicit conversion.

**Generic blocks** have type variables for payload (`PayloadVar`) and/or unit (`UnitVar`) that must be resolved by constraint solving. Example: `Const.out` is generic in both payload and unit — resolved by what it connects to, never defaulted to `float<scalar>`.

### Phase Arithmetic

Phase is `float` with `unit: 'phase01'`. Arithmetic rules:

| Operation | Result |
|-----------|--------|
| `float(phase01) + float` | `float(phase01)` |
| `float(phase01) * float` | `float(phase01)` |
| `float(phase01) + float(phase01)` | TYPE ERROR |

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
  type: CanonicalType;
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

### Payload-Generic Blocks

Blocks whose semantics are defined over a **closed set of payload types**, fully specialized at compile time:

**Contract**: (1) Closed admissible payload set, (2) Total per-payload specialization, (3) No implicit coercions, (4) Deterministic resolution.

**Are generic**: Add/Mul (`{float, vec2, vec3}`), Normalize (`{vec2, vec3}`), UnitDelay/Lag (over `{float, vec2, vec3, color}`)
**Are NOT generic**: Cast blocks (fixed types), TimeRoot, Render, Array

**Validity shapes**: Homogeneous unary (`T→T`), Homogeneous binary (`T×T→T`), Mixed binary (`T×float→T`), Predicate (`T×T→bool`), Reduction-like (`T→float`)

Compiler emits fully specialized IR (e.g., `Add_f32`, `Add_vec2`, `Add_vec3`) — no runtime payload dispatch.

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
| `float(phase01)` | `phaseA` rail |
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

Type resolution is constraint-based unification, not local inference.

**Ordering requirement**: Run type resolution only after normalization has produced a fully explicit graph (all default sources materialized, all adapters explicit). Attempting to infer types before explicit structure exists causes directionality bugs.

**Constraint sources**:
- Monomorphic port definitions (e.g., `Camera.tiltDeg` is `float<deg>`)
- User-specified parameters (e.g., `Const` explicitly set to `float<phase01>`)
- Edge equality constraints: for every edge, `Type(fromPort) == Type(toPort)` (payload AND unit must match)
- Adapter blocks are the only place unit conversion is allowed

**Resolution phases**:
1. **Initialization**: Seed known types from monomorphic definitions and explicit user choices
2. **Propagation**: For each edge constraint, unify payload and unit variables
3. **Verification**: Any unresolved variable after fixed-point → compile error

**Critical invariant**: Unresolved generic types are hard errors, never silent defaults.

```typescript
// Resolved types are cached by port binding
type PortBindingKey = `${BlockId}:${PortName}:${'in' | 'out'}`;
resolvedPortTypes: Map<PortBindingKey, CanonicalType>;

// getPortType() behavior:
// 1. If resolved override exists → return it
// 2. Else if monomorphic definition → return definition type
// 3. Else if generic and unresolved → UnresolvedType ERROR (not scalar fallback)
```

**Diagnostic on unresolved type**:
- Identify: block, port, why unconstrained
- Suggest fixes: connect to typed consumer, set unit explicitly, or insert adapter

### CompiledProgramIR Structure

The compilation output has two layers: expression DAGs that define computation shape, and a schedule that defines execution ordering.

```typescript
interface CompiledProgramIR {
  // Layer 1: Expression DAGs (computation shape)
  signalExprs: ExprTable<SigExpr>;
  fieldExprs: ExprTable<FieldExpr>;
  eventExprs: ExprTable<EventExpr>;

  // Layer 2: Execution schedule (ordering + materialization)
  schedule: ScheduleIR;

  // Storage layout
  slotMeta: SlotMeta[];

  // Ancillary
  fieldSlotRegistry: FieldSlotRegistry;
  debugIndex: DebugIndex;
  renderGlobals: RenderGlobals;
}
```

### Expression DAGs

Computation is represented as hash-consable DAG nodes referenced by typed IDs (`SigExprId`, `FieldExprId`, `EventExprId`). Expression evaluation is referentially transparent and memoized per frame.

Signal expressions (`SigExpr`):
- `const`, `slot`, `time`, `external` — leaf nodes
- `map`, `zip` — combinators
- `stateRead`, `shapeRef`, `eventRead` — state/context access

Field expressions (`FieldExpr`):
- `const`, `intrinsic`, `broadcast` — leaf nodes
- `map`, `zip`, `zipSig`, `array` — combinators
- `stateRead` — per-lane state access

Combine operations are expression nodes emitted at compile time (validation + construction), not runtime schedule steps.

### Execution Schedule

The schedule defines externally visible ordering boundaries. Expression evaluation within a step is demand-driven and cached.

```typescript
interface ScheduleIR {
  steps: Step[];
  instances: InstanceDecl[];
  stateSlotCount: number;
  stateMappings: StateMapping[];
}

type Step =
  | { kind: 'evalSig'; expr: SigExprId; target: ValueSlot }
  | { kind: 'materialize'; field: FieldExprId; instanceId: number; target: ValueSlot }
  | { kind: 'render'; instanceId: number; slots: RenderSlots }
  | { kind: 'stateWrite'; source: ValueSlot; stateSlot: number }
  | { kind: 'fieldStateWrite'; source: ValueSlot; stateSlot: number; instanceId: number }
  | { kind: 'continuityMapBuild'; instanceId: number; ... }
  | { kind: 'continuityApply'; instanceId: number; ... }
  | { kind: 'evalEvent'; expr: EventExprId; target: ValueSlot };
```

Phase ordering:
1. Update time inputs (rails, tMs)
2. Evaluate continuous scalars (`evalSig`)
3. Build continuity mappings (`continuityMapBuild`)
4. Materialize continuous fields (`materialize`)
5. Apply continuity (`continuityApply`)
6. Execute discrete events (`evalEvent`)
7. Render sinks (`render`)
8. State writes (`stateWrite`, `fieldStateWrite`)

### Where Semantics Live

| Concern | Authority |
|---------|-----------|
| Shape of computation | Expression DAGs |
| When it happens | Schedule step ordering |
| Where values live | SlotMeta (typed storage + offsets/strides) |
| Why fields are special | Materializer + demand-driven behavior |
| What's externally ordered | Events, state writes, continuity, render |

### Slot Allocation

| Cardinality | Slot Type | Buffer Size |
|-------------|-----------|-------------|
| `zero` | Inlined constant | 0 |
| `one` | ScalarSlot | stride floats |
| `many(instance)` | FieldSlot | laneCount × stride floats |

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
3. Execute schedule steps in phase order (see Compilation → Execution Schedule)

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

State keyed by stable `StateId` (identifies state array, not individual lanes):

| Cardinality | State Allocation | Mapping Type |
|-------------|------------------|--------------|
| `one` | `stride` floats | `StateMappingScalar { stateId, slotIndex, stride, initial }` |
| `many(instance)` | `laneCount × stride` floats | `StateMappingField { stateId, instanceId, slotStart, laneCount, stride, initial }` |
| `zero` | No state | None |

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

### Three-Layer Execution Architecture

| Layer | I/O | Semantics | Examples |
|-------|-----|-----------|---------|
| **Opcode** | `number[] → number` | Pure generic math, no domain knowledge | sin, cos, add, mul, lerp |
| **Signal Kernel** | `scalar → scalar` | Domain-specific, fixed arity | oscSin, easeInQuad, noise1 |
| **Field Kernel** | field buffers lane-wise | Vec2/color/field ops | circleLayout, hsvToRgb, jitter2d |

**Materializer** orchestrates (not a layer): IR → buffers → dispatch → sinks.

---

## Coordinate Spaces (Topic 16)

### Three-Space Model

| Space | Role | Range |
|-------|------|-------|
| **Local (L)** | Geometry/control points | Centered (0,0), O(1) |
| **World (W)** | Instance placement | [0..1] normalized |
| **Viewport (V)** | Backend output | Pixels/viewBox |

### Transform Chain

```
pW = positionW + R(θ) · (scale × pL)
pV = pW × viewportDimensions
```

### `scale` Semantics

- `scale`: Isotropic local→world factor (`Signal<float>` or `Field<float>`)
- `scale2`: Optional anisotropic (`Signal<vec2>` or `Field<vec2>`)
- Backend: `scalePx = scale × min(W, H)`
- Combined: `S_effective = (scale × scale2.x, scale × scale2.y)`

### Enforcement

Convention-based: `controlPoints` = local, `position` = world. Type-level axis deferred.

---

## Renderer (Core)

### RenderFrameIR (Draw-Op-Centric)

```typescript
interface RenderFrameIR { passes: RenderPassIR[]; }
type RenderPassIR = { kind: 'drawPathInstances'; op: DrawPathInstancesOp };

interface DrawPathInstancesOp {
  geometry: PathGeometryTemplate;  // Local-space points + topology
  instances: PathInstanceSet;       // World-space transforms (SoA)
  style: PathStyle;                 // Fill/stroke/opacity
}
```

Each op is inherently a batch (shared geometry+style = one draw call).

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
