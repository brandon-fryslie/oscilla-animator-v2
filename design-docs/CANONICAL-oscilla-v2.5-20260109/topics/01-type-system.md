---
parent: ../INDEX.md
topic: type-system
order: 1
---

# Type System (Five-Axis Model)

> The foundation of Oscilla's type safety and compile-time guarantees.

**Related Topics**: [02-block-system](./02-block-system.md), [04-compilation](./04-compilation.md), [20-type-validation](./20-type-validation.md), [21-adapter-system](./21-adapter-system.md)
**Key Terms**: [PayloadType](../GLOSSARY.md#payloadtype), [Extent](../GLOSSARY.md#extent), [CanonicalType](../GLOSSARY.md#canonicaltype), [UnitType](../GLOSSARY.md#unittype)
**Relevant Invariants**: [I22](../INVARIANTS.md#i22-safe-modulation-ranges), [I32-I36](../INVARIANTS.md#i32-single-type-authority)

---

## Core Principle: Single Type Authority

**CanonicalType is the ONLY type authority for all values in the system.**

Every value — whether it represents a scalar, an array, an event, or a constant — has exactly one type: `CanonicalType`. There is no second type system, no parallel representation, and no "also stores type info" property.

Previously, the system distinguished between "scalars" and "arrays" using legacy terminology. This distinction is now unified under `CanonicalType`, where the number of lanes is simply a property of the **Cardinality** axis.

### Why This Cannot Change

Without single type authority:
- Every subsystem needs its own type representation — N representations that drift.
- Type-dependent dispatch (kernels, adapters, continuity) becomes ambiguous.
- Refactoring any type concept requires updating N places instead of 1.
- Testing type invariants requires testing N systems, not 1.

This principle is what makes the type system a *system* rather than a collection of ad-hoc type checks.

---

## CanonicalType (Complete Contract)

The full type description for a port, wire, or value-producing expression.

```typescript
type CanonicalType = {
  readonly payload: PayloadType;
  readonly unit: UnitType;
  readonly extent: Extent;
};
```

**Foundational Rules**:
1. **Every value has a type**: No value-producing node/expr/slot exists without `type: CanonicalType`.
2. **Type is sufficient**: No additional "kind" or "family" property is needed — all dispatch uses axes.
3. **Payload determines stride**: `payloadStride(type.payload)` is the only source of stride information.
4. **Unit is semantic**: Unit describes what the numbers mean, not how they're stored.
5. **Extent is orthogonal**: The 5 axes are independent dimensions; each can vary independently.

---

## PayloadType (Closed Set)

The base data shape of a value — what the payload is made of.

```typescript
type PayloadType =
  | { kind: 'float' }
  | { kind: 'int' }
  | { kind: 'bool' }
  | { kind: 'vec2' }
  | { kind: 'vec3' }
  | { kind: 'color' }
  | { kind: 'cameraProjection' }
  | { kind: 'shape2d' }
  | { kind: 'shape3d' };
```

### PayloadType Semantics

| Type | Description | Stride | Range/Units |
|------|-------------|--------|-------------|
| `float` | 32-bit floating point | 1 | IEEE 754 |
| `int` | 32-bit signed integer | 1 | -2^31 to 2^31-1 |
| `bool` | Boolean | 1 | true/false |
| `vec2` | 2D vector (x, y) | 2 | Two floats |
| `vec3` | 3D vector (x, y, z) | 3 | Three floats |
| `color` | RGBA color | 4 | Four floats, 0..1 each |
| `cameraProjection` | Camera projection enum | 1 | Closed string enum |
| `shape2d` | 2D shape handle | 1 | u32 index into ShapeBank |
| `shape3d` | 3D shape handle (T3) | 1 | u32 index into ShapeBank (future) |

### Stride

Stride is ALWAYS derived from payload via `payloadStride()`. Never stored as a separate property.

```typescript
function payloadStride(payload: PayloadType): number;
// float=1, int=1, bool=1, vec2=2, vec3=3, color=4, cameraProjection=1, shape2d=1, shape3d=1
```

### Handle Payloads

`shape2d` and `shape3d` are **numeric handle payloads** — they reference a `ShapeHeaderV1` record in the `ShapeBank`.

**Valid operations**: equality comparison, assignment, pass-through.
**Storage**: Stored as `u32` identity values, bit-cast to `f32` when traversing the Arena.

#### ShapeHeaderV1 (16 words / 64 bytes)

Each handle points to a canonical header record in the ShapeBank:
- `kind`: Taxonomy class (Rigid, Parametric, etc.)
- `topologyMode`: Indexed vs Non-Indexed
- `refs`: Offsets into the payload heap (indices, parameters)
- `bounds`: Packed bounding box for culling

---

## UnitType (6 Structured Kinds)

Semantic interpretation of a value's numbers. Structured nesting with 6 top-level kinds.

```typescript
type UnitType =
  | { kind: 'none' }
  | { kind: 'count' }
  | { kind: 'angle'; unit: 'radians' | 'degrees' | 'phase01' }
  | { kind: 'time'; unit: 'ms' | 'seconds' }
  | { kind: 'space'; space: 'ndc' | 'world' | 'view'; dims: 2 | 3 }
  | { kind: 'color'; unit: 'rgba01' | 'oklch' };
```

### Normalized Unit Policy (Foundational)

The choice of when values are normalized to 0..1 vs kept in natural units is foundational to the number system:

**Normalize to 0..1**:
- Phase values (oscillator output, LFO)
- Weights, mix amounts, mask amounts
- Easing curves (progress input/output)
- normalizedIndex (per-element position in array)

**Keep in natural units**:
- Time: seconds or milliseconds
- Angles: radians or degrees
- Positions: NDC, world, or view space
- Velocities, accelerations: derived from natural units

**Rule**: Use UnitType to encode the convention. Only normalize when the unit says so.

---

## Extent (Five-Axis Coordinate)

Describes where/when/about-what a value exists. Independent of payload and unit.

```typescript
type Extent = {
  readonly cardinality: CardinalityAxis;
  readonly temporality: TemporalityAxis;
  readonly binding: BindingAxis;
  readonly perspective: PerspectiveAxis;
  readonly branch: BranchAxis;
};
```

---

## Axis Polymorphism Pattern: Axis\<T, V\>

The canonical axis representation.

```typescript
type Axis<T, V> =
  | { kind: 'var'; var: V }    // Type variable (inference only)
  | { kind: 'inst'; value: T }  // Instantiated value
```

**Hard constraints**:
- `var` branches MUST NOT escape the frontend boundary into backend/runtime/renderer.
- After type solving, all axes are `{ kind: 'inst'; value: ... }`.

---

## Cardinality (How Many Lanes)

```typescript
type CardinalityValue =
  | { kind: 'zero' }                          // compile-time constant, no runtime lanes
  | { kind: 'one' }                           // single lane
  | { kind: 'many'; instance: InstanceRef };  // N lanes aligned by instance
```

### Cardinality Semantics

| Cardinality | Concept | Runtime Representation | Use Case |
|-------------|---------|------------------------|----------|
| `zero` | Constant | Inlined constant (compile-time-only) | Parameters, constants |
| `one` | Scalar | Single slot per frame | Global values |
| `many(instance)` | Array | Array of N slots per frame | Per-element values |

### zero: Compile-Time-Only

`zero` means compile-time-only. The value exists at compile time, produces no runtime lanes, and occupies no per-frame storage.

- `zero` is NOT "scalar" — scalar is `cardinality=one + temporality=continuous`.
- No implicit coercion from zero into runtime cardinalities.
- Only explicit lift ops: `broadcastConstToOne(const)`: zero → one, `broadcastConstToMany(const, instance)`: zero → many(instance).

---

## Temporality (When)

```typescript
type TemporalityValue =
  | { kind: 'continuous' }  // value exists every frame/tick
  | { kind: 'discrete' };   // event occurrences only
```

### Event Hard Invariants

Discrete temporality implies event semantics:
- `temporality=discrete` ⇒ `payload=bool` (always)
- `temporality=discrete` ⇒ `unit=none` (always)

### Discrete Never Implicitly Fills Time

Discrete outputs do NOT become continuous values unless an explicit stateful operator performs that conversion (SampleAndHold, etc.).

---

## Binding (Nominal Tags, NOT a Lattice)

```typescript
type BindingValue =
  | { kind: 'unbound' }
  | { kind: 'weak' }
  | { kind: 'strong' }
  | { kind: 'identity' };
```

**Critical**: BindingValue has **NO ordering**. Nominal tags with equality-only semantics.

---

## Perspective and Branch (v0: Default-Only)

Perspective governs semantic coordinate frame interpretation. Branch isolation ensures preview/undo safety. Runtime storage is keyed by branch + instance lane identity (Invariant I35).

---

## Inference Types (Frontend-Only)

The type solver requires type variables in payload and unit positions. These Inference types MUST NOT escape the frontend boundary.

```typescript
type InferencePayloadType =
  | PayloadType                          // All concrete payload kinds
  | { kind: 'var'; var: PayloadVarId };  // Inference variable

type InferenceUnitType =
  | UnitType                          // All 6 structured unit kinds
  | { kind: 'var'; var: UnitVarId };  // Inference variable

type InferenceCanonicalType = {
  readonly payload: InferencePayloadType;
  readonly unit: InferenceUnitType;
  readonly extent: Extent;
};
```

---

## ConstValue

Constants are stored as a discriminated union keyed by payload kind.

```typescript
type ConstValue =
  | { kind: 'float'; value: number }
  | { kind: 'int'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'vec2'; value: [number, number] }
  | { kind: 'vec3'; value: [number, number, number] }
  | { kind: 'color'; value: [number, number, number, number] }
  | { kind: 'cameraProjection'; value: CameraProjection };
```

---

## Type Constructors

### canonicalValue(payload, unit, cardinality)
- Creates a `CanonicalType` with specified payload, unit, and cardinality.
- All other axes: default instantiated values.

### canonicalEvent(instance?)
- Creates: payload=bool, unit=none, temporality=discrete.
- If instance is provided, cardinality=many(instance), otherwise cardinality=one.

---

## CombineMode Restrictions by PayloadType

CombineMode defines how multiple writers to the same bus are resolved.

| PayloadType | Allowed CombineModes |
|-------------|---------------------|
| `float` | sum, product, min, max, last, first |
| `int` | sum, product, min, max, last, first |
| `vec2` | sum, last, first |
| `vec3` | sum, last, first |
| `color` | sum, last, first, blend |
| `bool` | or, and, last, first |
| `shape2d` | last, first |

---

## Domain System

### Domain vs Instance

| Concept | Question | Example |
|---------|----------|---------|
| **Domain** | "What kind of thing?" | shape, circle, particle |
| **Instance** | "How many of them?" | 100 circles |

### Domain Hierarchy (Subtyping)

Domains form a subtyping hierarchy (e.g., `circle` extends `shape`). Subtypes are covariant in array positions.

### Instance Declaration (InstanceDecl)

An `InstanceDecl` specifies a per-patch collection of elements with a `maxCount` (pool size) and `lifecycle`.

---

## Phase Type Semantics

Phase is `float` with `unit: { kind: 'angle', unit: 'phase01' }`.

| Operation | Result |
|-----------|--------|
| `phase + float` | `phase` |
| `phase * float` | `phase` |
| `phase + phase` | **TYPE ERROR** |

---

## See Also

- [02-block-system](./02-block-system.md) - How blocks use CanonicalType
- [04-compilation](./04-compilation.md) - Naga lowering and GpuLayout
- [20-type-validation](./20-type-validation.md) - Enforcement gate and guardrails
