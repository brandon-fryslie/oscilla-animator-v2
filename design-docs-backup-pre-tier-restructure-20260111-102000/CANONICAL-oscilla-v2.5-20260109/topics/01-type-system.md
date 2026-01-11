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
type PayloadType = 'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit';
```

### PayloadType Semantics

| Type | Description | Size | Range/Units |
|------|-------------|------|-------------|
| `float` | 32-bit floating point | 4 bytes | IEEE 754 |
| `int` | 32-bit signed integer | 4 bytes | -2^31 to 2^31-1 |
| `vec2` | 2D vector (x, y) | 8 bytes | Two floats |
| `color` | RGBA color | 16 bytes | Four floats, 0..1 each |
| `phase` | Cyclic phase value | 4 bytes | 0..1 with wrap semantics |
| `bool` | Boolean | 1 byte | true/false |
| `unit` | Unit interval | 4 bytes | 0..1 clamped |

### Important Notes

- `float` and `int` are **PayloadTypes** (domain model)
- `number` is **TypeScript-only** (implementation detail)
- PayloadType does **NOT** include `'event'` or `'domain'`
- `phase` has special arithmetic rules (see [Phase Semantics](#phase-type-semantics))

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
type DomainId = string;
type DomainRef = { kind: 'domain'; id: DomainId };

type Cardinality =
  | { kind: 'zero' }                      // compile-time constant, no runtime lanes
  | { kind: 'one' }                       // single lane
  | { kind: 'many'; domain: DomainRef };  // N lanes aligned by domain
```

### Cardinality Semantics

| Cardinality | Old Term | Runtime Representation | Use Case |
|-------------|----------|------------------------|----------|
| `zero` | `static`, `config`, `scalar` | Inlined constant | Parameters, constants |
| `one` | `signal` | Single slot | Per-frame values |
| `many(domain)` | `field(domain)` | Array of N slots | Per-element values |

### Important: Domain is NOT a Wire Value

Domain is a **compile-time resource**, not a value that flows on wires:

```typescript
// WRONG: Domain as wire value
wire: domain -> someBlock  // This does NOT exist

// RIGHT: Domain referenced by type
port.type = {
  extent: {
    cardinality: { kind: 'instantiated', value: { kind: 'many', domain: { kind: 'domain', id: 'D1' } } }
  }
}
```

At runtime, domain becomes loop bounds + layout constants (erased as object).

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

### Domain as Compile-Time Resource

```typescript
type DomainDecl =
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'fixed_count'; count: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'grid_2d'; width: number; height: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'voices'; maxVoices: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'mesh_vertices'; assetId: string } };
```

### Domain Properties

- Domains are **patch-level resources**
- Referenced by SignalType via Cardinality axis
- At runtime: erased to loop bounds + layout constants
- **v0 invariant**: Every domain compiles to dense lanes 0..N-1

### Domain Alignment (v0)

Two `many` values are aligned iff they reference the **same DomainId**. No mapping/resampling in v0.

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
    cardinality: { kind: 'instantiated', value: { kind: 'many', domain: { kind: 'domain', id: 'particles' } } },
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
