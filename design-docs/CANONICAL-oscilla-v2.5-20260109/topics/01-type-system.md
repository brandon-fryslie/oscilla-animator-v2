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

Every value — whether it represents a signal, a field, an event, a constant, or any future classification — has exactly one type: `CanonicalType`. There is no second type system, no parallel representation, no "also stores type info" field.

Signal, field, and event are **derived classifications** — computed from CanonicalType axes via `deriveKind()`, never stored as authoritative data.

```typescript
// CORRECT: derive classification from type
if (deriveKind(type) === 'field') { ... }

// WRONG: store classification as authoritative
interface Port { kind: 'signal' | 'field' | 'event'; ... }  // VIOLATION
```

### Why This Cannot Change

Without single type authority:
- Every subsystem needs its own type representation — N representations that drift
- Type-dependent dispatch (kernels, adapters, continuity) becomes "which type do I trust?"
- Refactoring any type concept requires updating N places instead of 1
- Testing type invariants requires testing N systems, not 1

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
1. **Every value has a type**: No value-producing node/expr/slot exists without `type: CanonicalType`
2. **Type is sufficient**: No additional "kind" or "family" field is needed — derive from axes
3. **Payload determines stride**: `payloadStride(type.payload)` is the only source of stride information
4. **Unit is semantic**: Unit describes what the numbers mean, not how they're stored
5. **Extent is orthogonal**: The 5 axes are independent dimensions; each can vary independently

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
| `cameraProjection` | Camera projection mode | 16 | Closed enum (see below) |
| `shape2d` | 2D shape reference | 8 | Packed u32 words (opaque handle) |
| `shape3d` | 3D shape reference (T3) | 12 | Packed u32 words (opaque handle, future) |

### Stride

Stride is ALWAYS derived from payload via `payloadStride()`. Never stored as a separate field. Never used as a parallel type system.

```typescript
function payloadStride(payload: PayloadType): number;
// float=1, int=1, bool=1, vec2=2, vec3=3, color=4, cameraProjection=16, shape2d=8, shape3d=12
```

### Important Notes

- `float` and `int` are **PayloadTypes** (domain model); `number` is **TypeScript-only** (implementation detail)
- PayloadType does **NOT** include `'event'` or `'domain'`
- Phase is `float` with `unit: { kind: 'angle', unit: 'phase01' }` (see [Phase Semantics](#phase-type-semantics))
- Adding a new payload kind is a foundational change

### CameraProjection Enum

`cameraProjection` is a closed string enum, NOT a 4×4 matrix:

```typescript
type CameraProjection = 'orthographic' | 'perspective';  // closed set
```

### Opaque Handle Payloads

`shape2d` and `shape3d` are **opaque handle payloads** — they refer to geometry definitions rather than representing computable values. Unlike arithmetic types (float, vec2, etc.), you cannot add, multiply, or interpolate handle values.

**Valid operations**: equality comparison, assignment, pass-through
**Invalid operations**: arithmetic, interpolation, combine modes (except `last`/`first`)

#### shape2d: Handle Type

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

#### shape3d: Handle Type (T3 Future Extension)

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

---

## UnitType (8 Structured Kinds)

Semantic interpretation of a value's numbers. Structured nesting with 8 top-level kinds.

```typescript
type UnitType =
  | { kind: 'none' }
  | { kind: 'scalar' }
  | { kind: 'norm01' }
  | { kind: 'count' }
  | { kind: 'angle'; unit: 'radians' | 'degrees' | 'phase01' }
  | { kind: 'time'; unit: 'ms' | 'seconds' }
  | { kind: 'space'; space: 'ndc' | 'world' | 'view'; dims: 2 | 3 }
  | { kind: 'color'; space: 'rgba01' };
```

**Hard constraints**:
- No `{ kind: 'var' }` inside `UnitType` — unit variables exist only in inference-only wrappers during type solving
- Unit semantics are only changed by explicit ops (adapter blocks, unit-converting kernels)
- `defaultUnitForPayload()` is NOT used by type checking; it is allowed only for UI display defaults or explicit authoring helpers

### Benefits of Structured Nesting

- Adapter matching can operate on "is this an angle?" rather than checking 3 separate kinds
- Unit conversion within a family (radians↔degrees) is structurally encoded
- The flat explosion of `ndc2/ndc3/world2/world3/view2/view3` collapses to parameterized `space`

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

### The Five Axes

| Axis | Value Type | Question | Default |
|------|-----------|----------|---------|
| cardinality | `CardinalityValue` | How many lanes? | `one` |
| temporality | `TemporalityValue` | When does it exist? | `continuous` |
| binding | `BindingValue` | What is it about? | `unbound` |
| perspective | `PerspectiveValue` | From whose viewpoint? | `default` |
| branch | `BranchValue` | Which timeline? | `default` |

---

## Axis Polymorphism Pattern: Axis\<T, V\>

The canonical axis representation.

```typescript
type Axis<T, V> =
  | { kind: 'var'; var: V }    // Type variable (inference only)
  | { kind: 'inst'; value: T }  // Instantiated value
```

**Hard constraints**:
- `var` branches MUST NOT escape the frontend boundary into backend/runtime/renderer
- After type solving, all axes are `{ kind: 'inst'; value: ... }`
- Default values are expressed by constructors producing `inst` values, never by a third axis variant
- `var` is NOT "default" — it is an inference variable carrying a typed ID

### Axis Type Specializations

```typescript
type CardinalityAxis = Axis<CardinalityValue, CardinalityVar>;
type TemporalityAxis = Axis<TemporalityValue, TemporalityVar>;
type BindingAxis     = Axis<BindingValue, BindingVar>;
type PerspectiveAxis = Axis<PerspectiveValue, PerspectiveVar>;
type BranchAxis      = Axis<BranchValue, BranchVar>;
```

---

## Cardinality (How Many Lanes)

```typescript
type CardinalityValue =
  | { kind: 'zero' }                          // compile-time constant, no runtime lanes
  | { kind: 'one' }                           // single lane (Signal)
  | { kind: 'many'; instance: InstanceRef };  // N lanes aligned by instance (Field)
```

### Cardinality Semantics

| Cardinality | Concept | Runtime Representation | Use Case |
|-------------|---------|------------------------|----------|
| `zero` | Constant | Inlined constant (compile-time-only) | Parameters, constants |
| `one` | Signal | Single slot per frame | Per-frame values |
| `many(instance)` | Field | Array of N slots per frame | Per-element values |

### zero: Compile-Time-Only

`zero` means compile-time-only. The value exists at compile time, produces no runtime lanes, and occupies no per-frame storage.

- `zero` is NOT "scalar" — scalar is `cardinality=one + temporality=continuous`
- No implicit coercion from zero into runtime cardinalities
- Only explicit lift ops: `broadcastConstToSignal(const)`: zero → one, `broadcastConstToField(const, instance)`: zero → many(instance)
- Allowed for: const, compile-time table lookups, folded pure kernels whose args are all zero
- Forbidden for: anything that reads time, state, events, instance intrinsics, or runtime inputs

### many(instance): Instance Identity in Type

The `InstanceRef` inside `many` is the ONLY place instance identity lives. Per invariant I32, there must be no separate `instanceId` field on expressions that carry `type: CanonicalType`.

```typescript
type InstanceRef = {
  readonly instanceId: InstanceId;   // branded
  readonly domainTypeId: DomainTypeId; // branded
};
```

### Instance Extraction Helpers

```typescript
function tryGetManyInstance(t: CanonicalType): InstanceRef | null;
// Returns InstanceRef if cardinality=many(instance), null otherwise.
// Never throws. Use in UI, diagnostics, when handling incomplete types.

function requireManyInstance(t: CanonicalType): InstanceRef;
// Returns InstanceRef. Throws crisp error if not many-instanced.
// Use in compiler backend, lowering, field-expected paths.
```

### Cardinality Transforms

Only explicit operations change cardinality:

| Operation | From | To | Notes |
|-----------|------|----|-------|
| Broadcast (const→signal) | zero | one | Explicit lift |
| Broadcast (const→field) | zero | many(instance) | Explicit lift |
| Broadcast (signal→field) | one | many(instance) | Requires explicit adapter |
| Reduce (field→signal) | many(instance) | one | Requires explicit reducer |

### Instance Alignment

Two `many` values are aligned iff they reference the **same InstanceId**. No mapping/resampling in v0.

---

## Temporality (When)

```typescript
type TemporalityValue =
  | { kind: 'continuous' }  // value exists every frame/tick
  | { kind: 'discrete' };   // event occurrences only
```

### Temporality Semantics

| Temporality | Description | Evaluation |
|-------------|-------------|------------|
| `continuous` | Value exists every frame | Once per frame |
| `discrete` | Event occurrences only | When event fires |

### Event Hard Invariants

Discrete temporality implies event semantics:
- `temporality=discrete` ⇒ `payload=bool` (always)
- `temporality=discrete` ⇒ `unit=none` (always)

There are no "discrete float" or "discrete vec3" values. If you need a value that changes at event boundaries, use a continuous value gated by an event (via `eventRead` kernel).

### Discrete Never Implicitly Fills Time

Discrete outputs do NOT become continuous signals unless an explicit stateful operator performs that conversion (SampleAndHold, etc.). This keeps causality explicit.

### Event Read Pattern

`eventRead` produces a continuous float signal (0.0/1.0), NOT a discrete event. The IR builder MUST NOT accept a caller-provided type for eventRead — the builder sets the type internally:

```typescript
canonicalSignal({ kind: 'float' }, { kind: 'scalar' })
```

---

## Binding (Nominal Tags, NOT a Lattice)

```typescript
type BindingValue =
  | { kind: 'unbound' }
  | { kind: 'weak' }
  | { kind: 'strong' }
  | { kind: 'identity' };
```

**Critical**: BindingValue has **NO ordering**. The values are nominal tags with equality-only semantics. It is NOT a lattice, NOT a partial order. There are no "join" or "meet" operations. There is no "stronger/weaker" relationship.

### Tag Semantics

- **unbound**: No continuity identity requirement. Safe default.
- **weak**: Continuity may attempt association if a referent is available in the operation config.
- **strong**: Continuity requires a referent association. Missing referent is a compile error.
- **identity**: Continuity must preserve lane identity 1:1 (stable IDs).

### Binding is Independent of Domain

The same domain can host unbound image vs bound mask. Domain is topology; binding is aboutness.

### Referent Data

No referent data lives in BindingValue or CanonicalType. Referent data lives in continuity policies and state/continuity ops as explicit args.

**v0 Behavior**: Binding uses canonical default (`unbound`) everywhere. The axis exists for future extensibility.

### Unification

During type inference, if two bindings differ and both are instantiated, it is a **type error** (or requires an explicit adapter). There is no "choose the stronger binding" logic.

---

## Perspective and Branch (v0: Default-Only)

### Perspective

```typescript
// v0 (current)
type PerspectiveValue = { kind: 'default' };

// v1+ (future — included for completeness)
type PerspectiveValue =
  | { kind: 'default' }
  | { kind: 'world' }
  | { kind: 'view'; viewId: ViewId }
  | { kind: 'screen'; screenId: ScreenId };
```

Perspective governs semantic coordinate frame interpretation, not the rendering API:
- World-space values can be transformed to view-space via camera projection
- View-space values from different views cannot be directly compared
- Screen-space values are resolution-dependent

Changing perspective requires an explicit adapter (e.g., world→view transform).

### Branch

```typescript
// v0 (current)
type BranchValue = { kind: 'default' };

// v1+ (future — included for completeness)
type BranchValue =
  | { kind: 'default' }
  | { kind: 'main' }
  | { kind: 'preview'; previewId: PreviewId }
  | { kind: 'checkpoint'; checkpointId: CheckpointId }
  | { kind: 'undo'; undoId: UndoId }
  | { kind: 'prediction'; predictionId: PredictionId }
  | { kind: 'speculative'; speculativeId: SpeculativeId }
  | { kind: 'replay'; replayId: ReplayId };
```

Branch isolation ensures preview changes don't corrupt main state, undo operates on its own timeline, and speculative execution is sandboxed. Per invariant I35, runtime storage is keyed by branch + instance lane identity.

---

## Derived Classifications

Signal, field, and event are computed from CanonicalType axes, never stored.

### deriveKind()

```typescript
function deriveKind(type: CanonicalType): 'signal' | 'field' | 'event' {
  const card = getInstValue(type.extent.cardinality);
  const temp = getInstValue(type.extent.temporality);

  // Priority: event > field > signal
  if (temp.kind === 'discrete') return 'event';
  if (card.kind === 'many') return 'field';
  return 'signal';
}
```

**Properties**:
- Total over fully instantiated types
- Deterministic: same input always produces same output
- Priority-ordered: discrete temporality > many cardinality > default (signal)
- Throws if axes contain `{ kind: 'var' }` — use `tryDeriveKind` for inference paths
- `cardinality=zero` derives as 'signal' (compile-time scalar)

### tryDeriveKind()

```typescript
function tryDeriveKind(t: CanonicalType | InferenceCanonicalType): DerivedKind | null;
// Returns null when cardinality or temporality axes are { kind: 'var' }.
// Returns 'signal' | 'field' | 'event' when both are instantiated.
// Never throws.
```

**Usage rules**:
- **UI/inference paths** MUST use `tryDeriveKind` (axes may be unresolved)
- **Backend/lowered paths** MUST use strict `deriveKind` (all axes guaranteed instantiated)

### Derived Type Table

| Concept | Cardinality | Temporality | Definition |
|---------|-------------|-------------|------------|
| **Signal** | `one` | `continuous` | Single-lane per-frame value |
| **Field** | `many(domain)` | `continuous` | Per-element per-frame value |
| **Trigger** | `one` | `discrete` | Single event stream |
| **Per-lane Event** | `many(domain)` | `discrete` | Per-element event stream |

### Boolean Check Helpers

```typescript
function isSignalType(t: CanonicalType): boolean;  // cardinality=one, temporality=continuous
function isFieldType(t: CanonicalType): boolean;    // cardinality=many(instance)
function isEventType(t: CanonicalType): boolean;    // temporality=discrete
```

### Assertion Helpers

```typescript
function requireSignalType(t: CanonicalType): void;           // throws if not signal
function requireFieldType(t: CanonicalType): InstanceRef;      // throws if not field, returns InstanceRef
function requireEventType(t: CanonicalType): void;              // throws if not event
```

---

## Inference Types (Frontend-Only)

The type solver and frontend inference machinery require type variables in payload and unit positions. These inference-only wrappers extend canonical types with var branches. They MUST NOT escape the frontend boundary.

```typescript
type InferencePayloadType =
  | PayloadType                          // All concrete payload kinds
  | { kind: 'var'; var: PayloadVarId };  // Inference variable

type InferenceUnitType =
  | UnitType                          // All 8 structured unit kinds
  | { kind: 'var'; var: UnitVarId };  // Inference variable

type InferenceCanonicalType = {
  readonly payload: InferencePayloadType;
  readonly unit: InferenceUnitType;
  readonly extent: Extent;  // Extent already has var support via Axis<T, V>
};
```

### Boundary Rule

| Component | Canonical (backend) | Inference (frontend) |
|-----------|-------------------|---------------------|
| Payload | `PayloadType` (concrete only) | `InferencePayloadType` (+ var) |
| Unit | `UnitType` (concrete only) | `InferenceUnitType` (+ var) |
| Extent axes | `Axis<T, never>` (inst only) | `Axis<T, V>` (inst + var) |

These types MUST NOT appear in: Backend IR, runtime state, renderer, or any serialized structure.

---

## ConstValue

Constants are stored as a discriminated union keyed by payload kind, NOT as `number | string | boolean`.

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

The ConstValue's kind MUST match `type.payload.kind`. Validated by `constValueMatchesPayload()`.

### EventExprNever Pattern

The "never fires" event is canonically: `{ kind: 'const', type: canonicalEventOne(), value: { kind: 'bool', value: false } }`

---

## Constructor Contracts

### canonicalSignal(payload, unit?)
- Creates: cardinality=one, temporality=continuous
- Default unit: `{ kind: 'scalar' }` (convenience only, never inference fallback)
- All other axes: default instantiated values

### canonicalField(payload, unit, instance)
- Creates: cardinality=many(instance), temporality=continuous
- Unit: REQUIRED (no default — field values are domain-attached)

### canonicalConst(payload, unit)
- Creates: cardinality=zero, temporality=continuous
- Zero means compile-time-only — no runtime lanes

### canonicalEventOne()
- Creates: payload=bool, unit=none, cardinality=one, temporality=discrete

### canonicalEventField(instance)
- Creates: payload=bool, unit=none, cardinality=many(instance), temporality=discrete

---

## CombineMode Restrictions by PayloadType

CombineMode defines how multiple writers to the same bus are resolved. Not all modes are valid for all payload types.

| PayloadType | Allowed CombineModes | Rationale |
|-------------|---------------------|-----------|
| `float` | sum, product, min, max, last, first | Full arithmetic |
| `int` | sum, product, min, max, last, first | Full arithmetic |
| `vec2` | sum, last, first | Component-wise sum; min/max ambiguous |
| `vec3` | sum, last, first | Component-wise sum; min/max ambiguous |
| `color` | sum, last, first, blend | Color-specific blend mode |
| `bool` | or, and, last, first | Boolean logic |
| `shape2d` | last, first | **Opaque handle — non-arithmetic** |
| `shape3d` | last, first | **Opaque handle — non-arithmetic** |

### CombineMode Invariants

1. **No payload type change**: CombineMode never changes the PayloadType of the bus
2. **No cardinality increase**: CombineMode never increases cardinality (no fan-out)
3. **No composite allocation**: CombineMode never allocates new composite values
4. **Pure function over fixed-size representation**: CombineMode must be definable as a pure function `(accumulator: T, incoming: T) → T` where T is a fixed-size value

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

| Concept | Question | Example |
|---------|----------|---------|
| **Domain** | "What kind of thing?" | shape, circle, particle |
| **Instance** | "How many of them?" | 100 circles (from pool of 200) |
| **Layout** | "Where are they?" | grid, spiral, random scatter |

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

### Domain Properties (Runtime)

- Domain types are **compile-time** constructs
- Instances are **patch-level** resources
- At runtime: erased to loop bounds + active mask
- **Invariant**: Every instance compiles to dense lanes 0..maxCount-1

---

## Phase Type Semantics

Phase is `float` with `unit: { kind: 'angle', unit: 'phase01' }`. Arithmetic rules:

| Operation | Result | Notes |
|-----------|--------|-------|
| `float(phase01) + float` | `float(phase01)` | Offset |
| `float(phase01) * float` | `float(phase01)` | Scale |
| `float(phase01) + float(phase01)` | **TYPE ERROR** | Invalid |

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

## See Also

- [02-block-system](./02-block-system.md) - How blocks use CanonicalType
- [04-compilation](./04-compilation.md) - Type unification and resolution
- [20-type-validation](./20-type-validation.md) - Enforcement gate and guardrails
- [21-adapter-system](./21-adapter-system.md) - Adapter type patterns
- [Glossary: PayloadType](../GLOSSARY.md#payloadtype)
- [Glossary: Extent](../GLOSSARY.md#extent)
- [Glossary: CanonicalType](../GLOSSARY.md#canonicaltype)
- [Glossary: UnitType](../GLOSSARY.md#unittype)
