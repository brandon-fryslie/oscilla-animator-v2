---
parent: ../INDEX.md
topic: type-system
order: 1
---

# Type System (Five-Axis Model)

> The foundation of Oscilla's type safety and compile-time guarantees.

**Related Topics**: [02-block-system](./02-block-system.md), [04-compilation](./04-compilation.md)
**Key Terms**: [PayloadType](../GLOSSARY.md#payloadtype), [Extent](../GLOSSARY.md#extent), [SignalType](../GLOSSARY.md#signaltype)
**Relevant Invariants**: [I22](../INVARIANTS.md#i22-safe-modulation-ranges)

---

## Overview

Oscilla v2.5 introduces a **five-axis type coordinate system** that cleanly separates concerns without concept conflation. This replaces the v2 `World` enum with explicit, orthogonal axes.

The type system has three layers:
1. **PayloadType** - What the value is made of (float, vec2, color, etc.)
2. **Extent** - Where/when/about-what the value exists (5 axes)
3. **SignalType** - The complete contract (PayloadType + Extent)

---

## PayloadType

The base data type of a value - what the payload is made of.

```typescript
type PayloadType = 'float' | 'int' | 'vec2' | 'vec3' | 'color' | 'phase' | 'bool' | 'unit' | 'shape2d' | 'shape3d';
```

### PayloadType Semantics

| Type | Description | Stride | Range/Units |
|------|-------------|--------|-------------|
| `float` | 32-bit floating point | 1 | IEEE 754 |
| `int` | 32-bit signed integer | 1 | -2^31 to 2^31-1 |
| `vec2` | 2D vector (x, y) | 2 | Two floats |
| `vec3` | 3D vector (x, y, z) | 3 | Three floats |
| `color` | RGBA color | 4 | Four floats, 0..1 each |
| `phase` | Cyclic phase value | 1 | 0..1 with wrap semantics |
| `bool` | Boolean | 1 | true/false |
| `unit` | Unit interval | 1 | 0..1 clamped |
| `shape2d` | 2D shape reference | 8 | Packed u32 words (opaque handle) |
| `shape3d` | 3D shape reference (T3) | 12 | Packed u32 words (opaque handle, future) |

### Opaque Handle Payloads

`shape2d` and `shape3d` are **opaque handle payloads** — they refer to geometry definitions rather than representing computable values. Unlike arithmetic types (float, vec2, etc.), you cannot add, multiply, or interpolate handle values.

### shape2d: Handle Type

`shape2d` is a **handle/reference type** — it refers to a geometry definition rather than representing a computable value. Unlike arithmetic types (float, vec2, etc.), you cannot add, multiply, or interpolate shape2d values.

```typescript
// shape2d packed layout (8 × u32 words)
const SHAPE2D_WORDS = 8;
enum Shape2DWord {
  TopologyId = 0,       // u32 — identifies shape topology
  PointsFieldSlot = 1,  // u32 — field slot ID for control points
  PointsCount = 2,      // u32 — number of control points
  StyleRef = 3,         // u32 — style reference
  Flags = 4,            // u32 — bitfield (closed, etc.)
  Reserved1 = 5,
  Reserved2 = 6,
  Reserved3 = 7,
}
```

**Valid operations**: equality comparison, assignment, pass-through
**Invalid operations**: arithmetic, interpolation, combine modes (except `last`/`first`)

### shape3d: Handle Type (T3 Future Extension)

`shape3d` extends the handle concept to 3D geometry. It follows the same opaque-handle rules as `shape2d`.

```typescript
// shape3d packed layout (12 × u32 words) — T3, not yet implemented
const SHAPE3D_WORDS = 12;
enum Shape3DWord {
  TopologyId = 0,
  PointsFieldSlot = 1,
  PointsCount = 2,
  StyleRef = 3,
  Flags = 4,
  NormalsFieldSlot = 5,   // u32 — field slot for vertex normals
  MaterialRef = 6,         // u32 — material reference
  Reserved1 = 7,
  Reserved2 = 8,
  Reserved3 = 9,
  Reserved4 = 10,
  Reserved5 = 11,
}
```

### CombineMode Restrictions by PayloadType

CombineMode defines how multiple writers to the same bus are resolved. Not all modes are valid for all payload types.

| PayloadType | Allowed CombineModes | Rationale |
|-------------|---------------------|-----------|
| `float` | sum, product, min, max, last, first | Full arithmetic |
| `int` | sum, product, min, max, last, first | Full arithmetic |
| `vec2` | sum, last, first | Component-wise sum; min/max ambiguous |
| `vec3` | sum, last, first | Component-wise sum; min/max ambiguous |
| `color` | sum, last, first, blend | Color-specific blend mode |
| `phase` | last, first | Phase arithmetic is restricted |
| `bool` | or, and, last, first | Boolean logic |
| `unit` | last, first | Clamped semantics prohibit accumulation |
| `shape2d` | last, first | **Opaque handle — non-arithmetic** |
| `shape3d` | last, first | **Opaque handle — non-arithmetic** |

### CombineMode Invariants

1. **No payload type change**: CombineMode never changes the PayloadType of the bus
2. **No cardinality increase**: CombineMode never increases cardinality (no fan-out)
3. **No composite allocation**: CombineMode never allocates new composite values
4. **Pure function over fixed-size representation**: CombineMode must be definable as a pure function `(accumulator: T, incoming: T) → T` where T is a fixed-size value

### Important Notes

- `float` and `int` are **PayloadTypes** (domain model)
- `number` is **TypeScript-only** (implementation detail)
- PayloadType does **NOT** include `'event'` or `'domain'`
- `phase` has special arithmetic rules (see [Phase Semantics](#phase-type-semantics))
- `shape2d` is a handle type — see above for restrictions

---

## Extent (Five-Axis Coordinate)

Describes where/when/about-what a value exists. Independent of payload.

```typescript
type Extent = {
  cardinality: AxisTag<Cardinality>;
  temporality: AxisTag<Temporality>;
  binding: AxisTag<Binding>;
  perspective: AxisTag<PerspectiveId>;
  branch: AxisTag<BranchId>;
};
```

### The Five Axes

| Axis | Question | Values |
|------|----------|--------|
| Cardinality | How many lanes? | zero, one, many(domain) |
| Temporality | When does it exist? | continuous, discrete |
| Binding | What is it about? | unbound, weak, strong, identity |
| Perspective | From whose viewpoint? | (v0: 'global' only) |
| Branch | Which timeline? | (v0: 'main' only) |

---

## AxisTag (No Optional Fields)

A discriminated union representing "default unless instantiated."

```typescript
type AxisTag<T> =
  | { kind: 'default' }
  | { kind: 'instantiated'; value: T };
```

This pattern eliminates optional fields while preserving compile-time default semantics.

### Why AxisTag?

- **No optional fields** - The union branch determines what exists
- **TypeScript type narrowing** - `if (tag.kind === 'instantiated')` gives you the value
- **Explicit defaults** - Default behavior is a conscious choice, not absence of data

---

## Cardinality (How Many Lanes)

```typescript
type Cardinality =
  | { kind: 'zero' }                          // compile-time constant, no runtime lanes
  | { kind: 'one' }                           // single lane (Signal)
  | { kind: 'many'; instance: InstanceRef };  // N lanes aligned by instance (Field)
```

### Cardinality Semantics

| Cardinality | Concept | Runtime Representation | Use Case |
|-------------|---------|------------------------|----------|
| `zero` | Constant | Inlined constant | Parameters, constants |
| `one` | Signal | Single slot | Per-frame values |
| `many(instance)` | Field | Array of N slots | Per-element values |

### Important: Instance vs Domain

**Domain** is the element classification (what kind of thing).
**Instance** is a specific collection of those elements (how many, which pool).

```typescript
// Instance reference includes both the domain type AND instance ID
interface InstanceRef {
  readonly kind: 'instance';
  readonly domainType: DomainTypeId;  // e.g., 'circle'
  readonly instanceId: InstanceId;     // e.g., 'inst_1'
}
```

At runtime, instances become loop bounds + active masks (erased as objects).

---

## Temporality (When)

```typescript
type Temporality =
  | { kind: 'continuous' }  // value exists every frame/tick
  | { kind: 'discrete' };   // event occurrences only
```

### Temporality Semantics

| Temporality | Description | Evaluation |
|-------------|-------------|------------|
| `continuous` | Value exists every frame | Once per frame |
| `discrete` | Event occurrences only | When event fires |

### Discrete Never Implicitly Fills Time

Discrete outputs do NOT become continuous signals unless an explicit stateful operator performs that conversion (SampleAndHold, etc.). This keeps causality explicit.

---

## Binding (v0: Default-Only)

```typescript
type ReferentId = string;
type ReferentRef = { kind: 'referent'; id: ReferentId };

type Binding =
  | { kind: 'unbound' }
  | { kind: 'weak'; referent: ReferentRef }
  | { kind: 'strong'; referent: ReferentRef }
  | { kind: 'identity'; referent: ReferentRef };
```

### Binding Semantics

| Binding | Meaning | Example |
|---------|---------|---------|
| `unbound` | Pure value/signal/field | Color signal, phase value |
| `weak` | Measurement-like about referent | Distance to object |
| `strong` | Property-like about referent | Object's position |
| `identity` | Stable entity identity | Object ID |

### Binding is Independent of Domain

The same domain can host unbound image vs bound mask. The same referent can have scalar properties and per-vertex fields. This is the resolution of "Binding: Is this what Domain currently represents?" - **no, domain is topology; binding is aboutness.**

**v0 Behavior**: Binding uses canonical default (`unbound`) everywhere. The axis exists for future extensibility.

---

## Perspective and Branch (v0: Default-Only)

```typescript
type PerspectiveId = string;
type BranchId = string;
```

These axes exist in the type coordinate so you can add multi-view and multi-history later, but they are **defaults-only in v0**.

**v0 Defaults**:
- Perspective: `'global'`
- Branch: `'main'`

---

## SignalType (Complete Contract)

The full type description for a port or wire.

```typescript
type SignalType = {
  payload: PayloadType;
  extent: Extent;
};
```

### Derived Type Concepts

These are NOT separate types - they're constraints on SignalType:

| Concept | Cardinality | Temporality | Definition |
|---------|-------------|-------------|------------|
| **Signal** | `one` | `continuous` | Single-lane per-frame value |
| **Field** | `many(domain)` | `continuous` | Per-element per-frame value |
| **Trigger** | `one` | `discrete` | Single event stream |
| **Per-lane Event** | `many(domain)` | `discrete` | Per-element event stream |

```typescript
// Field predicate
function isField(t: SignalType): boolean {
  return (
    t.extent.cardinality.kind === 'instantiated' &&
    t.extent.cardinality.value.kind === 'many' &&
    t.extent.temporality.kind === 'instantiated' &&
    t.extent.temporality.value.kind === 'continuous'
  );
}
```

---

## V0 Canonical Defaults

```typescript
const DEFAULTS_V0 = {
  cardinality: { kind: 'canonical', value: { kind: 'one' } },
  temporality: { kind: 'canonical', value: { kind: 'continuous' } },
  binding:     { kind: 'canonical', value: { kind: 'unbound' } },
  perspective: { kind: 'canonical', value: 'global' },
  branch:      { kind: 'canonical', value: 'main' },
};

const FRAME_V0: EvalFrame = { perspective: 'global', branch: 'main' };

type DefaultSemantics<T> =
  | { kind: 'canonical'; value: T }  // v0
  | { kind: 'inherit' };             // v1+
```

---

## Axis Unification Rules (v0)

Strict join rules, compile-time only:

```
default + default                → default
default + instantiated(X)        → instantiated(X)
instantiated(X) + instantiated(X) → instantiated(X)
instantiated(X) + instantiated(Y), X≠Y → TYPE ERROR
```

**No implicit merges. No "best effort."** Applied to all five axes.

### Where Unification Happens

- **Edge**: `from.type` must unify with `to.type`
- **Multi-input op**: Inputs unify for required axes; output derived from unified inputs
- **Combine point**: All incoming edges unify before combine mode applies

---

## World → Axes Mapping Table

For migration from v2:

| Old World | Cardinality | Temporality |
|-----------|-------------|-------------|
| `static` | `zero` | `continuous` |
| `signal` | `one` | `continuous` |
| `field(domain)` | `many(domain)` | `continuous` |
| `event` | `one` OR `many(domain)` | `discrete` |

---

## Domain System

### What is a Domain?

A **domain** is a classification that defines a kind of element. It answers the question: "What *type of thing* are we talking about?"

A domain specifies:
1. **What kind of thing elements are** — The ontological category (shape, particle, control)
2. **What operations make sense** — Valid transformations for that element type
3. **What intrinsic properties elements have** — Inherent attributes from domain membership

A domain is **NOT**:
- A count of elements (that's instantiation)
- A spatial arrangement or layout (that's layout)
- A specific instantiation or configuration (that's an instance)

### Domain vs Instance: The Key Distinction

**Domain** and **instantiation** are orthogonal concerns:

| Concept | Question | Example |
|---------|----------|---------|
| **Domain** | "What kind of thing?" | shape, circle, particle |
| **Instance** | "How many of them?" | 100 circles (from pool of 200) |
| **Layout** | "Where are they?" | grid, spiral, random scatter |

You can have:
- 100 circles in a grid
- 100 circles along a spiral
- 50 rectangles scattered randomly

Same domain (shape) can have different instantiations. Same layout can apply to different domains.

### Domain Type Specification (DomainSpec)

```typescript
type DomainTypeId = string & { readonly __brand: 'DomainTypeId' };

interface DomainSpec {
  readonly id: DomainTypeId;
  readonly parent: DomainTypeId | null;           // For subtyping
  readonly intrinsics: readonly IntrinsicSpec[];  // Inherent properties
}

interface IntrinsicSpec {
  readonly name: string;
  readonly type: PayloadType;
  readonly computation: 'inherent' | 'derived';
}
```

### Domain Hierarchy (Subtyping)

Domains form a hierarchy where subtypes inherit from parent domains:

```
shape (base domain)
├── circle    → intrinsics: radius, center
├── rectangle → intrinsics: width, height, cornerRadius
├── polygon   → intrinsics: vertices[], vertexCount
├── ellipse   → intrinsics: rx, ry, center
└── line      → intrinsics: start, end, length
```

**Subtyping rules:**
- Operations valid for `shape` are valid for all subtypes
- Subtypes may have additional intrinsics
- `Field<circle>` can be passed where `Field<shape>` expected (covariance)

### Instance Declaration (InstanceDecl)

Instances are per-patch declarations that create collections of domain elements:

```typescript
type InstanceId = string & { readonly __brand: 'InstanceId' };

interface InstanceDecl {
  readonly id: InstanceId;
  readonly domainType: DomainTypeId;      // What kind of element
  readonly primitiveId: PrimitiveId;       // Source primitive
  readonly maxCount: number;               // Pool size (allocated once)
  readonly countExpr?: SigExprId;          // Dynamic count signal
  readonly lifecycle: 'static' | 'pooled';
}
```

### Instance Reference in Cardinality

The Cardinality axis references instances (not domains directly):

```typescript
interface InstanceRef {
  readonly kind: 'instance';
  readonly domainType: DomainTypeId;
  readonly instanceId: InstanceId;
}

type Cardinality =
  | { readonly kind: 'zero' }
  | { readonly kind: 'one' }
  | { readonly kind: 'many'; readonly instance: InstanceRef };
```

### Domain Catalog (MVP)

**Immediate priority:**

| Domain | Elements | Intrinsics |
|--------|----------|------------|
| `shape` | 2D geometric primitives | position, bounds, area, centroid |
| `circle` | Circles (extends shape) | radius, center |
| `rectangle` | Rectangles (extends shape) | width, height, cornerRadius |
| `control` | Animatable parameters | value, min, max, default |
| `event` | Discrete occurrences | time, payload, fired |

**Roadmap:**
- `mesh`, `path`, `text`, `particle`, `audio`

### Domain Properties (Runtime)

- Domain types are **compile-time** constructs
- Instances are **patch-level** resources
- At runtime: erased to loop bounds + active mask
- **Invariant**: Every instance compiles to dense lanes 0..maxCount-1

### Instance Alignment

Two `many` values are aligned iff they reference the **same InstanceId**. No mapping/resampling in v0.

---

## Phase Type Semantics

Phase has special arithmetic rules:

| Operation | Result | Notes |
|-----------|--------|-------|
| `phase + float` | `phase` | Offset |
| `phase * float` | `phase` | Scale |
| `phase + phase` | **TYPE ERROR** | Invalid |
| `PhaseToFloat(phase)` | `float` | Explicit unwrap |
| `FloatToPhase(float)` | `phase` | Explicit wrap |

---

## Type Errors

### Common Type Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| Axis mismatch | `instantiated(X) + instantiated(Y)` | Use same value or add explicit adapter |
| Domain mismatch | `many(A)` cannot combine with `many(B)` | Align domains or add explicit mapping |
| Phase arithmetic | `phase + phase` | Use explicit conversion |
| Missing domain | `many` without domain reference | Specify domain in type |

---

## Examples

### Signal Type (Per-Frame Float)

```typescript
const phaseSignal: SignalType = {
  payload: 'phase',
  extent: {
    cardinality: { kind: 'instantiated', value: { kind: 'one' } },
    temporality: { kind: 'instantiated', value: { kind: 'continuous' } },
    binding: { kind: 'default' },
    perspective: { kind: 'default' },
    branch: { kind: 'default' },
  }
};
```

### Field Type (Per-Element Color)

```typescript
const colorField: SignalType = {
  payload: 'color',
  extent: {
    cardinality: {
      kind: 'instantiated',
      value: {
        kind: 'many',
        instance: {
          kind: 'instance',
          domainType: 'circle' as DomainTypeId,
          instanceId: 'inst_1' as InstanceId
        }
      }
    },
    temporality: { kind: 'instantiated', value: { kind: 'continuous' } },
    binding: { kind: 'default' },
    perspective: { kind: 'default' },
    branch: { kind: 'default' },
  }
};
```

### Event Type (Trigger)

```typescript
const pulse: SignalType = {
  payload: 'unit',
  extent: {
    cardinality: { kind: 'instantiated', value: { kind: 'one' } },
    temporality: { kind: 'instantiated', value: { kind: 'discrete' } },
    binding: { kind: 'default' },
    perspective: { kind: 'default' },
    branch: { kind: 'default' },
  }
};
```

---

## See Also

- [02-block-system](./02-block-system.md) - How blocks use SignalType
- [04-compilation](./04-compilation.md) - Type unification and resolution
- [Glossary: PayloadType](../GLOSSARY.md#payloadtype)
- [Glossary: Extent](../GLOSSARY.md#extent)
- [Glossary: SignalType](../GLOSSARY.md#signaltype)
