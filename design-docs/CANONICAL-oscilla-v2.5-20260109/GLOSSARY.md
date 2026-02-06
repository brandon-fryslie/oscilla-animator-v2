---
parent: INDEX.md
---

# Glossary

> Authoritative definitions for all terms in this specification.

Use these definitions consistently. When in doubt, this is the canonical source.

---

## Core Type System

### PayloadType

**Definition**: The base data shape of a value — what the payload is made of. Closed set of discriminated union kinds.

**Type**: type

**Canonical Form**: `PayloadType = { kind: 'float' } | { kind: 'int' } | { kind: 'bool' } | { kind: 'vec2' } | { kind: 'vec3' } | { kind: 'color' } | { kind: 'cameraProjection' } | { kind: 'shape2d' } | { kind: 'shape3d' }`

Phase is represented as `float` with `unit: { kind: 'angle', unit: 'phase01' }`.

**Stride by PayloadType** (derived via `payloadStride()`, never stored):
- `float`, `int`, `bool` → 1
- `vec2` → 2
- `vec3` → 3
- `color` → 4 (RGBA)
- `cameraProjection` → 16
- `shape2d` → 8 u32 words (opaque handle)
- `shape3d` → 12 u32 words (opaque handle)

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: Does NOT include 'event' or 'domain'. Adding a new payload kind is a foundational change.

---

### Extent

**Definition**: The 5-axis coordinate describing where/when/about-what a value exists. Independent of payload and unit.

**Type**: type

**Canonical Form**: `Extent`

**Structure**:
```typescript
type Extent = {
  cardinality: CardinalityAxis;  // Axis<CardinalityValue, CardinalityVar>
  temporality: TemporalityAxis;  // Axis<TemporalityValue, TemporalityVar>
  binding: BindingAxis;          // Axis<BindingValue, BindingVar>
  perspective: PerspectiveAxis;  // Axis<PerspectiveValue, PerspectiveVar>
  branch: BranchAxis;            // Axis<BranchValue, BranchVar>
};
```

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: Each axis uses `Axis<T, V>` polymorphic pattern.

---

### CanonicalType

**Definition**: The single type authority for all values. Complete type description composed of payload, unit, and extent.

**Type**: type

**Canonical Form**: `CanonicalType`

**Structure**:
```typescript
type CanonicalType = {
  readonly payload: PayloadType;
  readonly unit: UnitType;
  readonly extent: Extent;
};
```

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: The ONLY type authority for all values. No parallel type systems (SignalType, PortType, etc.) may exist. Signal/field/event are derived from axes via `deriveKind()`, never stored.

---

### Axis\<T, V\>

**Definition**: Polymorphic axis representation supporting either a type variable (inference) or an instantiated value.

**Type**: type

**Canonical Form**: `Axis<T, V> = { kind: 'var'; var: V } | { kind: 'inst'; value: T }`

**Hard constraints**: `var` branches MUST NOT escape the frontend boundary into backend/runtime/renderer. After type solving, all axes are `{ kind: 'inst'; value: ... }`.

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### Cardinality

**Definition**: How many lanes a value has.

**Type**: type

**Canonical Form**: `Cardinality`

**Values**:
- `{ kind: 'zero' }` - compile-time constant
- `{ kind: 'one' }` - single lane (Signal)
- `{ kind: 'many'; instance: InstanceRef }` - N lanes aligned by instance (Field)

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: An InstanceRef is an instance of a Domain - it points to the actual instantiation of domain objects (domainType + instanceId).

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

**Definition**: A classification that defines a kind of element. It answers the question: "What type of thing are we talking about?"

**Type**: concept / compile-time classification

**Canonical Form**: `Domain`, `DomainTypeId`, `DomainSpec`

**Specifies**:
1. What kind of thing elements are (shape, particle, control)
2. What operations make sense for that element type
3. What intrinsic properties elements have

**Is NOT**:
- A count of elements (that's an Instance)
- A spatial arrangement (that's Layout)
- A specific instantiation (that's InstanceDecl)

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: Domains form a subtyping hierarchy (e.g., circle extends shape).

---

### DomainSpec

**Definition**: Compile-time type specification for a domain, including its parent (for subtyping) and intrinsic properties.

**Type**: type

**Canonical Form**: `DomainSpec`

**Structure**:
```typescript
interface DomainSpec {
  readonly id: DomainTypeId;
  readonly parent: DomainTypeId | null;
  readonly intrinsics: readonly IntrinsicSpec[];
}
```

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### DomainTypeId

**Definition**: Branded string identifier for a domain type classification.

**Type**: type

**Canonical Form**: `DomainTypeId`

**Structure**: `string & { readonly __brand: 'DomainTypeId' }`

**Examples**: `'shape'`, `'circle'`, `'rectangle'`, `'control'`, `'event'`

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### Instance

**Definition**: A specific collection of domain elements with a count and lifecycle.

**Type**: concept

**Canonical Form**: `Instance`, `InstanceId`, `InstanceDecl`

**Specifies**:
- Which domain type elements belong to
- Pool size (maxCount)
- Current active count
- Lifecycle (static, pooled)

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: Created by the Array block. Referenced by Cardinality axis.

---

### InstanceDecl

**Definition**: Per-patch declaration specifying a collection of domain elements.

**Type**: type

**Canonical Form**: `InstanceDecl`

**Structure**:
```typescript
interface InstanceDecl {
  readonly id: InstanceId;
  readonly domainType: DomainTypeId;
  readonly primitiveId: PrimitiveId;
  readonly maxCount: number;
  readonly countExpr?: SigExprId;
  readonly lifecycle: 'static' | 'pooled';
}
```

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### InstanceId

**Definition**: Branded string identifier for a specific instance collection.

**Type**: type

**Canonical Form**: `InstanceId`

**Structure**: `string & { readonly __brand: 'InstanceId' }`

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### InstanceRef

**Definition**: Reference to an instance, including both domain type and instance ID.

**Type**: type

**Canonical Form**: `InstanceRef`

**Structure**:
```typescript
interface InstanceRef {
  readonly kind: 'instance';
  readonly domainType: DomainTypeId;
  readonly instanceId: InstanceId;
}
```

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### Primitive Block

**Definition**: A block that creates a single element of a specific domain type. Outputs `Signal<T>` (cardinality: one).

**Type**: concept (block category)

**Canonical Form**: `Primitive Block`

**Examples**: Circle, Rectangle, Polygon

**Source**: [02-block-system.md](./topics/02-block-system.md)

**Note**: Part of the three-stage architecture: Primitive → Array → Layout.

---

### Array Block

**Definition**: The cardinality transform block that converts one element into many. Creates an Instance.

**Type**: block

**Canonical Form**: `Array`

**Behavior**: `Signal<T>` → `Field<T, instance>`

**Outputs**: elements, index, t (normalized 0..1), active (bool)

**Source**: [02-block-system.md](./topics/02-block-system.md)

**Note**: The ONLY place where instances are created.

---

### Layout Block

**Definition**: A block that operates on field inputs and outputs positions. Determines spatial arrangement.

**Type**: concept (block category)

**Canonical Form**: `Layout Block`

**Examples**: Grid Layout, Spiral Layout, Random Scatter, Along Path

**Source**: [02-block-system.md](./topics/02-block-system.md)

**Note**: Layout is orthogonal to domain and instance.

---

### Cardinality-Generic Block

**Definition**: A block whose semantic function is per-lane and valid for both Signal (one lane) and Field (many lanes). Lane-local, cardinality-preserving, instance-aligned, and deterministic per lane.

**Type**: concept (block classification property)

**Canonical Form**: `Cardinality-Generic Block`

**Contract**:
1. Lane-locality (no cross-lane dependence)
2. Cardinality preservation (output matches input cardinality)
3. Instance alignment preservation (same InstanceRef on all many operands)
4. Deterministic per-lane execution

**Examples**: Add, Mul, Hash, Noise, UnitDelay, Lag, Phasor, SampleAndHold

**Source**: [02-block-system.md](./topics/02-block-system.md)

**Note**: The compiler specializes each instance to either scalar or field evaluation — no runtime branching on cardinality.

---

### Payload-Generic Block

**Definition**: A block whose semantics are defined over a closed set of payload types such that: the block's behavior is well-defined for each allowed payload, the compiler selects the correct concrete implementation per payload at compile time, and any disallowed payload is a compile-time type error.

**Type**: concept (block classification property)

**Canonical Form**: `Payload-Generic Block`

**Contract**:
1. Closed admissible payload set (AllowedPayloads per port)
2. Total per-payload specialization (every allowed payload has implementation path)
3. No implicit coercions (explicit cast blocks required)
4. Deterministic resolution (fully specialized IR)

**Relationship**: Orthogonal to cardinality-generic. A block may be one, the other, both, or neither.

**Examples**: Add (`{float, vec2, vec3}`), Mul (`{float, vec2, vec3}` + mixed scalar), Normalize (`{vec2, vec3}`)

**Source**: [02-block-system.md](./topics/02-block-system.md)

**Note**: No runtime dispatch on payload. Compiler emits fully specialized IR per resolved payload type.

---

### StateId

**Definition**: Stable identifier for a block's conceptual state array that survives recompilation. Derived from stable anchors: `blockId + primitive_kind [+ state_key_disambiguator]`.

**Type**: type

**Canonical Form**: `StateId`

**Semantics**:
- Identifies the **state array** (the conceptual unit), not individual lanes
- For scalar state: maps to `stride` floats at a slot index
- For field state: maps to a contiguous range of `laneCount × stride` floats
- Lane index is NOT part of StateId — it is a positional offset within the buffer
- Used for state migration during hot-swap (see I3)

**Source**: [05-runtime.md](./topics/05-runtime.md), [02-block-system.md](./topics/02-block-system.md)

---

### Lane

**Definition**: An individual element within a Field. When a value has cardinality `many(instance)`, it contains N lanes — one per element in the instance.

**Type**: concept

**Canonical Form**: `lane`

**Usage**: Lane index is a positional offset (0..N-1) within a field buffer. Lanes can be remapped by continuity; lane index is NOT semantic identity.

**Source**: [01-type-system.md](./topics/01-type-system.md), [02-block-system.md](./topics/02-block-system.md)

---

### Stride

**Definition**: The number of float values per element in a state buffer or slot allocation. Determined by payload type or by the state requirements of a specific primitive.

**Type**: concept (numeric property)

**Canonical Form**: `stride`

**Values by PayloadType**:
- `float`, `int`, `phase`, `bool`, `unit` → 1
- `vec2` → 2
- `vec3` → 3
- `color` → 4

**Note**: State stride may exceed payload stride when a primitive stores multiple values per lane (e.g., a filter storing y and dy has state stride 2 even for float payload).

**Source**: [04-compilation.md](./topics/04-compilation.md), [05-runtime.md](./topics/05-runtime.md)

---

### StateMappingScalar

**Definition**: State migration mapping for a scalar (cardinality: one) stateful block. Maps a stable StateId to an unstable buffer position.

**Type**: type

**Canonical Form**: `StateMappingScalar`

**Structure**:
```typescript
interface StateMappingScalar {
  stateId: StateId;     // stable semantic identity
  slotIndex: number;    // unstable positional offset
  stride: number;       // floats per state element
  initial: number[];    // length = stride
}
```

**Source**: [05-runtime.md](./topics/05-runtime.md)

---

### StateMappingField

**Definition**: State migration mapping for a field (cardinality: many) stateful block. Identifies the entire state buffer for all lanes of an instance.

**Type**: type

**Canonical Form**: `StateMappingField`

**Structure**:
```typescript
interface StateMappingField {
  stateId: StateId;         // stable (identifies the whole state array)
  instanceId: InstanceId;   // ties buffer to lane set identity
  slotStart: number;        // unstable start offset
  laneCount: number;        // N at compile time
  stride: number;           // floats per lane state (>=1)
  initial: number[];        // length = stride (per-lane init template)
}
```

**Note**: Lane index is NOT part of StateId. Migration for field-state uses continuity's lane mapping when identity is stable.

**Source**: [05-runtime.md](./topics/05-runtime.md)

---

### shape2d

**Definition**: A handle/reference PayloadType representing a 2D shape geometry. Unlike arithmetic types, shape2d values cannot be added, multiplied, or interpolated — they are structural references to geometry definitions.

**Type**: PayloadType (handle subclass)

**Canonical Form**: `shape2d`

**Stride**: 8 (u32 words)

**Layout**: TopologyId, PointsFieldSlot, PointsCount, StyleRef, Flags, Reserved×3

**Valid operations**: equality, assignment, pass-through
**Invalid operations**: arithmetic, interpolation, combine modes (except last/first)

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

## Coordinate Spaces

### Local Space

**Definition**: The coordinate system in which geometry and control points are defined. Each shape's geometry is authored relative to its own origin at (0,0) with magnitude O(1).

**Type**: concept (coordinate space)

**Canonical Form**: `Local Space`, `L`

**Source**: [16-coordinate-spaces.md](./topics/16-coordinate-spaces.md)

**Note**: Local space has no relation to final screen position or size. Defined per geometry template, not per instance.

---

### World Space

**Definition**: The normalized coordinate system for instance placement. Range [0..1] in both axes. Layout blocks produce positions in world space.

**Type**: concept (coordinate space)

**Canonical Form**: `World Space`, `W`

**Source**: [16-coordinate-spaces.md](./topics/16-coordinate-spaces.md)

**Note**: All position outputs from layout blocks are in world space.

---

### Viewport Space

**Definition**: The backend-specific output coordinate system (pixels, SVG viewBox units, WebGL clip space). The renderer maps world space to viewport space.

**Type**: concept (coordinate space)

**Canonical Form**: `Viewport Space`, `V`

**Source**: [16-coordinate-spaces.md](./topics/16-coordinate-spaces.md)

**Note**: Not visible to patch logic — patches work exclusively in world space.

---

### scale

**Definition**: The isotropic local→world scale factor expressed in world-normalized units. Type: `Signal<float>` or `Field<float>`. Backend mapping: `scalePx = scale × min(viewportWidth, viewportHeight)`.

**Type**: concept (transform parameter)

**Canonical Form**: `scale`

**Reference dimension**: `min(viewportWidth, viewportHeight)` — ensures aspect-independent sizing.

**Source**: [16-coordinate-spaces.md](./topics/16-coordinate-spaces.md)

**Note**: Reference dimension: `min(viewportWidth, viewportHeight)` ensures aspect-independent sizing.

---

### scale2

**Definition**: Optional anisotropic scale factor. Type: `Signal<vec2>` or `Field<vec2>`. Combined with scale: `S_effective = (scale × scale2.x, scale × scale2.y)`.

**Type**: concept (transform parameter)

**Canonical Form**: `scale2`

**Source**: [16-coordinate-spaces.md](./topics/16-coordinate-spaces.md)

---

## Render IR

### RenderFrameIR

**Definition**: The render intermediate representation produced by the materializer. A sequence of draw operations (passes), each combining local-space geometry with world-space instance transforms.

**Type**: type

**Canonical Form**: `RenderFrameIR`

**Structure**:
```typescript
interface RenderFrameIR {
  passes: RenderPassIR[];
}
```

**Source**: [06-renderer.md](./topics/06-renderer.md)

**Note**: Draw-op-centric model. Each pass contains draw operations that reference geometry templates and instance transforms.

---

### DrawPathInstancesOp

**Definition**: Primary render operation combining a local-space geometry template with world-space instance transforms and shared style.

**Type**: type

**Canonical Form**: `DrawPathInstancesOp`

**Structure**:
```typescript
interface DrawPathInstancesOp {
  geometry: PathGeometryTemplate;
  instances: PathInstanceSet;
  style: PathStyle;
}
```

**Source**: [06-renderer.md](./topics/06-renderer.md)

**Note**: Enables natural batching — instances sharing geometry+style are pre-grouped.

---

### PathGeometryTemplate

**Definition**: Geometry defined in local space. Contains control points centered at (0,0) with topology identification.

**Type**: type

**Canonical Form**: `PathGeometryTemplate`

**Source**: [06-renderer.md](./topics/06-renderer.md)

---

### PathInstanceSet

**Definition**: Per-instance world-space transforms in SoA (Structure of Arrays) layout for efficient batching. Contains parallel arrays of positions, rotations, and scales.

**Type**: type

**Canonical Form**: `PathInstanceSet`

**Source**: [06-renderer.md](./topics/06-renderer.md)

---

## Execution Architecture

### Opcode Layer

**Definition**: Layer 1 of the three-layer execution architecture. Pure scalar numeric operations (`number[] → number`) with no domain semantics. Generic math only.

**Type**: concept (architectural layer)

**Canonical Form**: `Opcode Layer`

**Examples**: sin, cos, add, mul, clamp, lerp, hash

**Source**: [05-runtime.md](./topics/05-runtime.md)

---

### Signal Kernel

**Definition**: Layer 2 of the three-layer execution architecture. Domain-specific `scalar → scalar` functions with documented domain/range contracts.

**Type**: concept (architectural layer)

**Canonical Form**: `Signal Kernel`

**Categories**: Oscillators (phase→[-1,1]), Easing (t∈[0,1]→u∈[0,1]), Noise (any→[0,1))

**Source**: [05-runtime.md](./topics/05-runtime.md)

---

### Field Kernel

**Definition**: Layer 3 of the three-layer execution architecture. Vec2/color/field operations applied lane-wise across field buffers.

**Type**: concept (architectural layer)

**Canonical Form**: `Field Kernel`

**Categories**: Geometry, Color, Effects

**Source**: [05-runtime.md](./topics/05-runtime.md)

---

### Materializer

**Definition**: The orchestrator that interprets IR, allocates buffers, dispatches to the three execution layers (opcode, signal kernel, field kernel), and writes to render sinks. Not a layer itself.

**Type**: concept (architectural component)

**Canonical Form**: `Materializer`

**Source**: [05-runtime.md](./topics/05-runtime.md)

---

## Derived Type Concepts

### Field

**Definition**: A CanonicalType where `cardinality = many(domain)` and `temporality = continuous`.

**Type**: concept (type constraint)

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: UI still uses "field" terminology; it's a constraint, not a separate type.

---

### Signal

**Definition**: A CanonicalType where `cardinality = one` and `temporality = continuous`.

**Type**: concept (type constraint)

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### Trigger

**Definition**: A CanonicalType where `cardinality = one` and `temporality = discrete`.

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
// Minimum variants; implementations may extend with additional kinds.
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
- `lens` - transform/adapter

**Source**: [02-block-system.md](./topics/02-block-system.md)

---

### EdgeRole

**Definition**: Discriminated union identifying edge purpose.

**Type**: type

**Canonical Form**: `EdgeRole`

**Values**: `user`, `default`, `auto`

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

**CanonicalType**: `one + continuous + int`

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

### RenderAssembler

**Definition**: The runtime component that produces RenderFrameIR by walking render sinks, materializing field buffers, resolving shape2d handles, reading scalar banks, and executing camera projection. Lives in runtime, not renderer.

**Type**: concept (architectural component)

**Canonical Form**: `RenderAssembler`

**Responsibilities**:
1. Materialize required fields via Materializer
2. Read scalar banks for uniforms
3. Execute camera projection (world → screen transform)
4. Resolve shape2d → (topologyId, pointsBuffer, flags/style)
5. Group into passes and output RenderFrameIR

**Source**: [05-runtime.md](./topics/05-runtime.md), [18-camera-projection.md](./topics/18-camera-projection.md)

**Note**: Enforces I15 (Renderer is sink-only). All IR interpretation happens here, not in renderer.

---

### RenderBackend

**Definition**: Generic interface implemented by each render target (Canvas2D, SVG, WebGL). Consumes RenderFrameIR, performs rasterization only.

**Type**: interface

**Canonical Form**: `RenderBackend<TTarget>`

**Structure**:
```typescript
interface RenderBackend<TTarget> {
  beginFrame(target: TTarget, frameInfo: FrameInfo): void;
  executePass(pass: RenderPassIR): void;
  endFrame(): void;
}
```

**Source**: [06-renderer.md](./topics/06-renderer.md)

**Note**: Backends must not force changes to the meaning of RenderIR. Backend-specific adaptations are backend-local.

---

### PathTopologyDef

**Definition**: Immutable structural definition of a path shape — the verbs (move, line, quad, cubic, close) and their arities. Registered at compile/init time and referenced by numeric ID.

**Type**: type

**Canonical Form**: `PathTopologyDef`

**Structure**:
```typescript
interface PathTopologyDef {
  verbs: Uint8Array;           // Sequence of path verbs
  pointsPerVerb: Uint8Array;   // Number of control points each verb consumes
}
```

**Source**: [06-renderer.md](./topics/06-renderer.md)

**Note**: Immutable once registered. Control points change per-frame; topology does not. `closed` derives from verbs (last verb = close).

---

### RenderInstances2D

**Definition**: Primary render sink block.

**Type**: block

**Canonical Form**: `RenderInstances2D`

**Source**: [06-renderer.md](./topics/06-renderer.md)

---

### projectWorldToScreenOrtho

**Definition**: Orthographic projection kernel that transforms `Field<vec3>` worldPosition into screen-space coordinates. Default projection mode. Guarantees identity mapping at z=0 (worldX = screenX, worldY = screenY).

**Type**: kernel (pure function)

**Canonical Form**: `projectWorldToScreenOrtho`

**Output Contract**: `{ screenPosition: Field<vec2>, depth: Field<float>, visible: Field<bool> }`

**Source**: [18-camera-projection.md](./topics/18-camera-projection.md)

**Note**: Not a graph block. Executed by RenderAssembler as mandatory post-schedule stage.

---

### projectWorldToScreenPerspective

**Definition**: Perspective projection kernel with camera position, tilt, yaw, and field-of-view. Used for momentary preview (Shift) or when Camera block sets projection=1.

**Type**: kernel (pure function)

**Canonical Form**: `projectWorldToScreenPerspective`

**Output Contract**: `{ screenPosition: Field<vec2>, depth: Field<float>, visible: Field<bool> }`

**Source**: [18-camera-projection.md](./topics/18-camera-projection.md)

**Note**: Preview mode must not change compilation, state, or export.

---

### Camera Block

**Definition**: Render-side declaration block that modulates projection parameters. Exactly 0 or 1 per patch. Has input ports (modulatable) but does not produce outputs for other nodes.

**Type**: block (render-side declaration)

**Canonical Form**: `Camera`

**Cardinality**: 0 or 1 per patch (2+ is compile error)

**Ports**: center (vec2), distance (float), tilt (float), yaw (float), fovY (float), near (float), far (float), projection (int: 0=ortho, 1=perspective)

**Source**: [18-camera-projection.md](./topics/18-camera-projection.md)

**Note**: Same category as render sinks. Multi-camera only when multi-view render target model exists (future).

---

### visible

**Definition**: Contract output field from projection kernel indicating whether each instance should be drawn. Renderers MUST NOT re-derive visibility.

**Type**: concept (projection output field)

**Canonical Form**: `visible` (field name), `Field<bool>` (type)

**Source**: [18-camera-projection.md](./topics/18-camera-projection.md)

**Note**: Single-enforcer principle — visibility determined once by projection kernel, not by renderer.

---

### depth

**Definition**: Normalized distance from camera, range [0, 1], where 0=near plane, 1=far plane. Primary key for stable depth ordering (far-to-near).

**Type**: concept (projection output field)

**Canonical Form**: `depth` (field name), `Field<float>` (type)

**Source**: [18-camera-projection.md](./topics/18-camera-projection.md)

**Note**: Renderer must draw in stable depth order every pass. Historically referred to as `depthSlot`.

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

- **PascalCase**: `CanonicalType`, `PayloadType`, `BlockRole`, `Extent`
- No generic syntax in names: `CanonicalType`, not `Signal<T>`

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
  | { t: 'float'; v: number; unit?: 'phase01' }
  | { t: 'bool'; v: 0|1 }
  | { t: 'trigger'; v: 0|1 }
  | { t: 'none' }
  | { t: 'err'; code: string };
```

**Source**: [08-observation-system.md](./topics/08-observation-system.md)

**Note**: Never includes Field contents or large arrays.

---

### Chain

**Definition**: The tree of blocks reachable from a selected block by traversing edges without reversing direction (downstream only OR upstream only, not both from any given node).

**Type**: concept

**Canonical Form**: `Chain`

**Source**: [15-graph-editor-ui.md](./topics/15-graph-editor-ui.md)

**Related**: [Pivot Block](#pivot-block), [Focused Subgraph](#focused-subgraph)

**Example**: From block `h` in graph `a → b → c → f → g → h`, the chain includes `{h, g, f, c, b, a}` (all upstream), but NOT blocks downstream of `g` because that would require reversal.

---

### Pivot Block

**Definition**: A block with multiple inputs OR multiple outputs where perspective can rotate to focus on different subgraph paths.

**Type**: concept

**Canonical Form**: `Pivot Block`

**Source**: [15-graph-editor-ui.md](./topics/15-graph-editor-ui.md)

**Related**: [Chain](#chain), [Perspective Rotation](#perspective-rotation)

**Example**: A combine block with 3 inputs is a pivot block - user can rotate to focus upstream via any of the 3 input paths.

---

### Focused Subgraph

**Definition**: The currently visible chain of blocks displayed at full opacity in the graph editor.

**Type**: UI state

**Canonical Form**: `Focused Subgraph`

**Source**: [15-graph-editor-ui.md](./topics/15-graph-editor-ui.md)

**Related**: [Chain](#chain), [Dimmed Subgraph](#dimmed-subgraph)

**Note**: When block `c` is selected, the focused subgraph is all blocks in `c`'s chain.

---

### Dimmed Subgraph

**Definition**: Blocks not in the current chain, rendered at reduced opacity (faded but visible).

**Type**: UI state

**Canonical Form**: `Dimmed Subgraph`

**Source**: [15-graph-editor-ui.md](./topics/15-graph-editor-ui.md)

**Related**: [Chain](#chain), [Focused Subgraph](#focused-subgraph)

**Note**: When focusing on one branch of a split, the other branch becomes dimmed (30% opacity).

---

### Perspective Rotation

**Definition**: UI interaction (typically right-click context menu) to change which path through a pivot block is "forward" and which is dimmed.

**Type**: UI interaction

**Canonical Form**: `Perspective Rotation`

**Source**: [15-graph-editor-ui.md](./topics/15-graph-editor-ui.md)

**Related**: [Pivot Block](#pivot-block), [Chain](#chain)

**Example**: Right-clicking a block with 2 downstream outputs shows menu: "Focus downstream path: • To [block H] • To [block I]"

---

## Type Validation & Adapter Terms

### UnitType

**Definition**: Semantic interpretation of a value's numbers. 8 structured kinds with no `var` branch in canonical type.

**Type**: type

**Canonical Form**: `none | scalar | norm01 | count | angle(radians|degrees|phase01) | time(ms|seconds) | space(ndc|world|view, dims:2|3) | color(rgba01)`

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: Unit variables exist only in inference-only wrappers (`InferenceUnitType`), never in `UnitType`.

---

### DerivedKind

**Definition**: Classification (signal/field/event) derived from CanonicalType axes. NOT stored, NOT authoritative.

**Type**: concept

**Canonical Form**: `deriveKind(type): 'signal' | 'field' | 'event'`

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Related**: [tryDeriveKind](#tryderivekind)

---

### tryDeriveKind

**Definition**: Partial helper returning DerivedKind or null when axes contain variables. Safe for UI/inference paths.

**Type**: function

**Canonical Form**: `tryDeriveKind(t: CanonicalType | InferenceCanonicalType): DerivedKind | null`

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: UI/inference paths MUST use `tryDeriveKind`; backend MUST use strict `deriveKind`.

---

### payloadStride

**Definition**: Function returning scalar lane count for a payload kind. ALWAYS derived, never stored.

**Type**: function

**Canonical Form**: `payloadStride(payload: PayloadType): number`

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### tryGetManyInstance

**Definition**: Pure query helper. Returns InstanceRef if cardinality=many, null otherwise. Never throws.

**Type**: function

**Canonical Form**: `tryGetManyInstance(t: CanonicalType): InstanceRef | null`

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### requireManyInstance

**Definition**: Asserts field-ness. Returns InstanceRef. Throws if not many-instanced.

**Type**: function

**Canonical Form**: `requireManyInstance(t: CanonicalType): InstanceRef`

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### InferenceCanonicalType

**Definition**: Inference-only type wrapper allowing payload and unit variables. MUST NOT escape frontend/solver boundary.

**Type**: type

**Canonical Form**: `InferenceCanonicalType = { payload: InferencePayloadType; unit: InferenceUnitType; extent: Extent }`

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### InferencePayloadType

**Definition**: Inference-only payload type with var branch for type variables.

**Type**: type

**Canonical Form**: `InferencePayloadType = PayloadType | { kind: 'var'; var: PayloadVarId }`

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### ConstValue

**Definition**: Discriminated union for constant values, keyed by payload kind. NOT `number | string | boolean`.

**Type**: type

**Canonical Form**: `{ kind: PayloadKind, value: ... }` — cameraProjection uses closed enum.

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### validateAxes

**Definition**: Single enforcement point for axis validity. Produces AxisViolation diagnostics.

**Type**: function

**Canonical Form**: `validateAxes(exprs: readonly ValueExpr[]): AxisViolation[]`

**Source**: [20-type-validation.md](./topics/20-type-validation.md)

---

### AxisViolation

**Definition**: Diagnostic produced by axis validation pass when a node violates axis-shape contracts.

**Type**: type

**Canonical Form**: `AxisViolation = { nodeKind: string, nodeIndex: number, message: string }`

**Source**: [20-type-validation.md](./topics/20-type-validation.md)

---

### BindingMismatchError

**Definition**: Structured diagnostic for binding axis unification failures.

**Type**: type

**Canonical Form**: `BindingMismatchError = { left: BindingValue, right: BindingValue, location: ..., remedy: string }`

**Source**: [20-type-validation.md](./topics/20-type-validation.md)

---

### AdapterSpec

**Definition**: Full adapter specification with mandatory purity and stability. Describes how to insert a type-converting block.

**Type**: type

**Canonical Form**: `AdapterSpec`

**Source**: [21-adapter-system.md](./topics/21-adapter-system.md)

---

### TypePattern

**Definition**: Extent-aware type matching pattern for adapter specs. Matches on all 5 axes.

**Type**: type

**Source**: [21-adapter-system.md](./topics/21-adapter-system.md)

---

### ExtentPattern

**Definition**: Pattern for matching extent axes in adapter rules.

**Type**: type

**Source**: [21-adapter-system.md](./topics/21-adapter-system.md)

---

### ExtentTransform

**Definition**: Description of how an adapter transforms extent axes.

**Type**: type

**Source**: [21-adapter-system.md](./topics/21-adapter-system.md)

---

### ValueExpr

**Definition**: Unified expression IR. Uses `kind` discriminant. 6 variants: Const, External, Intrinsic, Kernel, State, Time.

**Type**: type

**Source**: [appendices/type-system-migration.md](./appendices/type-system-migration.md)

---

### CameraProjection

**Definition**: Closed string enum for camera projection modes. NOT a 4×4 matrix.

**Type**: type

**Canonical Form**: `CameraProjection = 'orthographic' | 'perspective'`

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

## Forbidden Terms

Terms that MUST NOT appear in new code. If encountered in existing code, use the canonical term.

| Forbidden | Canonical Term |
|-----------|---------------|
| `DomainTag` | `PayloadType` |
| `ValueType` | `PayloadType` |
| `World` | `Extent` |
| `Type` / `TypeDesc` | `CanonicalType` |
| `Block.type` | `Block.kind` |
| `structural` (role) | `derived` |
| `DomainDecl` | `InstanceDecl` |
| `DomainId` (for instances) | `InstanceId` |
| `DomainRef` | `InstanceRef` |
| `DomainDef` | `InstanceDecl` |
| `DomainN` block | Primitive + Array |
| `GridDomain` block | Primitive + Array + Grid Layout |
| `StateKey { blockId, laneIndex }` | `StateId` + `StateMappingScalar`/`StateMappingField` |
| `RenderIR` | `RenderFrameIR` |
| `RenderInstance` | `DrawPathInstancesOp` + `PathInstanceSet` |
| `GeometryAsset` | `PathGeometryTemplate` |
| `GeometryRegistry` | Topology registry + numeric ID lookup |
| `MaterialAsset` | `PathStyle` |
| `size` (as parameter name) | `scale` |
| `AxisTag<T>` | `Axis<T, V>` |
| `SignalType` | `CanonicalType` |
| `PortType` | `CanonicalType` |
| `FieldType` | `CanonicalType` |
| `EventType` | `CanonicalType` |
| `ResolvedPortType` | `CanonicalType` |
| `getManyInstance` | `tryGetManyInstance` + `requireManyInstance` |
| `TypeSignature` | `TypePattern` |
| `SigExpr` | `ValueExpr` |
| `FieldExpr` | `ValueExpr` |
| `EventExpr` | `ValueExpr` |
