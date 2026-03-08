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
- `type` is reserved for the type system (CanonicalType)
- `kind` identifies which block definition this instance uses

### Port Structure

```typescript
interface PortBinding {
  id: PortId;
  dir: { kind: 'in' } | { kind: 'out' };
  type: CanonicalType;       // 5-axis coordinate
  combine: CombineMode;   // For inputs
}
```

---

## Block Roles

Every block has an explicit role declaration.

```typescript
type BlockRole =
  | { kind: "user" }
  | { kind: "derived"; meta: DerivedBlockMeta };
```

---

## Three-Stage Architecture: Primitive → Array → Layout

The system separates three orthogonal concerns for element creation and positioning:

### Stage 1: Primitives (Local Space Geometry)

**Primitive blocks** define geometry in **Local Space**. Every shape is authored relative to its own origin (0,0) with magnitude O(1).

- **Bounds over Scaling**: Shapes accept explicit `bounds` (width, height) in Local space to preserve SDF distance metrics.
- **Isotropic Transform**: Matrices apply strictly uniform `scale` to prevent visual distortion.

### Stage 2: Array (Lane Expansion)

The **Array block** expands a single value into many elements, creating an **Instance** in the simulation.
- **Behavior**: `one` → `many(instance)`
- **Expansion**: The input value is broadcast across all lanes of the new instance.

### Stage 3: Layout (World Space Placement)

**Layout blocks** produce absolute positions in **World Space** ($\mathbb{R}^3$).
- **Unbounded Cartesian**: Coordinates are unbounded ℝ³. Layout kernels typically target the $[0, 1]$ visible region by default, but values outside this range are mathematically valid.
- **SoA Outputs**: Positions are produced as parallel f32 channels in the Arena.

---

## Render Sink Block (MVP)

The primary render sink block interfaces with the **Draw Prep** pipeline:

```typescript
interface RenderSinkBlock {
  kind: 'RenderSink';
  inputs: {
    positions: Slot<vec3>;     // World-space positions
    colors: Slot<color>;       // Per-instance color
    scale: Slot<float>;        // Isotropic scale
    rotation?: Slot<float>;    // Per-instance rotation
    shape: Slot<shape2d>;     // Handle to ShapeBank topology
  };
}
```

---

## Basic Blocks (MVP)

The minimal block set for a working instrument:

| # | Block | Category | Description |
|---|-------|----------|-------------|
| 1 | **TimeRoot** | Time | CPU-marshalled simulation heartbeat. |
| 2 | **Circle** | Primitive | Local-space circle geometry. |
| 3 | **Array** | Instance | Cardinality transform (Scalar → Array). |
| 4 | **Grid Layout** | Layout | World-space position assignment. |
| 5 | **Hash** | Math | Deterministic GPU-native hash. |
| 6 | **Noise** | Math | Procedural WGSL noise kernels. |
| 7 | **Add** | Math | Component-wise SoA addition. |
| 8 | **Mul** | Math | Component-wise SoA multiplication. |
| 9 | **Length** | Math | Vector length. |
| 10 | **Normalize** | Math | Vector normalization with NaN guard. |
| 11 | **UnitDelay** | State | Ping-pong state cell. |
| 12 | **HSV->RGB** | Color | Pure color space conversion. |
| 13 | **RenderSink** | Render | Unified GPU-driven render sink. |

### Block Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| **Primitive** | Define local geometry | Circle, Rectangle, Polygon |
| **Instance** | Cardinality expansion | Array |
| **Layout** | World placement | Grid, Spiral, Random |
| **Math** | Arithmetic operations | Add, Mul, Hash, Noise |
| **State** | Stateful primitives | UnitDelay, Lag, Phasor |
| **Color** | Color operations | HSV->RGB |
| **Render** | Output sinks | RenderSink |
| **Time** | Time sources | TimeRoot |

---

## Lane-Local Blocks

A **lane-local block** is a block whose semantic function is defined per-lane and is valid for both:
- **Scalar** (cardinality: one) — a single lane.
- **Array** (cardinality: many(instance)) — N lanes aligned to a specific InstanceRef.

Lane-local blocks do not perform reduction or aggregation across lanes.
Cardinality behavior is declared per-port in CT/ICT via cardinality var policy (`relation`, `acceptance`, `instanceBinding`), not by block-level mode names.

### Formal Contract

A block B is lane-local iff:

1. **Lane-locality**: For every output lane i, the value depends only on input lane i values, any scalar (broadcast) inputs, and per-lane state — never on lane j ≠ i.

2. **Cardinality preservation**: Output cardinality equals the primary data input cardinality. (Blocks that expand cardinality — `one` → `many` — are NOT lane-local.)

3. **Instance alignment preservation**: If cardinality is many(instance), all many inputs and outputs carry the same InstanceRef after type resolution. Mismatch is a type error.

4. **Deterministic per-lane execution**: Given identical inputs, state, and time, the block produces identical outputs per lane independent of physical ordering or batching.

### Which Blocks Are Lane-Local

| Category | Blocks | Notes |
|----------|--------|-------|
| **Math** | Add, Mul, Hash, Noise, Length, Normalize | Pure, stateless, lane-local |
| **State** | UnitDelay, Lag, Phasor, SampleAndHold | Stateful but lane-local (per-lane state) |
| **Color** | HSV→RGB | Pure conversion |

### Which Blocks Are NOT Lane-Local

| Category | Blocks | Reason |
|----------|--------|--------|
| **Instance** | Array | Cardinality expansion (`one` → `many`) |
| **Reduce** | (future) Min, Max, Sum, Avg over array | `many` → `one` aggregation |
| **Layout** | Grid, Spiral, Random | Position computation (may be lane-coupled) |
| **Render** | RenderSink | Sink (consumes arrays) |
| **Time** | TimeRoot | Scalar-only source |

### Compilation: No Runtime Generics

The compiler emits fully specialized code — each lane-local block instance becomes either:
- A **scalar evaluation step** (one lane), or
- An **array evaluation step** (N lanes in a parallel dispatch).

These are distinct step kinds in the IR. The runtime never branches on cardinality.

### Mixing Scalar and Array Inputs

Lane-local blocks may accept both Scalar and Array inputs:
- Scalar inputs are **broadcast** (constant across all lanes within a frame).
- The compiler represents this as an explicit broadcast or zip-with-scalar form in the Naga IR.
- No implicit broadcasting at runtime.

### Stateful Lane-Local Blocks

For stateful blocks operating at cardinality many(instance):
- State storage is a dense buffer of length `S * N` where S is the state payload stride and N is the instance count.
- Each lane has independent state at index i.
- State is keyed by stable StateId (survives recompilation).
- Migration follows I3 rules: copy if compatible, reset + diagnostic if not.

### What Is NOT Allowed

A block must NOT be declared lane-local if it:
1. **Crosses lanes**: output[i] depends on input[j≠i] (blur, boids, sorting, kNN)
2. **Expands cardinality**: maps `one` → `many`, or relabels instances
3. **Mutates instance set**: creates, destroys, reorders, or filters lanes

---

## Payload-Specialized Blocks

A **payload-specialized block** is a block whose semantics are defined over a closed set of payload types such that the compiler selects the correct concrete implementation per payload at compile time, with no runtime dispatch on payload.

Payload-specialization is **orthogonal** to lane-locality: a block may be one, the other, both, or neither.

### Formal Contract

A block B is payload-specialized iff:

1. **Closed admissible payload set**: For each port, B declares an explicit set `AllowedPayloads(port)`. No open extension.

2. **Total per-payload specialization**: For every payload P in AllowedPayloads that can appear after unification, there exists a concrete implementation path for B under P.

3. **No implicit coercions**: Payload changes require explicit cast blocks (e.g., `FloatToVec2`, `PackVec3`, `ToColor`).

4. **Deterministic resolution**: Given resolved payload types, the compiler's choice of specialization is deterministic and emits fully specialized Naga IR.

### Which Blocks Are Payload-Specialized

| Category | Blocks | Allowed Payloads | Notes |
|----------|--------|------------------|-------|
| **Math** | Add, Mul | `{float, vec2, vec3}` | Componentwise |
| **Math** | Length | `{vec2, vec3} → float` | Reduction-like |
| **Math** | Normalize | `{vec2, vec3}` | Homogeneous unary |
| **Color** | HSV→RGB | `{color}` | Single payload |
| **State** | UnitDelay, Lag | Specialized over `{float, vec2, vec3, color}` | Per-lane state sized by stride |

### Which Blocks Are NOT Payload-Specialized

| Category | Blocks | Reason |
|----------|--------|--------|
| **Conversion** | FloatToVec2, PackVec3, ToColor | Explicit cast (fixed input/output) |
| **Instance** | Array | Cardinality, not payload |
| **Time** | TimeRoot | Fixed outputs |
| **Render** | RenderSink | Fixed port types |

### Compilation: Fully Specialized IR

The compiler emits fully specialized IR per payload — no runtime dispatch:

- Stride determined by payload: `float=1`, `vec2=2`, `vec3=3`, `color=4`.
- Runtime kernels operate on dense arrays with known stride.
- No per-lane type checks, no boxing.

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

---

## Default Sources

Every input always has exactly one source due to DefaultSource blocks.

### Default Source Invariant

- DefaultSource block is ALWAYS connected during GraphNormalization.
- Satisfies: every input has exactly one aggregated value per frame.
- Combine mode decides how explicit writers interact with the default.

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

---

## Rails

Immutable system-provided buses. Cannot be deleted or renamed.

### MVP Rails

| Rail | Output Type | Description |
|------|-------------|-------------|
| `time` | `one + continuous + float` | `tMs` value |
| `phaseA` | `one + continuous + float(phase01)` | Primary phase |
| `phaseB` | `one + continuous + float(phase01)` | Secondary phase |
| `pulse` | `one + discrete + unit` | Frame tick trigger |
| `palette` | `one + continuous + color` | Chromatic reference frame |

---

## Transforms (Lenses)

Transforms are blocks. Lenses/adapters normalize into explicit derived blocks.

### Lens as Derived Block

Lenses are **port decorators** compiled to actual blocks in the patch. They can be attached to both input and output ports.

---

## Cycle Validation

### Invariant: Every Cycle Must Cross a Stateful Boundary

Detection: Tarjan's algorithm for SCC (strongly connected components).

Each SCC must contain at least one stateful primitive (UnitDelay, Lag, Phasor, SampleAndHold).

---

## See Also

- [01-type-system](./01-type-system.md) - CanonicalType for ports
- [03-time-system](./03-time-system.md) - TimeRoot and rails
- [04-compilation](./04-compilation.md) - How blocks compile
- [Glossary: Block](../GLOSSARY.md#block)
- [Invariant: I6](../INVARIANTS.md#i6-compiler-never-mutates-the-graph)
