---
parent: ../INDEX.md
topic: layout-system
order: 17
---

# Layout System

> Layout is Field<vec2> produced by field expressions and layout kernels.

**Related Topics**: [01-type-system](./01-type-system.md), [04-compilation](./04-compilation.md), [16-coordinate-spaces](./16-coordinate-spaces.md), [06-renderer](./06-renderer.md)
**Key Terms**: [Layout Kernel](../GLOSSARY.md#layout-kernel), [Lane](../GLOSSARY.md#lane), [World Space](../GLOSSARY.md#world-space)
**Relevant Invariants**: [I8](../INVARIANTS.md#i8-slot-addressed-execution), [I15](../INVARIANTS.md#i15-renderer-is-a-sink-not-an-engine)

---

## Overview

The layout system defines how instances are positioned in world space. Key principles:

- **Layout is Field<vec2>** - Positions are fields, not metadata
- **Single source of truth** - Field expressions + kernels only
- **World-normalized output** - All positions in [0,1]×[0,1]
- **No intrinsic positions** - Intrinsics are limited to {index, normalizedIndex, randomId}

---

## Layout Definition

**Layout** is defined as:

> A `Field<vec2>` over a specific instance, with world-space coordinates in normalized [0,1] × [0,1], produced by field expressions and field kernels.

Concretely, a layout is represented by a `FieldExprId` whose CanonicalType has:
- `payload: 'vec2'`
- `extent.cardinality.kind = 'many'`
- `extent.cardinality.instance.instanceId = <the instance being positioned>`
- `extent.temporality = 'continuous'`

This field is referred to as the **position field** for that instance.

---

## Single Layout Engine

In the target system:
- **Exactly one layout mechanism**: Field expressions + field kernels whose output is `position: Field<vec2>`
- **No alternative mechanisms**:
  - No `InstanceDecl.layout` metadata semantics
  - No `FieldExprLayout` node type (removed)
  - No `position` or `radius` intrinsics

All layouts are composed from:
- `FieldExprIntrinsic` for `index`, `normalizedIndex`, `randomId`
- `FieldExprBroadcast` from signals
- `FieldExprMap`, `FieldExprZip`, `FieldExprZipSig` with layout kernels

---

## Intrinsic Set (Closed)

The intrinsic set is **closed** and limited to:

```typescript
type IntrinsicPropertyName =
  | 'index'
  | 'normalizedIndex'
  | 'randomId';
```

### Intrinsic Semantics

| Intrinsic | Payload | Unit | Semantics |
|-----------|---------|------|-----------|
| `index` | `float` | `'#'` | Lane index `i` for `i ∈ [0, N-1]` |
| `normalizedIndex` | `float` | `'normalized'` | `i / (N - 1)` for `N > 1`; `0.5` for `N = 1` |
| `randomId` | `float` | `'normalized'` | Deterministic PRNG from `(instanceId, i)` and seed |

### Intrinsic Constraints

- Intrinsics are computable from `(instanceDecl, lane index i)` only
- **No dependencies** on:
  - Block parameters
  - Graph wiring
  - Time
  - External inputs
- **No new intrinsics** may be added without updating the canonical type system

**Explicitly excluded**: `'position'` and `'radius'` are NOT intrinsics.

---

## Layout Kernels

Layout kernels are named `PureFn` instances that implement per-lane position computation.

```typescript
type PureFn =
  | { kind: 'opcode'; opcode: OpCode }
  | { kind: 'kernel'; name: string }
  | { kind: 'expr'; expr: string }
  | { kind: 'composed'; ops: readonly OpCode[] };
```

Layout kernels use `kind: 'kernel'` and are resolved by `name` in the field-kernel registry.

### Common Kernel Contract

All layout kernels share:

**Output CanonicalType**:
- `payload: 'vec2'`
- `extent.cardinality.kind = 'many'`
- `extent.cardinality.instance = <instance of input field>`
- `extent.temporality = 'continuous'`

**World coordinate semantics**:
- `x` and `y` are in normalized world coordinates [0,1]
- `(0,0)` is bottom-left, `(1,1)` is top-right, center is `(0.5, 0.5)`
- No kernel multiplies by viewport dimensions or depends on render target size

---

## Canonical Layout Kernels

### circleLayout

**Name**: `'circleLayout'`

**Inputs**:
- **Field**:
  - `t: Field<float>` (payload: `'float'`, unit: `'normalized'`)
    - Values in [0,1] (typically `normalizedIndex`)
    - `cardinality.many.instance = I`
- **Signals**:
  - `radius: Signal<float>` (unit: `'normalized'`, typical range `(0, 0.5]`)
  - `phase: Signal<float>` (unit: `'radians'`)

**Output**:
- `position: Field<vec2>` over instance `I`

**Per-lane computation** (lane index `i`):

```
t_i = clamp(t[i], 0, 1)
θ_i = phase + 2π × t_i
r = radius

x_i = 0.5 + r × cos(θ_i)
y_i = 0.5 + r × sin(θ_i)
```

**Buffer storage**:
```
out[2×i + 0] = x_i
out[2×i + 1] = y_i
```

---

### lineLayout

**Name**: `'lineLayout'`

**Inputs**:
- **Field**:
  - `t: Field<float>` (payload: `'float'`, unit: `'normalized'`)
    - Values in [0,1] (typically `normalizedIndex`)
    - `cardinality.many.instance = I`
- **Signals**:
  - `x0: Signal<float>` (unit: `'normalized'`)
  - `y0: Signal<float>` (unit: `'normalized'`)
  - `x1: Signal<float>` (unit: `'normalized'`)
  - `y1: Signal<float>` (unit: `'normalized'`)

**Output**:
- `position: Field<vec2>` over instance `I`

**Per-lane computation** (lane index `i`):

```
t_i = clamp(t[i], 0, 1)

x_i = (1 - t_i) × x0 + t_i × x1
y_i = (1 - t_i) × y0 + t_i × y1
```

**Buffer storage**:
```
out[2×i + 0] = x_i
out[2×i + 1] = y_i
```

---

### gridLayout

**Name**: `'gridLayout'`

**Inputs**:
- **Field**:
  - `k: Field<float>` (payload: `'float'`, unit: `'#'` or `'scalar'`)
    - Values represent integer indices `0..N-1` (typically from `index` intrinsic)
    - `cardinality.many.instance = I`
- **Signals**:
  - `cols: Signal<int>` (constraint: `cols ≥ 1`)
  - `rows: Signal<int>` (constraint: `rows ≥ 1`)

**Output**:
- `position: Field<vec2>` over instance `I`

**Per-lane computation** (lane index `i`):

```
idx = clamp(floor(k[i]), 0, totalCount - 1)
col = clamp(idx mod cols, 0, cols - 1)
row = clamp(floor(idx / cols), 0, rows - 1)

x_i = (cols > 1) ? col / (cols - 1) : 0.5
y_i = (rows > 1) ? row / (rows - 1) : 0.5
```

**Edge cases**:
- If `cols = 1`: all instances have `x_i = 0.5`
- If `rows = 1`: all instances have `y_i = 0.5`

**Buffer storage**:
```
out[2×i + 0] = x_i
out[2×i + 1] = y_i
```

This kernel provides a full-screen grid in normalized coordinate space.

---

## Layout Blocks (Graph Level)

At the block/graph level, a **layout block** is a node that:
- Takes one or more scalar signals and intrinsic fields as inputs
- Produces a single output: `position: Field<vec2>` over a specific instance

### Example: LineLayout Block

**Inputs**:
- `start: Signal<vec2>` (or separate `x0`, `y0` signals)
- `end: Signal<vec2>` (or separate `x1`, `y1` signals)
- Implicit: instance reference (encoded in output extent)

**Output**:
- `position: Field<vec2>` over that instance

The compiler lowers such blocks into `FieldExpr` trees that apply layout field kernels to intrinsic fields.

---

## Compilation

### How Layout Blocks Compile

A layout block compiles to:

```
FieldExprZipSig {
  kind: 'zipSig',
  field: <intrinsic field>,     // e.g., normalizedIndex
  signals: [radius, phase],      // kernel parameters
  fn: { kind: 'kernel', name: 'circleLayout' },
  type: <Field<vec2> over instance>,
  instanceId: <instance>
}
```

This produces `Field<vec2>` in world space [0,1]×[0,1].

### Kernel Resolution

- Layout kernels are registered by name in a kernel registry
- The compiler emits kernel names; the runtime resolves them to implementations
- Each kernel must implement the per-lane contract defined above

---

## Relationship to Renderer

### StepRender Contract

The renderer receives positions via `StepRender`:

```typescript
interface StepRender {
  kind: 'render';
  instanceId: InstanceId;
  positionSlot: ValueSlot;      // Must be Field<vec2> over instanceId
  colorSlot: ValueSlot;
  shape?: ...;
  controlPoints?: ...;
}
```

**Invariants**:
- `positionSlot` references a buffer whose type is `Field<vec2>` over `instanceId`
- All field-backed inputs (color, shape, etc.) must be fields over the **same instance**
- Positions are in **world space** [0,1]×[0,1]

### Coordinate Space Mapping

- Layout kernels produce **world-space** positions [0,1]×[0,1]
- The renderer maps world space → viewport space (see [Topic 16](./16-coordinate-spaces.md))
- Patch logic never sees viewport coordinates (Invariant I15: renderer is a sink)

---

## Validation Rules

At compile time:

1. **For any layout field (position)**:
   - `type.payload = 'vec2'`
   - `extent.cardinality.kind = 'many'`
   - `extent.temporality = 'continuous'`

2. **For any StepRender**:
   - `positionSlot` references a buffer whose type is `Field<vec2>` over `instanceId`
   - All other field-backed inputs reference fields over the **same** `instanceId`
   - Shape and control-point fields are type-checked with matching cardinality and instance

3. **Layout mechanisms**:
   - No `InstanceDecl.layout` property is consulted for rendering or field computation
   - No `FieldExprLayout` is present in the IR
   - No `position`/`radius` intrinsics are present

---

## See Also

- [01-type-system](./01-type-system.md) - PayloadType (vec2), Cardinality (many), Field definition
- [04-compilation](./04-compilation.md) - Field expressions, kernel resolution, slot allocation
- [16-coordinate-spaces](./16-coordinate-spaces.md) - World space definition, coordinate conventions
- [06-renderer](./06-renderer.md) - StepRender contract, world→viewport mapping
- [Glossary: Layout Kernel](../GLOSSARY.md#layout-kernel)
- [Glossary: World Space](../GLOSSARY.md#world-space)
- [Glossary: Lane](../GLOSSARY.md#lane)
