---
command: /canonicalize-architecture design-docs/spec/ Please apply this refinement document to the remaining unresolved questions @"design-docs/spec/_architecture-refinement/ChatGPT-Fundamental Axes in Systems.md"
files: INDEX.md 00-invariants.md AMBIGUITIES.md graph/02-time.md graph/03-buses.md graph/06-blocks.md graph/07-transforms.md graph/08-primitives-composites.md graph/stateful-blocks.md graph/basic-12-blocks.md compiler/01-type-system.md compiler/02-polymorphism.md compiler/03-category-theory.md compiler/04-compilation.md compiler/canonical-types-and-constraints.md compiler/canonical-types-and-constraints-UPDATED.md compiler/maybe-block-defs.md runtime/05-runtime.md renderer/09-renderer.md renderer/RENDER-PIPELINE.md time/10-phase-matching-system.md time/11-phase-unwrap-IMPORTANT.md _architecture-refinement/ChatGPT-Fundamental Axes in Systems.md
indexed: true
source_files:
  - design-docs/spec/INDEX.md
  - design-docs/spec/00-invariants.md
  - design-docs/spec/AMBIGUITIES.md
  - design-docs/spec/graph/02-time.md
  - design-docs/spec/graph/03-buses.md
  - design-docs/spec/graph/06-blocks.md
  - design-docs/spec/graph/07-transforms.md
  - design-docs/spec/graph/08-primitives-composites.md
  - design-docs/spec/graph/stateful-blocks.md
  - design-docs/spec/graph/basic-12-blocks.md
  - design-docs/spec/compiler/01-type-system.md
  - design-docs/spec/compiler/02-polymorphism.md
  - design-docs/spec/compiler/03-category-theory.md
  - design-docs/spec/compiler/04-compilation.md
  - design-docs/spec/compiler/canonical-types-and-constraints.md
  - design-docs/spec/compiler/canonical-types-and-constraints-UPDATED.md
  - design-docs/spec/compiler/maybe-block-defs.md
  - design-docs/spec/runtime/05-runtime.md
  - design-docs/spec/renderer/09-renderer.md
  - design-docs/spec/renderer/RENDER-PIPELINE.md
  - design-docs/spec/time/10-phase-matching-system.md
  - design-docs/spec/time/11-phase-unwrap-IMPORTANT.md
  - design-docs/spec/_architecture-refinement/ChatGPT-Fundamental Axes in Systems.md
---

# Canonical Glossary: Oscilla v2.5

Generated: 2026-01-09T12:00:00Z
Supersedes: CANONICALIZED-GLOSSARY-oscilla-v2-20260108-140000.md
Refinement Applied: Five-axis type system (v2.5)

---

## Naming Changes (from canonicalization + v2.5 refinement)

| Old Term | New Term | Reason |
|----------|----------|--------|
| `DomainTag` | `PayloadType` | Domain is element topology; PayloadType is float/vec2/etc |
| `ValueType` | `PayloadType` | More precise - it's the payload carried by signals |
| `World` | `Extent` | World implied scene simulation; Extent = where/when/about-what |
| `Type` / `TypeDesc` | `SignalType` | Complete contract: PayloadType + Extent |
| `config` / `scalar` | `cardinality = zero` | Clearer: compile-time constant, no runtime lanes |
| `Block.type` | `Block.kind` | Reserve `type` for the type system |
| `structural` (roles) | `derived` | Better describes system-generated entities |

---

## Core Type System (v2.5 Five-Axis Model)

### PayloadType

**Definition**: The base data type of a value. What the payload is made of.
**Type**: type
**Values**: `'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit'`
**Note**: Replaces `ValueType` and `DomainTag` from earlier specs. Does NOT include 'event' or 'domain'.

```ts
type PayloadType = 'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit';
```

---

### Extent

**Definition**: The 5-axis coordinate describing where/when/about-what a value exists. Independent of payload.
**Type**: type
**Structure**:
```ts
type Extent = {
  cardinality: AxisTag<Cardinality>;
  temporality: AxisTag<Temporality>;
  binding: AxisTag<Binding>;
  perspective: AxisTag<PerspectiveId>;
  branch: AxisTag<BranchId>;
};
```
**Note**: Replaces `World`. In v0, binding/perspective/branch use canonical defaults.

---

### SignalType

**Definition**: Complete type description for a port or wire. The contract.
**Type**: type
**Structure**:
```ts
type SignalType = {
  payload: PayloadType;
  extent: Extent;
};
```
**Note**: Replaces `Type` / `TypeDesc`. No optional fields.

---

### AxisTag

**Definition**: Discriminated union representing "default unless instantiated" - avoids optional fields.
**Type**: type
**Structure**:
```ts
type AxisTag<T> =
  | { kind: 'default' }
  | { kind: 'instantiated'; value: T };
```

---

### Cardinality

**Definition**: How many lanes a value has. Replaces static/signal/field distinction for lane count.
**Type**: type
**Structure**:
```ts
type Cardinality =
  | { kind: 'zero' }                      // compile-time constant, no runtime lanes
  | { kind: 'one' }                       // single lane
  | { kind: 'many'; domain: DomainRef };  // N lanes aligned by domain
```
**Mapping**:
- `zero` = was `static` / `config` / `scalar`
- `one` = was `signal`
- `many(domain)` = was `field(domain)`

---

### Temporality

**Definition**: When a value exists. Orthogonal to cardinality.
**Type**: type
**Structure**:
```ts
type Temporality =
  | { kind: 'continuous' }  // value exists every frame/tick
  | { kind: 'discrete' };   // event occurrences only
```
**Note**: Events are `discrete` temporality, not a separate world.

---

### Binding

**Definition**: Referential anchoring - what is this value about? Independent of domain.
**Type**: type
**Structure**:
```ts
type Binding =
  | { kind: 'unbound' }
  | { kind: 'weak'; referent: ReferentRef }
  | { kind: 'strong'; referent: ReferentRef }
  | { kind: 'identity'; referent: ReferentRef };
```
**Values**:
- `unbound`: pure value/signal/field
- `weak`: measurement-like about a referent
- `strong`: property-like about a referent
- `identity`: stable entity identity

**Note**: v0 uses `unbound` canonical default. Same domain can host unbound image vs bound mask.

---

### Domain

**Definition**: Compile-time declared stable index set. Defines how many elements exist and how they line up.
**Type**: concept / compile-time resource
**Structure**:
```ts
type DomainId = string;
type DomainRef = { kind: 'domain'; id: DomainId };

type DomainDecl =
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'fixed_count'; count: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'grid_2d'; width: number; height: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'voices'; maxVoices: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'mesh_vertices'; assetId: string } };
```
**Critical**: Domain does NOT flow on wires. It's referenced by SignalType's cardinality axis. At runtime, erased to loop bounds + layout constants.

---

### Field

**Definition**: A SignalType specialization where `cardinality = many(domain)` and `temporality = continuous`.
**Type**: concept (type constraint)
**Note**: Not a separate type - just a constraint on SignalType.

---

### Signal (as type concept)

**Definition**: A SignalType specialization where `cardinality = one` and `temporality = continuous`.
**Type**: concept (type constraint)

---

### Event (as type concept)

**Definition**: A SignalType specialization where `temporality = discrete`. Cardinality can be `one` (trigger) or `many(domain)` (per-lane event).
**Type**: concept (type constraint)

---

## Type System Utilities

### DefaultSemantics

**Definition**: How defaults are resolved - canonical value or inherit from frame.
**Type**: type
**Structure**:
```ts
type DefaultSemantics<T> =
  | { kind: 'canonical'; value: T }  // v0
  | { kind: 'inherit' };             // v1+
```

---

### EvalFrame

**Definition**: Evaluation context for default resolution (v1+ feature).
**Type**: type
**Structure**:
```ts
type EvalFrame = {
  perspective: PerspectiveId;
  branch: BranchId;
};
```
**Note**: v0 uses canonical defaults; frame exists but is not user-configurable.

---

### V0 Canonical Defaults

**Definition**: Default values for all axes in v0.
**Type**: constant
**Values**:
```ts
const DEFAULTS_V0 = {
  cardinality: { kind: 'canonical', value: { kind: 'one' } },
  temporality: { kind: 'canonical', value: { kind: 'continuous' } },
  binding:     { kind: 'canonical', value: { kind: 'unbound' } },
  perspective: { kind: 'canonical', value: 'global' },
  branch:      { kind: 'canonical', value: 'main' },
};

const FRAME_V0: EvalFrame = { perspective: 'global', branch: 'main' };
```

---

## Block System

### Block

**Definition**: The only compute unit in the system. Has stable identity, typed ports, and deterministic evaluation.
**Type**: concept
**Structure**:
```ts
interface Block {
  id: BlockId;
  kind: string;        // "Add", "UnitDelay", etc. (NOT type)
  role: BlockRole;
  // ...
}
```

---

### Block.kind

**Definition**: Identifies what block definition this instance uses. References the block registry.
**Type**: property
**Example**: `"Add"`, `"UnitDelay"`, `"RenderInstances2D"`
**Note**: Renamed from `Block.type` to avoid confusion with the type system.

---

### BlockRole

**Definition**: Discriminated union identifying whether a block is user-created or derived.
**Type**: type
**Structure**:
```ts
type BlockRole =
  | { kind: "user" }
  | { kind: "derived"; meta: DerivedBlockMeta };
```

---

### DerivedBlockMeta

**Definition**: Metadata for derived (system-generated) blocks specifying their purpose.
**Type**: type
**Structure**:
```ts
type DerivedBlockMeta =
  | { kind: "defaultSource"; target: { kind: "port"; port: PortRef } }
  | { kind: "wireState";     target: { kind: "wire"; wire: WireId } }
  | { kind: "bus";           target: { kind: "bus"; busId: BusId } }
  | { kind: "rail";          target: { kind: "bus"; busId: BusId } }
  | { kind: "lens";          target: { kind: "node"; node: NodeRef; port?: string } };
```

---

### EdgeRole

**Definition**: Discriminated union identifying edge purpose.
**Type**: type
**Structure**:
```ts
type EdgeRole =
  | { kind: "user" }
  | { kind: "default"; meta: { defaultSourceBlockId: BlockId } }
  | { kind: "busTap";  meta: { busId: BusId } }
  | { kind: "auto";    meta: { reason: "portMoved" | "rehydrate" | "migrate" } };
```

---

## Stateful Primitives

### Stateful Primitive

**Definition**: One of the canonical blocks that maintain state across frames. All other blocks are pure and stateless.
**Type**: concept
**MVP Set (4)**: UnitDelay, Lag, Phasor, SampleAndHold
**Post-MVP**: Accumulator (distinct from Phasor)
**Note**: "State" block does not exist (it's just UnitDelay).

---

### UnitDelay

**Definition**: Fundamental stateful primitive. Outputs previous frame's input: `y(t) = x(t-1)`. All feedback requires UnitDelay. Polymorphic over cardinality.
**Type**: block
**State allocation**: Per cardinality - one cell for `one`, N cells for `many(domain)`.

---

### Lag

**Definition**: Stateful primitive. Smoothing filter (linear/exponential). Smoothly transitions toward target value.
**Type**: block

---

### Phasor

**Definition**: Stateful primitive. Phase accumulator outputting 0..1 ramp with wrap semantics. Distinct from Accumulator.
**Type**: block

---

### Accumulator

**Definition**: Stateful primitive (post-MVP). Integrates input over time: `y(t) = y(t-1) + x(t)`. Unbounded. Distinct from Phasor.
**Type**: block
**Note**: Not in MVP - added in later stage.

---

### SampleAndHold

**Definition**: Stateful primitive. Latches value when trigger fires: `if trigger(t): y(t) = x(t) else y(t) = y(t-1)`
**Type**: block

---

## Time System

### tMs

**Definition**: Simulation time in milliseconds. SignalType: `one + continuous + int`. Monotonic and unbounded.
**Type**: variable

---

### TimeRoot

**Definition**: Single authoritative time source. Exactly one per patch.
**Type**: block
**Outputs** (with v2.5 typing):
- `tMs`: `one + continuous` (int) - monotonic time in ms
- `phaseA`: `one + continuous` (phase) - primary phase
- `phaseB`: `one + continuous` (phase) - secondary phase
- `progress`: `one + continuous` (unit) - 0..1 for finite only
- `pulse`: `one + discrete` (unit) - frame tick trigger

---

### Rail

**Definition**: Immutable system-provided bus. Cannot be deleted or renamed.
**Type**: concept
**MVP Rails**: `time`, `phaseA`, `phaseB`, `pulse`

---

## Events

### Event Payload

**Definition**: Versioned structure for event data.
**Type**: type
**Structure**:
```ts
{ key: string, value: float | int }
```
**Note**: No optional fields. No `any` types.

---

### Trigger

**Definition**: A value with `cardinality = one` and `temporality = discrete`. Single event stream.
**Type**: type concept

---

### Per-lane Event

**Definition**: A value with `cardinality = many(domain)` and `temporality = discrete`. Per-element event stream.
**Type**: type concept

---

## Combine System

### CombineMode

**Definition**: Strategy for combining multiple writers to a single input port. Built-in only, no custom registry.
**Type**: type
**Values**:
- Numeric: `sum`, `average`, `min`, `max`, `mul`
- Any type: `last`, `first`, `layer`
- Boolean: `or`, `and`

---

## Compilation

### NormalizedGraph

**Definition**: Canonical compile-time representation the compiler consumes.
**Type**: type
**Structure**:
```ts
type NormalizedGraph = {
  domains: DomainDecl[];
  nodes: Node[];
  edges: Edge[];
};
```

---

### Axis Unification

**Definition**: Compile-time joining of axis tags across connections.
**Type**: algorithm
**Rules**:
- `default + default` → `default`
- `default + instantiated(X)` → `instantiated(X)`
- `instantiated(X) + instantiated(X)` → `instantiated(X)`
- `instantiated(X) + instantiated(Y), X≠Y` → **type error**

---

### Runtime Erasure

**Definition**: Hard constraint that no axis/domain/referent information exists at runtime.
**Type**: constraint
**Requirements**:
1. No axis tags in runtime values
2. No referent ids in runtime values
3. No domain objects at runtime (only loop constants/layout)
4. Runtime sees: scalar values, dense arrays, event buffers, compiled schedules

---

### CompiledProgramIR Storage

**Definition**: Runtime storage shapes after erasure.
**Type**: type
**Slots**:
```ts
type ScalarSlot = { kind: 'scalar_slot'; id: number };
type FieldSlot  = { kind: 'field_slot'; id: number; domain: DomainId };
type EventSlot  = { kind: 'event_slot'; id: number };
type StateSlot  = { kind: 'state_slot'; id: number };
```

---

## Default Sources

### DefaultSource

**Definition**: Derived block providing fallback value for unconnected input. Uses useful defaults, not zeros.
**Type**: concept
**Defaults by PayloadType**:
- float: `phaseA` rail or `Constant(0.5)`
- int: `Constant(1)`
- vec2: `Constant([0.5, 0.5])`
- color: `HueRainbow(phaseA)` or `Constant(white)`
- phase: `phaseA` rail
- bool: `Constant(true)`
- unit: `phaseA` rail or `Constant(0.5)`
- domain: `DomainN(100)`

---

## Basic 12 Blocks (MVP)

1. **TimeRoot** - Time source
2. **DomainN** - Create N-element domain
3. **Id/U01** - Element ID normalized to [0,1]
4. **Hash** - Deterministic hash
5. **Noise** - Procedural noise
6. **Add** - Addition
7. **Mul** - Multiplication
8. **Length** - Vector length
9. **Normalize** - Vector normalize
10. **UnitDelay** - One-frame delay
11. **HSV->RGB** - Color conversion
12. **RenderInstances2D** - Render sink

---

## Deprecated Terms

| Deprecated | Use Instead | Notes |
|------------|-------------|-------|
| DomainTag | PayloadType | Domain is topology |
| ValueType | PayloadType | More precise name |
| World | Extent | 5-axis coordinate |
| Type / TypeDesc | SignalType | Complete contract |
| config (world) | cardinality = zero | Explicit axis |
| scalar (world) | cardinality = zero | Explicit axis |
| signal (world) | one + continuous | Explicit axes |
| field (world) | many(domain) + continuous | Explicit axes |
| event (world) | discrete temporality | Orthogonal axis |
| Block.type | Block.kind | Reserved for types |
| structural (role) | derived | System-generated |
| Lag | Lag | MVP stateful primitive (smoothing) |
| State block | UnitDelay | Proper name |
| custom combine | (removed) | Built-in only |

---

## Naming Conventions

### Types
- **PascalCase**: `SignalType`, `PayloadType`, `BlockRole`, `Extent`
- No generic syntax in type names (it's `SignalType`, not `Signal<T>`)

### Blocks
- **PascalCase**: `UnitDelay`, `RenderInstances2D`
- Use `kind` property (not `type`)

### Variables
- **camelCase**: `tMs`, `dtMs`, `phaseA`
- Time values suffixed with unit: `tMs`, `durationMs`

### Discriminated Unions
- Use `kind` as discriminator everywhere
- Closed unions (no free-form keys)
- No optional fields - use union branches

### Axis-related
- Axis names: `cardinality`, `temporality`, `binding`, `perspective`, `branch`
- All lowercase in property names
- Use `AxisTag<T>` wrapper for default handling
