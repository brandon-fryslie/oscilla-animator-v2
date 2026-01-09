---
parent: INDEX.md
---

# Glossary

> Authoritative definitions for all terms in this specification.

Use these definitions consistently. When in doubt, this is the canonical source.

---

## Core Type System

### PayloadType

**Definition**: The base data type of a value - what the payload is made of.

**Type**: type

**Canonical Form**: `PayloadType`

**Values**: `'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit'`

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: Replaces `ValueType` and `DomainTag`. Does NOT include 'event' or 'domain'.

---

### Extent

**Definition**: The 5-axis coordinate describing where/when/about-what a value exists.

**Type**: type

**Canonical Form**: `Extent`

**Structure**:
```typescript
type Extent = {
  cardinality: AxisTag<Cardinality>;
  temporality: AxisTag<Temporality>;
  binding: AxisTag<Binding>;
  perspective: AxisTag<PerspectiveId>;
  branch: AxisTag<BranchId>;
};
```

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: Replaces `World`. Independent of payload.

---

### SignalType

**Definition**: Complete type description for a port or wire. The full contract.

**Type**: type

**Canonical Form**: `SignalType`

**Structure**:
```typescript
type SignalType = {
  payload: PayloadType;
  extent: Extent;
};
```

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: Replaces `Type` / `TypeDesc`. No optional fields.

---

### AxisTag

**Definition**: Discriminated union representing "default unless instantiated".

**Type**: type

**Canonical Form**: `AxisTag<T>`

**Structure**:
```typescript
type AxisTag<T> =
  | { kind: 'default' }
  | { kind: 'instantiated'; value: T };
```

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### Cardinality

**Definition**: How many lanes a value has.

**Type**: type

**Canonical Form**: `Cardinality`

**Values**:
- `{ kind: 'zero' }` - compile-time constant
- `{ kind: 'one' }` - single lane
- `{ kind: 'many'; domain: DomainRef }` - N lanes aligned by domain

**Source**: [01-type-system.md](./topics/01-type-system.md)

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

**Definition**: Compile-time declared stable index set defining element topology.

**Type**: concept / compile-time resource

**Canonical Form**: `Domain`, `DomainId`, `DomainDecl`

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: NOT a wire value. Referenced by SignalType's Cardinality axis.

---

## Derived Type Concepts

### Field

**Definition**: A SignalType where `cardinality = many(domain)` and `temporality = continuous`.

**Type**: concept (type constraint)

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: UI still uses "field" terminology; it's a constraint, not a separate type.

---

### Signal

**Definition**: A SignalType where `cardinality = one` and `temporality = continuous`.

**Type**: concept (type constraint)

**Source**: [01-type-system.md](./topics/01-type-system.md)

---

### Trigger

**Definition**: A SignalType where `cardinality = one` and `temporality = discrete`.

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
- `bus` - user-created global bus
- `rail` - system-provided bus
- `lens` - transform/adapter

**Source**: [02-block-system.md](./topics/02-block-system.md)

---

### EdgeRole

**Definition**: Discriminated union identifying edge purpose.

**Type**: type

**Canonical Form**: `EdgeRole`

**Values**: `user`, `default`, `busTap`, `auto`

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

**SignalType**: `one + continuous + int`

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

### RenderInstances2D

**Definition**: Primary render sink block.

**Type**: block

**Canonical Form**: `RenderInstances2D`

**Source**: [06-renderer.md](./topics/06-renderer.md)

---

### RenderIR

**Definition**: Generic render intermediate produced by patch.

**Type**: type

**Canonical Form**: `RenderIR`

**Source**: [06-renderer.md](./topics/06-renderer.md)

---

## Naming Conventions

### Type Names

- **PascalCase**: `SignalType`, `PayloadType`, `BlockRole`, `Extent`
- No generic syntax in names: `SignalType`, not `Signal<T>`

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

## Deprecated Terms

| Deprecated | Use Instead | Notes |
|------------|-------------|-------|
| `DomainTag` | `PayloadType` | Domain is topology |
| `ValueType` | `PayloadType` | More precise name |
| `World` | `Extent` | 5-axis coordinate |
| `Type` / `TypeDesc` | `SignalType` | Complete contract |
| `config` / `scalar` (world) | `cardinality = zero` | Explicit axis |
| `signal` (world) | `one + continuous` | Explicit axes |
| `field` (world) | `many(domain) + continuous` | Explicit axes |
| `event` (world) | `discrete` temporality | Orthogonal axis |
| `Block.type` | `Block.kind` | Reserved for types |
| `structural` (role) | `derived` | System-generated |
| State block | `UnitDelay` | Proper name |
| custom combine | (removed) | Built-in only |
