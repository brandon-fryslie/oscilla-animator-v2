---
command: /canonicalize-architecture design-docs/spec/
files: INDEX.md 00-invariants.md AMBIGUITIES.md graph/02-time.md graph/03-buses.md graph/06-blocks.md graph/07-transforms.md graph/08-primitives-composites.md graph/stateful-blocks.md graph/basic-12-blocks.md compiler/01-type-system.md compiler/02-polymorphism.md compiler/03-category-theory.md compiler/04-compilation.md compiler/canonical-types-and-constraints.md compiler/canonical-types-and-constraints-UPDATED.md compiler/maybe-block-defs.md runtime/05-runtime.md renderer/09-renderer.md renderer/RENDER-PIPELINE.md time/10-phase-matching-system.md time/11-phase-unwrap-IMPORTANT.md
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
---

# Canonical Glossary: Oscilla v2

Generated: 2026-01-08T14:00:00Z
Supersedes: CANONICALIZED-GLOSSARY-oscilla-v2-20260108-130000.md

---

## Naming Changes (from canonicalization)

| Old Term | New Term | Reason |
|----------|----------|--------|
| `DomainTag` | `ValueType` | Domain is element topology; ValueType is float/vec2/etc |
| `config` / `scalar` | `static` | Clearer: compile-time constant |
| `Block.type` | `Block.kind` | Reserve `type` for the type system |
| `structural` (roles) | `derived` | Better describes system-generated entities |
| `TypeDesc` | `Type` | Simpler name |

---

## Core Type System

### ValueType

**Definition**: The base data type of a value. What the `<T>` represents in `signal<T>`.
**Type**: type
**Values**: `float | int | vec2 | color | phase | bool | unit`
**Note**: Replaces `DomainTag` from earlier specs

---

### Domain

**Definition**: Element topology - defines a set of elements with stable identity. A Domain specifies how many elements exist and provides stable IDs for each.
**Type**: concept
**Example**: A particles Domain with 100 elements, IDs 0-99
**Note**: NOT the same as ValueType. Domain is iteration topology, ValueType is data type.

---

### Type

**Definition**: Complete type description for a port or value. Discriminated union by world.
**Type**: type
**Structure**:
```ts
type Type =
  | { world: 'static'; value: ValueType }
  | { world: 'signal'; value: ValueType }
  | { world: 'field';  value: ValueType; domain: DomainRef }
  | { world: 'event';  value: ValueType };
```
**Note**: No optional fields. Field has `domain`, others don't. Replaces `TypeDesc`.

---

### World

**Definition**: When/how a value is evaluated.
**Type**: type
**Values**: `static | signal | field | event`
- `static`: Compile-time constant (was: config/scalar)
- `signal`: Once per frame
- `field`: Once per element per frame
- `event`: Discrete trigger

---

## Block System

### Block

**Definition**: The only compute unit in the system. Has stable identity, typed ports, and deterministic evaluation.
**Type**: concept
**Structure**:
```ts
interface Block {
  id: BlockId;
  kind: string;        // "Add", "UnitDelay", etc. (was: type)
  role: BlockRole;
  // ...
}
```

---

### Block.kind

**Definition**: Identifies what block definition this instance uses. References the block registry.
**Type**: property
**Example**: `"Add"`, `"UnitDelay"`, `"RenderInstances2D"`
**Note**: Renamed from `Block.type` to avoid confusion with the type system

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
**Canonical Set**: UnitDelay, Phasor, SampleAndHold
**Note**: Lag does not exist. Accumulator is distinct from Phasor.

---

### UnitDelay

**Definition**: Fundamental stateful primitive. Outputs previous frame's input: `y(t) = x(t-1)`. All feedback requires UnitDelay. Polymorphic - works on signals and fields.
**Type**: block

---

### Phasor

**Definition**: Stateful primitive. Phase accumulator outputting 0..1 ramp with wrap semantics. Distinct from Accumulator.
**Type**: block

---

### Accumulator

**Definition**: Stateful primitive. Integrates input over time: `y(t) = y(t-1) + x(t)`. Distinct from Phasor.
**Type**: block

---

### SampleAndHold

**Definition**: Stateful primitive. Latches value when trigger fires: `if trigger(t): y(t) = x(t) else y(t) = y(t-1)`
**Type**: block

---

## Time System

### tMs

**Definition**: Simulation time in milliseconds. Type: `signal<int>`. Monotonic and unbounded.
**Type**: variable

---

### TimeRoot

**Definition**: Single authoritative time source. Exactly one per patch.
**Type**: block
**Outputs**:
- `tMs`: signal<int>
- `phaseA`: signal<phase>
- `phaseB`: signal<phase>
- `progress`: signal<unit> (finite only)
- `pulse`: trigger<unit>

---

### Rail

**Definition**: Immutable system-provided bus. Cannot be deleted or renamed.
**Type**: concept
**MVP Rails**: `time`, `phaseA`, `phaseB`, `pulse`
**Note**: `progress` removed from rails

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

### trigger<T>

**Definition**: Discrete signal-level event. Fires 0 or 1 times per frame with payload of type T.
**Type**: type

---

### element-trigger<T>

**Definition**: Per-element discrete events. Sparse: tracks which elements fired.
**Type**: type (stub)

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

## Default Sources

### DefaultSource

**Definition**: Derived block providing fallback value for unconnected input. Uses useful defaults, not zeros.
**Type**: concept
**Defaults by type**:
- float: `phaseA` rail or `Constant(0.5)`
- int: `Constant(1)`
- vec2: `Constant([0.5, 0.5])`
- color: `HueRainbow(phaseA)` or `Constant(white)`
- phase: `phaseA` rail
- bool: `Constant(true)`
- unit: `phaseA` rail or `Constant(0.5)`
- domain: `DomainN(100)`

---

## Compilation

### Cycle Validation

**Definition**: Detection of feedback loops. Uses Tarjan's algorithm for SCC detection. Each SCC must contain at least one stateful primitive.
**Type**: algorithm
**Error**: "Feedback loop without delay"

---

### GraphNormalization

**Definition**: Transforms RawGraph into NormalizedGraph. Expands composites, materializes DefaultSources, materializes BusBlocks, expands transforms.
**Type**: concept

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
10. **UnitDelay** - One-frame delay (not "State")
11. **HSV→RGB** - Color conversion
12. **RenderInstances2D** - Render sink

---

## Deprecated Terms

| Deprecated | Use Instead |
|------------|-------------|
| DomainTag | ValueType |
| config (world) | static |
| scalar (world) | static |
| Block.type | Block.kind |
| structural (role) | derived |
| TypeDesc | Type |
| Lag | (doesn't exist) |
| State block | UnitDelay |
| custom combine | (removed) |

---

## Naming Conventions

### Types
- **PascalCase**: `Type`, `ValueType`, `BlockRole`
- Generic syntax: `signal<float>`, `field<vec2>`

### Blocks
- **PascalCase**: `UnitDelay`, `RenderInstances2D`
- Use `kind` property (not `type`)

### Variables
- **camelCase**: `tMs`, `dtMs`, `phaseA`
- Time values suffixed with unit: `tMs`, `durationMs`

### Discriminated Unions
- Use `kind` as discriminator everywhere
- Closed unions (no free-form keys)
