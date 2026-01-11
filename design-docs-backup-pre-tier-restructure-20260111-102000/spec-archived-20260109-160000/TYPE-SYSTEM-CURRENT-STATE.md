# Oscilla v2 Type System: Current State

**Purpose**: Capture the current state of type system design to provide context for architectural expansion to the 5-axis model.

**Date**: 2026-01-08

---

## 1. Current Working Model

### ValueType (the base data types)

```ts
type ValueType = 'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit';
```

These are the primitive value types that flow through the graph.

### World (evaluation context)

```ts
type World = 'static' | 'signal' | 'field' | 'event';
```

| World | Meaning | Evaluation |
|-------|---------|------------|
| `static` | Compile-time constant | Once at compile time |
| `signal` | Frame-level value | Once per frame |
| `field` | Per-element value | Once per element per frame |
| `event` | Discrete trigger | When triggered |

### Type (complete type description)

```ts
type Type =
  | { world: 'static'; value: ValueType }
  | { world: 'signal'; value: ValueType }
  | { world: 'field';  value: ValueType; domain: DomainRef }
  | { world: 'event';  value: ValueType };
```

**Note**: Field requires `domain` (which elements it iterates over). This asymmetry suggests we're missing something fundamental.

### Domain (element topology)

A Domain defines a set of elements with stable identity:
- Count: how many elements
- Identity: stable IDs for each element (0..N-1 or UUIDs)

Example: A particles Domain with 100 elements.

---

## 2. Key Insight: Cardinality Unification

We discovered that `static`, `signal`, and `field` are the same concept at different cardinalities:

| World | Cardinality | Interpretation |
|-------|-------------|----------------|
| `static` | 0 | Compile-time constant (no runtime elements) |
| `signal` | 1 | One value per frame |
| `field` | N | N values per frame |

This means:
- `signal` is a `field` with cardinality 1
- `static` is a `field` with cardinality 0 (known at compile time)
- Broadcast (signal→field) is just "read this 1 value N times"
- Reduce (field→signal) collapses N→1 via combining function

### Haskell Analogy

In Haskell/FRP terms, these are all **Functors** with different cardinalities:
- `Static a` ≈ `Identity a` (or `Const a`)
- `Signal a` ≈ `Identity a` (semantically different but same shape)
- `Field a` ≈ `Vector a` (or `ZipList a`)

They're all **Applicative**, enabling uniform lifting of operations.

---

## 3. Event as Orthogonal Axis

Events don't fit the cardinality model. They're a different **temporality**:

| Temporality | Meaning |
|-------------|---------|
| Continuous (Behavior) | Has a value at every moment |
| Discrete (Event) | Fires at specific moments, nothing most frames |

This gives us a 2D space:

```
                Continuous          Discrete
                (Behavior)          (Event)

Cardinality 0   static<T>           static-trigger<T> (stub)
Cardinality 1   signal<T>           trigger<T>
Cardinality N   field<T>            element-trigger<T>
```

---

## 4. Current Terminology

### Renamed in Canonicalization

| Old Term | New Term | Reason |
|----------|----------|--------|
| `DomainTag` | `ValueType` | Domain is element topology, ValueType is float/vec2/etc |
| `config` / `scalar` | `static` | Clearer meaning |
| `Block.type` | `Block.kind` | Reserve `type` for type system |
| `structural` | `derived` | For system-generated blocks/edges |
| `TypeDesc` | `Type` | Simpler |

### Block Roles

```ts
type BlockRole =
  | { kind: "user" }
  | { kind: "derived"; meta: DerivedBlockMeta };

type DerivedBlockMeta =
  | { kind: "defaultSource"; target: { kind: "port"; port: PortRef } }
  | { kind: "wireState";     target: { kind: "wire"; wire: WireId } }
  | { kind: "bus";           target: { kind: "bus"; busId: BusId } }
  | { kind: "rail";          target: { kind: "bus"; busId: BusId } }
  | { kind: "lens";          target: { kind: "node"; node: NodeRef } };
```

### Edge Roles

```ts
type EdgeRole =
  | { kind: "user" }
  | { kind: "default"; meta: { defaultSourceBlockId: BlockId } }
  | { kind: "busTap";  meta: { busId: BusId } }
  | { kind: "auto";    meta: { reason: "portMoved" | "rehydrate" | "migrate" } };
```

---

## 5. Stateful Primitives

Only these blocks maintain state across frames:

1. **UnitDelay** - `y(t) = x(t-1)` - one-frame delay, feedback gate
2. **Phasor** - phase accumulator (0..1 ramp with wrap)
3. **Accumulator** - `y(t) = y(t-1) + x(t)` - integration
4. **SampleAndHold** - latch value when trigger fires

All other blocks are pure/stateless.

**Note**: Phasor and Accumulator are distinct primitives.

---

## 6. Time System

### TimeRoot Outputs

| Output | Type | Description |
|--------|------|-------------|
| `tMs` | signal<int> | Monotonic time in milliseconds |
| `phaseA` | signal<phase> | Primary phase rail |
| `phaseB` | signal<phase> | Secondary phase rail |
| `progress` | signal<unit> | 0..1 for finite time only |
| `pulse` | trigger<unit> | Frame tick event |

### Rails (system-provided buses)

MVP: `time`, `phaseA`, `phaseB`, `pulse`

---

## 7. Combine Modes

When multiple wires connect to one input, values are combined. Built-in modes only (no custom registry):

| Type | Modes |
|------|-------|
| Numeric | sum, average, min, max, mul |
| Any | last, first, layer |
| Boolean | or, and |

---

## 8. Event Payload

```ts
{ key: string, value: float | int }
```

Versioned structure. No optional fields. No `any` types.

---

## 9. Default Sources

Derived blocks providing fallback values. Use useful defaults, not zeros:

| ValueType | Default |
|-----------|---------|
| float | `phaseA` rail or `Constant(0.5)` |
| int | `Constant(1)` |
| vec2 | `Constant([0.5, 0.5])` |
| color | `HueRainbow(phaseA)` |
| phase | `phaseA` rail |
| bool | `Constant(true)` |
| unit | `phaseA` rail |
| domain | `DomainN(100)` |

---

## 10. Three-Stage Pipeline

```
RawGraph → GraphNormalization → NormalizedGraph → Compilation → CompiledProgramIR
```

1. **RawGraph**: User-authored blocks and edges
2. **NormalizedGraph**: All derived blocks materialized (default sources, buses, lenses)
3. **CompiledProgramIR**: Executable schedule with signalExprs, fieldExprs, render sinks

---

## 11. Design Principles

1. **No special cases** - Align with category theory (Functor/Applicative)
2. **No optional fields** - Use discriminated unions
3. **`kind` for discriminators** - Standard TypeScript pattern
4. **Derived blocks are real** - Exist in patch, compiled normally
5. **Compiler ignores roles** - Roles are for editor only
6. **Single source of truth** - Each concept has one canonical representation

---

## 12. Open Questions for 5-Axis Expansion

The current model has 2 axes:
- **Cardinality**: static (0) / signal (1) / field (N)
- **Temporality**: Continuous (behavior) / Discrete (event)

The architect proposes 5 axes:

| Axis | What it answers | Current Oscilla equivalent |
|------|-----------------|---------------------------|
| **Cardinality** | How many elements? | static/signal/field |
| **Temporality** | Continuous or discrete? | behavior vs event |
| **Binding** | What does the value refer to? | Domain (partially) |
| **Perspective** | Where is it viewed? | Render sinks? Scene cuts? UI layers? |
| **Branch** | Which timeline/history? | Preview? Undo? Export? |

### Questions to resolve:

1. **Binding**: Is this what Domain currently represents? Or is Domain just cardinality + binding combined?

2. **Perspective**: How does this map to render sinks, layers, or scene cuts in Oscilla?

3. **Branch**: Where do Preview, Undo/Redo, and Export fit? Are these compile-time or runtime concepts?

4. **Syntax**: How do we express a 5-axis type without nested angle brackets everywhere?

5. **Operations**: What operations move values between axis coordinates? (Broadcast = cardinality change, Sample = branch change, etc.)

---

## 13. Reference: v1 Codebase

Located at `~/code/oscilla-animator_codex`:
- Block/Edge roles: `src/editor/types.ts`
- Role invariants: `design-docs/final-System-Invariants/15-Block-Edge-Roles.md`
- GraphNormalizer: `src/editor/graph/GraphNormalizer.ts`
