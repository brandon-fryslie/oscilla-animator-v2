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
  | { kind: "bus";           target: { kind: "bus"; busId: BusId } }
  | { kind: "rail";          target: { kind: "bus"; busId: BusId } }
  | { kind: "lens";          target: { kind: "node"; node: NodeRef } };
```

### Derived Block Types

| Meta Kind | Purpose | Target | Example |
|-----------|---------|--------|---------|
| `defaultSource` | Provides fallback value | Unconnected input port | `Constant(0.5)` for float input |
| `wireState` | State on a wire | Wire with feedback | `UnitDelay` for cycle |
| `bus` | User-created global bus | Bus ID | Global `colorBus` |
| `rail` | System-provided bus | Rail ID | `time`, `phaseA` rails |
| `lens` | Transform/adapter | Node reference | Type conversion block |

---

## Edge Roles

Edges also carry roles for the same reasons:

```typescript
type EdgeRole =
  | { kind: "user" }
  | { kind: "default"; meta: { defaultSourceBlockId: BlockId } }
  | { kind: "busTap";  meta: { busId: BusId } }
  | { kind: "auto";    meta: { reason: "portMoved" | "rehydrate" | "migrate" } };
```

### Edge Role Semantics

| Role | Meaning | Persistence |
|------|---------|-------------|
| `user` | Explicit user connection | Persisted exactly as authored |
| `default` | From defaultSource block | Suppressed when real connection exists |
| `busTap` | Created via bus connection UI | Editor enforces bus constraints |
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
| `one` | One state cell |
| `many(domain)` | N(domain) state cells (one per lane) |
| `zero` | No runtime state |

State is keyed by `(blockId, laneIndex)` tuple.

### Note on Lag

Lag is technically a composite (could be built from UnitDelay + arithmetic), but it's labeled as a primitive for practical purposes. The distinction is arbitrary for this system.

---

## Basic 12 Blocks (MVP)

The minimal block set for a working system:

| # | Block | Category | Description |
|---|-------|----------|-------------|
| 1 | **TimeRoot** | Time | Time source (system-managed) |
| 2 | **DomainN** | Domain | Create N-element domain |
| 3 | **Id/U01** | Domain | Element ID normalized to [0,1] |
| 4 | **Hash** | Math | Deterministic hash |
| 5 | **Noise** | Math | Procedural noise |
| 6 | **Add** | Math | Addition |
| 7 | **Mul** | Math | Multiplication |
| 8 | **Length** | Math | Vector length |
| 9 | **Normalize** | Math | Vector normalize |
| 10 | **UnitDelay** | State | One-frame delay |
| 11 | **HSV->RGB** | Color | Color conversion |
| 12 | **RenderInstances2D** | Render | Render sink |

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
| `phase` | `phaseA` rail |
| `bool` | `Constant(true)` |
| `unit` | `phaseA` rail or `Constant(0.5)` |
| `domain` | `DomainN(100)` |

---

## Rails

Immutable system-provided buses. Cannot be deleted or renamed.

### MVP Rails

| Rail | Output Type | Description |
|------|-------------|-------------|
| `time` | `one + continuous + int` | `tMs` value |
| `phaseA` | `one + continuous + phase` | Primary phase |
| `phaseB` | `one + continuous + phase` | Secondary phase |
| `pulse` | `one + discrete + unit` | Frame tick trigger |
| `palette` | `one + continuous + color` | Chromatic reference frame |

### Rails Are Blocks

Rails can have inputs overridden and be driven by feedback like any other block. They are derived blocks with `{ kind: "rail", target: { kind: "bus", busId } }`.

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

---

## See Also

- [01-type-system](./01-type-system.md) - SignalType for ports
- [03-time-system](./03-time-system.md) - TimeRoot and rails
- [04-compilation](./04-compilation.md) - How blocks compile
- [Glossary: Block](../GLOSSARY.md#block)
- [Glossary: BlockRole](../GLOSSARY.md#blockrole)
- [Invariant: I6](../INVARIANTS.md#i6-compiler-never-mutates-the-graph)
