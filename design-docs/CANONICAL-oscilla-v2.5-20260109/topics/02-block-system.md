---
parent: ../INDEX.md
topic: block-system
order: 2
---

# Block System

> Blocks are the only compute units in Oscilla. Everything else derives from them.

**Related Topics**: [01-type-system](./01-type-system.md), [04-compilation](./04-compilation.md)
**Key Terms**: [Block](../GLOSSARY.md#block), [BlockRole](../GLOSSARY.md#blockrole), [DerivedBlockMeta](../GLOSSARY.md#derivedblockmeta)
**Relevant Invariants**: [I6](../INVARIANTS.md#i6-compiler-never-mutates-the-graph), [I26](../INVARIANTS.md#i26-every-input-has-a-source)

---

## Overview

In Oscilla, **everything is a block or wire at compile time**. Buses, default sources, and lenses are all derived blocks. This uniformity simplifies the architecture and eliminates special cases.

The block system has two orthogonal concerns:
1. **Block structure** - What a block is (id, kind, ports)
2. **Block role** - Why the block exists (user-created vs system-derived)

---

## Block Structure

```typescript
interface Block {
  id: BlockId;
  kind: string;        // "Add", "UnitDelay", etc. (NOT type)
  role: BlockRole;
  inputs: PortBinding[];
  outputs: PortBinding[];
}
```

### Important Naming

- Use `kind` property, **not** `type`
- `type` is reserved for the type system (SignalType)
- `kind` identifies which block definition this instance uses

### Port Structure

```typescript
interface PortBinding {
  id: PortId;
  dir: { kind: 'in' } | { kind: 'out' };
  type: SignalType;       // 5-axis coordinate
  combine: CombineMode;   // For inputs only (still required for outputs, but meaningless)
}
```

---

## Block Roles

Every block has an explicit role declaration. No guessing "is this system-generated?"

```typescript
type BlockRole =
  | { kind: "user" }
  | { kind: "derived"; meta: DerivedBlockMeta };
// Minimum variants; implementations may extend with additional kinds.
```

### The Core Distinction

| Role | Description | Created By | Lifecycle |
|------|-------------|------------|-----------|
| `user` | Explicit user action | User | Persisted as authored |
| `derived` | Satisfies architectural invariants | Editor | Can be regenerated |

**Both kinds exist in the patch data. Both are compiled. Both are real.**

The difference is **intent and lifecycle**, not visibility or reality.

---

## DerivedBlockMeta

Metadata for derived blocks specifying their purpose:

```typescript
type DerivedBlockMeta =
  | { kind: "defaultSource"; target: { kind: "port"; port: PortRef } }
  | { kind: "wireState";     target: { kind: "wire"; wire: WireId } }
  | { kind: "lens";          target: { kind: "node"; node: NodeRef } };
```

### Derived Block Types

| Meta Kind | Purpose | Target | Example |
|-----------|---------|--------|---------|
| `defaultSource` | Provides fallback value | Unconnected input port | `Constant(0.5)` for float input |
| `wireState` | State on a wire | Wire with feedback | `UnitDelay` for cycle |
| `lens` | Transform/adapter | Node reference | Type conversion block |

---

## Edge Roles

Edges also carry roles for the same reasons:

```typescript
type EdgeRole =
  | { kind: "user" }
  | { kind: "default"; meta: { defaultSourceBlockId: BlockId } }
  | { kind: "auto";    meta: { reason: "portMoved" | "rehydrate" | "migrate" } };
```

### Edge Role Semantics

| Role | Meaning | Persistence |
|------|---------|-------------|
| `user` | Explicit user connection | Persisted exactly as authored |
| `default` | From defaultSource block | Suppressed when real connection exists |
| `auto` | Editor maintenance | Can be deleted/regenerated |

---

## Block Role Invariants

### Invariant 1: Every Entity Has a Role

Every block and every edge carries an explicit role declaration. No `hidden?: boolean` flags.

### Invariant 2: Roles are Discriminated Unions

- Make it a **closed union** (no free-form keys)
- One discriminator name everywhere: **`kind`**
- Meta types are nested discriminated unions

### Invariant 3: No Compiler-Inserted Invisible Blocks

**Rejected**: Invisible blocks inserted by compiler that don't exist in patch data.

**Allowed**: Derived blocks that:
- Exist in `patch.blocks`
- Are visible in patch data model
- Are compiled through normal passes
- Have explicit, inspectable role metadata

### Invariant 4: The Compiler Ignores Roles

Roles exist for the **editor**, not the compiler.

The compiler sees: `(blocks, edges)`

It does NOT see: `(user blocks, derived blocks, user edges, default edges)`

**Roles inform:**
- UI rendering decisions
- Undo/redo behavior
- Persistence strategies
- Validation messages

**Roles do NOT inform:**
- Scheduling order
- Type checking
- IR generation
- Runtime execution

### Invariant 5: Role Invariants Are Validatable

```typescript
function validateRoleInvariants(patch: Patch): Diagnostic[] {
  const errors: Diagnostic[] = [];

  // Default edges must reference derived defaultSource blocks
  for (const edge of patch.edges) {
    if (edge.role.kind === "default") {
      const sourceBlock = patch.blocks.find(b => b.id === edge.role.meta.defaultSourceBlockId);
      if (!sourceBlock || sourceBlock.role.kind !== "derived") {
        errors.push({ message: "Default edge must reference derived block" });
      }
    }
  }

  return errors;
}
```

### Invariant 6: User Entities Are Canonical

For undo/redo, persistence, and diffing:
- User entities are the "source of truth"
- Derived entities can be regenerated from invariants
- Serialization may elide derived entities

---

## Stateful Primitives

The vast majority of blocks are **PURE and STATELESS**. Only these four primitives maintain state:

### MVP Stateful Primitives (4)

| Block | Definition | Behavior |
|-------|------------|----------|
| **UnitDelay** | Fundamental feedback gate | `y(t) = x(t-1)` |
| **Lag** | Smoothing filter | Linear/exponential smooth toward target |
| **Phasor** | Phase accumulator | 0..1 ramp with wrap semantics |
| **SampleAndHold** | Latch on trigger | `if trigger(t): y(t) = x(t) else y(t) = y(t-1)` |

### Post-MVP

- **Accumulator**: `y(t) = y(t-1) + x(t)` (unbounded, distinct from Phasor)

### Removed Concepts

- **"State" block** - This was just UnitDelay; removed to avoid confusion

### State Allocation by Cardinality

| Cardinality | State Allocation |
|-------------|------------------|
| `one` | One state cell (stride floats) |
| `many(instance)` | N(instance) × stride floats (one per lane) |
| `zero` | No runtime state |

State is keyed by stable `StateId` (not by positional slot index). See [05-runtime](./05-runtime.md) for the `StateMappingScalar` and `StateMappingField` types.

### Note on Lag

Lag is technically a composite (could be built from UnitDelay + arithmetic), but it's labeled as a primitive for practical purposes. The distinction is arbitrary for this system.

---

## Three-Stage Architecture: Primitive → Array → Layout

The system separates three orthogonal concerns for element creation and positioning:

### Stage 1: Primitives (Domain Classification)

**Primitive blocks** define a single element of a specific domain type:

```
[Circle]
  inputs: { radius: Signal<float> }
  outputs: { circle: Signal<circle> }

  Creates ONE circle
  Domain: circle
  Cardinality: one (Signal)
```

Primitives define WHAT kind of thing, not HOW MANY.

### Stage 2: Array (Cardinality Transform)

The **Array block** transforms one element into many elements:

```
[Array]
  inputs: { element: Signal<any-domain>, count: Signal<int> }
  outputs: { elements: Field<same-domain>, index: Field<int>, t: Field<float>, active: Field<bool> }

  Transforms Signal<T> → Field<T, instance>
  Creates instance with pool-based allocation
  Cardinality: one → many
```

Array is the ONLY place where instances are created. It's the cardinality transform.

### Stage 3: Layout (Spatial Arrangement)

**Layout blocks** operate on existing fields and output positions:

```
[Grid Layout]
  inputs: { elements: Field<any>, rows: Signal<int>, cols: Signal<int> }
  outputs: { position: Field<vec2, same-instance> }

  Operates on existing field (instance)
  Computes positions based on layout algorithm
  Position is just another field (not special-cased)
```

Layout assigns WHERE elements are, separate from WHAT they are and HOW MANY exist.

### Data Flow Example

```
[Circle] ──Signal<circle>──▶ [Array] ──Field<circle, inst>──▶ [Grid] ──position──▶ [Render]
  r=0.02                      count=100                        10×10
                              maxCount=200
```

1. **Circle**: ONE circle primitive
2. **Array**: 100 instances (from pool of 200)
3. **Grid**: Positions for those 100 circles
4. **Render**: Draw them

### Why This Architecture

**Composability:**
```
                    ┌──▶ [Grid] ──▶ [Render A]
[Circle] ──▶ [Array]─┼──▶ [Spiral] ──▶ [Render B]
                    └──▶ [Random] ──▶ [Render C]

Same 100 circles, three different layouts, three views.
```

**Type Safety:**
- `Signal<circle>` — cardinality: one
- `Field<circle, inst>` — cardinality: many (over instance inst)

Operations know which they accept. Mismatch = compile error.

**Performance:**
- Pool allocated once (maxCount elements)
- Active mask toggles visibility (cheap)
- No reallocation when count changes

---

## Primitive Blocks (MVP)

Primitive blocks create single elements of specific domain types:

| Block | Domain Type | Inputs | Output |
|-------|-------------|--------|--------|
| **Circle** | `circle` | radius, center | `Signal<circle>` |
| **Rectangle** | `rectangle` | width, height | `Signal<rectangle>` |
| **Polygon** | `polygon` | vertices | `Signal<polygon>` |

### Array Block

The Array block is the cardinality transform:

```typescript
registerBlock({
  type: 'Array',
  category: 'instance',
  inputs: [
    { id: 'element', label: 'Element', type: signalType('any-domain') },
    { id: 'count', label: 'Count', type: signalType('int') },
  ],
  outputs: [
    { id: 'elements', label: 'Elements', type: signalTypeField('same-as:element', 'self') },
    { id: 'index', label: 'Index', type: signalTypeField('int', 'self') },
    { id: 't', label: 't [0,1]', type: signalTypeField('float', 'self') },
    { id: 'active', label: 'Active', type: signalTypeField('bool', 'self') },
  ],
  params: {
    maxCount: 200,  // Pool size
  },
});
```

### Layout Blocks (MVP)

Layout blocks compute positions for field elements:

| Block | Algorithm | Key Inputs |
|-------|-----------|------------|
| **Grid Layout** | Row-major grid | rows, cols |
| **Spiral Layout** | Archimedean spiral | turns, spacing |
| **Random Scatter** | Random positions | bounds, seed |
| **Along Path** | Path-following | path, spacing |

---

## Basic Blocks (MVP)

The minimal block set for a working system:

| # | Block | Category | Description |
|---|-------|----------|-------------|
| 1 | **TimeRoot** | Time | Time source (system-managed) |
| 2 | **Circle** | Primitive | Creates single circle (`Signal<circle>`) |
| 3 | **Array** | Instance | Cardinality transform (Signal → Field) |
| 4 | **Grid Layout** | Layout | Grid position assignment |
| 5 | **Hash** | Math | Deterministic hash |
| 6 | **Noise** | Math | Procedural noise |
| 7 | **Add** | Math | Addition |
| 8 | **Mul** | Math | Multiplication |
| 9 | **Length** | Math | Vector length |
| 10 | **Normalize** | Math | Vector normalize |
| 11 | **UnitDelay** | State | One-frame delay |
| 12 | **HSV->RGB** | Color | Color conversion |
| 13 | **RenderInstances2D** | Render | Render sink |

### Block Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| **Primitive** | Create single elements (Signal) | Circle, Rectangle, Polygon |
| **Instance** | Cardinality transforms | Array |
| **Layout** | Spatial arrangement | Grid, Spiral, Random, AlongPath |
| **Math** | Arithmetic operations | Add, Mul, Hash, Noise |
| **State** | Stateful primitives | UnitDelay, Lag, Phasor |
| **Color** | Color operations | HSV->RGB |
| **Render** | Output sinks | RenderInstances2D |
| **Time** | Time sources | TimeRoot |

---

## Cardinality-Generic Blocks

A **cardinality-generic block** is a block whose semantic function is defined per-lane and is valid for both:
- **Signal** (cardinality: one) — a single lane
- **Field** (cardinality: many(instance)) — N lanes aligned to a specific InstanceRef

Cardinality-generic blocks are lane-local and do not perform reduction or aggregation across lanes.

### Formal Contract

A block B is cardinality-generic iff:

1. **Lane-locality**: For every output lane i, the value depends only on input lane i values, any Signal (broadcast) inputs, and per-lane state — never on lane j ≠ i.

2. **Cardinality preservation**: Output cardinality equals the primary data input cardinality. (Blocks that transform cardinality — Signal → Field or Field → Signal — are NOT cardinality-generic.)

3. **Instance alignment preservation**: If cardinality is many(instance), all many inputs and outputs carry the same InstanceRef after type resolution. Mismatch is a type error.

4. **Deterministic per-lane execution**: Given identical inputs, state, and time, the block produces identical outputs per lane independent of physical ordering or batching.

### Which Blocks Are Cardinality-Generic

| Category | Blocks | Notes |
|----------|--------|-------|
| **Math** | Add, Mul, Hash, Noise, Length, Normalize | Pure, stateless, lane-local |
| **State** | UnitDelay, Lag, Phasor, SampleAndHold | Stateful but lane-local (per-lane state) |
| **Color** | HSV→RGB | Pure conversion |

### Which Blocks Are NOT Cardinality-Generic

| Category | Blocks | Reason |
|----------|--------|--------|
| **Instance** | Array | Cardinality transform (Signal → Field) |
| **Reduce** | (future) Min, Max, Sum, Avg over field | Field → Signal aggregation |
| **Layout** | Grid, Spiral, Random | Position computation (may be lane-coupled) |
| **Render** | RenderInstances2D | Sink (consumes fields) |
| **Time** | TimeRoot | Signal-only source |

### Compilation: No Runtime Generics

The compiler emits fully specialized code — each cardinality-generic block instance becomes either:
- A **scalar evaluation step** (one lane), or
- A **field evaluation step** (N lanes in a tight loop)

These are distinct step kinds in the IR. The runtime never branches on cardinality.

### Mixing Signal and Field Inputs

Cardinality-generic blocks may accept both Signal and Field inputs:
- Signal inputs are **broadcast** (constant across all lanes within a frame)
- The compiler represents this as an explicit broadcast or zip-with-signal form in the IR
- No implicit broadcasting at runtime

### Stateful Cardinality-Generic Blocks

For stateful blocks operating at cardinality many(instance):
- State storage is a dense buffer of length `S * N` where S is the state payload stride and N is the instance count
- Each lane has independent state at index i
- State is keyed by stable StateId (survives recompilation)
- Migration follows I3 rules: copy if compatible, reset + diagnostic if not

### What Is NOT Allowed

A block must NOT be declared cardinality-generic if it:
1. **Crosses lanes**: output[i] depends on input[j≠i] (blur, boids, sorting, kNN)
2. **Transforms cardinality**: maps Signal → Field, Field → Signal, or relabels instances
3. **Mutates instance set**: creates, destroys, reorders, or filters lanes

---

## Payload-Generic Blocks

A **payload-generic block** is a block whose semantics are defined over a closed set of payload types such that the compiler selects the correct concrete implementation per payload at compile time, with no runtime dispatch on payload.

Payload-generic is **orthogonal** to cardinality-generic: a block may be one, the other, both, or neither.

### Formal Contract

A block B is payload-generic iff:

1. **Closed admissible payload set**: For each port, B declares an explicit set `AllowedPayloads(port)`. No open extension.

2. **Total per-payload specialization**: For every payload P in AllowedPayloads that can appear after unification, there exists a concrete implementation path for B under P.

3. **No implicit coercions**: Payload changes require explicit cast blocks (e.g., `FloatToVec2`, `PackVec3`, `ToColor`). Payload-generic blocks must not silently reinterpret or coerce representations.

4. **Deterministic resolution**: Given resolved payload types, the compiler's choice of specialization is deterministic and emits fully specialized IR.

### Which Blocks Are Payload-Generic

| Category | Blocks | Allowed Payloads | Notes |
|----------|--------|------------------|-------|
| **Math** | Add, Mul | `{float, vec2, vec3}` | Componentwise |
| **Math** | Length | `{vec2, vec3} → float` | Reduction-like |
| **Math** | Normalize | `{vec2, vec3}` | Homogeneous unary |
| **Color** | HSV→RGB | `{color}` | Single payload (not generic) |
| **State** | UnitDelay, Lag | Payload-generic over `{float, vec2, vec3, color}` | Per-lane state sized by stride |

### Which Blocks Are NOT Payload-Generic

| Category | Blocks | Reason |
|----------|--------|--------|
| **Conversion** | FloatToVec2, PackVec3, ToColor | Explicit cast (fixed input/output) |
| **Instance** | Array | Cardinality, not payload |
| **Time** | TimeRoot | Fixed outputs |
| **Render** | RenderInstances2D | Fixed port types |

### Runtime Semantics Categories

Payload-generic blocks define semantics as either:

- **Componentwise**: Apply the same scalar operator per component
  - Example: `Add(vec3, vec3)` = `vec3(x1+x2, y1+y2, z1+z2)`
- **Type-specific**: Defined explicitly per payload
  - Example: `Mul(color, float)` might be brightness scale; `Mul(color, color)` might be disallowed

### Validity Shapes (Signature Families)

A payload-generic block must match one of these signature forms:

1. **Homogeneous unary**: `T → T` for T ∈ S
2. **Homogeneous binary**: `T × T → T` for T ∈ S
3. **Mixed binary (scalar + vector)**: `T × float → T` for T ∈ {vec2, vec3, color}
4. **Predicate**: `T × T → bool` for T ∈ S
5. **Reduction-like**: `T → float` (must be explicit, not generic by default)

If a block does not match one of these forms, it is not payload-generic; it is a family of explicit blocks.

### What Is NOT Allowed

A block must NOT be declared payload-generic if it:

1. **Implicit representation reinterpretation**: Treating vec3 as three unrelated lanes, treating color as vec4 without specifying color semantics, treating int as float via implicit cast.
2. **Semantic ambiguity across payloads**: If the operation means something different for different payloads without explicit declaration (e.g., "Normalize" for float is ambiguous).
3. **Partial coverage**: "Works for float and vec2, but vec3 later" is forbidden. Either include now with implementation or exclude now.

### Compilation: Fully Specialized IR

The compiler emits fully specialized IR per payload — no runtime dispatch:

- `OpCode.Add_f32` / `Add_vec2` / `Add_vec3` (or one opcode with known stride), selected at compile time
- Stride determined by payload: `float=1`, `vec2=2`, `vec3=3`, `color=4`
- Runtime kernels operate on dense arrays with known stride
- No per-lane or per-sample type checks, no boxing

### Diagnostics

Compiler must produce explicit errors for payload failures:

- **PAYLOAD_NOT_ALLOWED**: Payload resolved to a value not supported by block kind at a port
- **PAYLOAD_COMBINATION_NOT_ALLOWED**: For multi-input blocks, the pair/tuple is not in the allowed combination table
- **IMPLICIT_CAST_DISALLOWED**: Any attempt to coerce payload without an explicit cast block

---

## Combine System

Multi-writer inputs use combine modes to aggregate values.

### CombineMode Types

```typescript
type CombineMode =
  | { kind: 'numeric'; op: 'sum' | 'avg' | 'min' | 'max' | 'mul' }
  | { kind: 'any'; op: 'last' | 'first' | 'layer' }
  | { kind: 'bool'; op: 'or' | 'and' };
```

### Combine by PayloadType

| PayloadType | Available Modes |
|-------------|-----------------|
| Numeric (float, int, vec2) | sum, avg, min, max, mul |
| Any | last, first, layer |
| bool | or, and |

### Important Rules

- **Built-in only** - No custom combine mode registry
- **Every input has a CombineMode** - Required, not optional
- **Deterministic combination** - Writer ordering is stable and explicit

---

## Default Sources

Every input always has exactly one source due to DefaultSource blocks.

### Default Source Invariant

- DefaultSource block is ALWAYS connected during GraphNormalization
- Satisfies: every input has exactly one aggregated value per frame
- Combine mode decides how explicit writers interact with the default

### Default Values by PayloadType

Use **useful defaults**, not zeros. Prefer rails for animation:

| PayloadType | Default |
|-------------|---------|
| `float` | `phaseA` rail or `Constant(0.5)` |
| `int` | `Constant(1)` |
| `vec2` | `Constant([0.5, 0.5])` |
| `color` | `HueRainbow(phaseA)` or `Constant(white)` |
| `float(phase01)` | `phaseA` rail |
| `bool` | `Constant(true)` |
| `unit` | `phaseA` rail or `Constant(0.5)` |

---

## Rails

Immutable system-provided buses. Cannot be deleted or renamed.

### MVP Rails

| Rail | Output Type | Description |
|------|-------------|-------------|
| `time` | `one + continuous + int` | `tMs` value |
| `phaseA` | `one + continuous + float(phase01)` | Primary phase |
| `phaseB` | `one + continuous + float(phase01)` | Secondary phase |
| `pulse` | `one + discrete + unit` | Frame tick trigger |
| `palette` | `one + continuous + color` | Chromatic reference frame |

### Rails Are Blocks

Rails can have inputs overridden and be driven by feedback like any other block.

The `palette` rail is the chromatic reference frame - a time-indexed color signal that provides the default color atmosphere for a patch. It exists whether or not the patch references it.

---

## Transforms (Lenses)

Transforms are blocks. Lenses/adapters normalize into explicit derived blocks.

### Uniform Transform Semantics

Transforms are table-driven and type-driven:
- Scalar transforms → scalars
- Signal transforms → signal plans
- Field transforms → field expr nodes
- Reductions (field→signal) are explicit and diagnosable

### Lens as Derived Block

```typescript
// A lens targeting a node
const lens: Block = {
  id: 'lens-123',
  kind: 'TypeAdapter',
  role: {
    kind: 'derived',
    meta: {
      kind: 'lens',
      target: { kind: 'node', node: { kind: 'node', id: 'target-node' } }
    }
  },
  inputs: [...],
  outputs: [...]
};
```

---

## Cycle Validation

### Invariant: Every Cycle Must Cross a Stateful Boundary

Detection: Tarjan's algorithm for SCC (strongly connected components).

Each SCC must contain at least one stateful primitive (UnitDelay, Lag, Phasor, SampleAndHold).

### Error on Invalid Cycle

If a cycle has no stateful primitive, emit error showing:
- The cycle path
- Which blocks are involved
- Suggestion: "Add UnitDelay to break the cycle"

---

## UI Filtering

The UI may choose to filter derived blocks from certain views:

```typescript
// User-visible blocks only
const userBlocks = patch.blocks.filter(b => b.role.kind === "user");

// With UI preference
const visibleBlocks = patch.blocks.filter(b =>
  b.role.kind === "user" || settings.showDerivedBlocks
);
```

This is a **presentation choice**, not an architectural one.

---

## Deprecated Terminology

| Deprecated | Use Instead | Notes |
|------------|-------------|-------|
| `Block.type` | `Block.kind` | Reserved for type system |
| `structural` (role) | `derived` | Better describes system-generated |
| Hidden block | Derived block | "Hidden" implies invisible to compiler |
| Phantom block | Derived block | Same issue |
| Implicit block | Derived block with specific meta.kind | Be specific |
| State block | UnitDelay | Proper name |
| `DomainN` | Primitive + Array | Conflates domain and instance |
| `GridDomain` | Primitive + Array + Grid Layout | Conflates domain, instance, and layout |
| `DomainDef` | `InstanceDecl` | Old conflated type |
| `DomainId` (for instance) | `InstanceId` | Domain is classification, instance is collection |

---

## See Also

- [01-type-system](./01-type-system.md) - SignalType for ports
- [03-time-system](./03-time-system.md) - TimeRoot and rails
- [04-compilation](./04-compilation.md) - How blocks compile
- [Glossary: Block](../GLOSSARY.md#block)
- [Glossary: BlockRole](../GLOSSARY.md#blockrole)
- [Invariant: I6](../INVARIANTS.md#i6-compiler-never-mutates-the-graph)
