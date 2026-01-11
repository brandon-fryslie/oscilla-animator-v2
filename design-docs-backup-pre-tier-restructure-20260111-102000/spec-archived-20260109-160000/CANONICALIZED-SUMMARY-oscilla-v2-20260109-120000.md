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

# Canonical Architecture Summary: Oscilla Animator v2.5

Generated: 2026-01-09T12:00:00Z
Supersedes: CANONICALIZED-SUMMARY-oscilla-v2-20260108-140000.md
Documents Analyzed: 23 files (including v2.5 refinement)
Resolution Status: **100% Complete**

---

## Executive Summary

Oscilla v2.5 is a node-based animation system built on a dataflow architecture. The system is designed around category-theoretic principles (Functor/Applicative patterns) to maintain elegance and minimize special cases.

**Major v2.5 Change**: The type system has been upgraded from a single `World` discriminator to a **five-axis coordinate system** that cleanly separates concerns without concept conflation.

Key architectural decisions from canonicalization:

- **Type system**: `PayloadType` (float/int/vec2/etc) + `Extent` (5-axis coordinate)
- **Five axes**: Cardinality, Temporality, Binding, Perspective, Branch
- **Blocks use `kind`** not `type` (reserve `type` for the type system)
- **Block/Edge roles**: `user` vs `derived` (not `structural`)
- **Stateful primitives**: UnitDelay, Phasor, SampleAndHold, Accumulator
- **No custom combine modes**: Built-in only, per type
- **Default sources**: Useful values (rails where sensible), not zeros
- **Runtime erasure**: All axis/domain info resolved at compile time

---

## Key Naming Changes (v2.5)

| Old | New | Reason |
|-----|-----|--------|
| `DomainTag` / `ValueType` | `PayloadType` | Payload = float/vec2/etc; Domain = topology |
| `World` | `Extent` | 5-axis coordinate (cardinality/temporality/binding/perspective/branch) |
| `Type` / `TypeDesc` | `SignalType` | Complete contract: PayloadType + Extent |
| `static` / `config` / `scalar` | `cardinality = zero` | Explicit axis |
| `signal` | `cardinality = one, temporality = continuous` | Explicit axes |
| `field(domain)` | `cardinality = many(domain), temporality = continuous` | Explicit axes |
| `event` | `temporality = discrete` | Orthogonal to cardinality |
| `Block.type` | `Block.kind` | Reserve `type` for type system |
| `structural` | `derived` | Better describes system-generated entities |

---

## Type System (v2.5 Five-Axis Model)

### PayloadType

```ts
type PayloadType = 'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit';
```

### Extent (5-axis coordinate)

```ts
type Extent = {
  cardinality: AxisTag<Cardinality>;
  temporality: AxisTag<Temporality>;
  binding: AxisTag<Binding>;
  perspective: AxisTag<PerspectiveId>;
  branch: AxisTag<BranchId>;
};
```

### SignalType (complete contract)

```ts
type SignalType = {
  payload: PayloadType;
  extent: Extent;
};
```

### AxisTag (no optional fields)

```ts
type AxisTag<T> =
  | { kind: 'default' }
  | { kind: 'instantiated'; value: T };
```

### Cardinality (how many lanes)

```ts
type Cardinality =
  | { kind: 'zero' }                      // compile-time constant
  | { kind: 'one' }                       // single lane
  | { kind: 'many'; domain: DomainRef };  // N lanes aligned by domain
```

### Temporality (when)

```ts
type Temporality =
  | { kind: 'continuous' }  // value exists every frame
  | { kind: 'discrete' };   // event occurrences only
```

### Binding (v0: default-only)

```ts
type Binding =
  | { kind: 'unbound' }
  | { kind: 'weak'; referent: ReferentRef }
  | { kind: 'strong'; referent: ReferentRef }
  | { kind: 'identity'; referent: ReferentRef };
```

### Domain (compile-time resource, NOT a wire value)

```ts
type DomainDecl =
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'fixed_count'; count: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'grid_2d'; width: number; height: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'voices'; maxVoices: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'mesh_vertices'; assetId: string } };
```

---

## World → Axes Mapping

| Old World | Cardinality | Temporality |
|-----------|-------------|-------------|
| static | zero | continuous |
| signal | one | continuous |
| field(domain) | many(domain) | continuous |
| event | one OR many(domain) | discrete |

**Derived concepts**:
- **Signal**: `one + continuous`
- **Field**: `many(domain) + continuous`
- **Trigger**: `one + discrete`
- **Per-lane Event**: `many(domain) + discrete`

---

## V0 Canonical Defaults

```ts
const DEFAULTS_V0 = {
  cardinality: { kind: 'canonical', value: { kind: 'one' } },
  temporality: { kind: 'canonical', value: { kind: 'continuous' } },
  binding:     { kind: 'canonical', value: { kind: 'unbound' } },
  perspective: { kind: 'canonical', value: 'global' },
  branch:      { kind: 'canonical', value: 'main' },
};
```

---

## Axis Unification Rules (v0)

- `default + default` → `default`
- `default + instantiated(X)` → `instantiated(X)`
- `instantiated(X) + instantiated(X)` → `instantiated(X)`
- `instantiated(X) + instantiated(Y), X≠Y` → **type error**

No implicit merges. No "best effort." Applied at compile time only.

---

## Block & Edge Roles

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

type EdgeRole =
  | { kind: "user" }
  | { kind: "default"; meta: { defaultSourceBlockId: BlockId } }
  | { kind: "busTap";  meta: { busId: BusId } }
  | { kind: "auto";    meta: { reason: "portMoved" | "rehydrate" | "migrate" } };
```

---

## Stateful Primitives

MVP canonical set (4 primitives):
1. **UnitDelay** - `y(t) = x(t-1)` - feedback gate
2. **Lag** - smoothing (linear/exponential)
3. **Phasor** - phase accumulator (0..1 ramp with wrap)
4. **SampleAndHold** - latch on trigger

**Post-MVP**: Accumulator (`y(t) = y(t-1) + x(t)`, distinct from Phasor)
**Removed**: "State" block (is just UnitDelay)

**State allocation by cardinality**:
- `cardinality = one` → one state cell
- `cardinality = many(domain)` → N(domain) state cells
- `cardinality = zero` → no runtime state

---

## TimeRoot Outputs (v2.5 typed)

| Output | Cardinality | Temporality | Payload | Description |
|--------|-------------|-------------|---------|-------------|
| `tMs` | one | continuous | int | Monotonic time in ms |
| `phaseA` | one | continuous | phase | Primary phase |
| `phaseB` | one | continuous | phase | Secondary phase |
| `progress` | one | continuous | unit | 0..1 (finite only) |
| `pulse` | one | discrete | unit | Frame tick |

**MVP Rails**: `time`, `phaseA`, `phaseB`, `pulse` (not `progress`)

---

## Combine Modes

Built-in only. No custom registry.

| Type | Available Modes |
|------|-----------------|
| Numeric | sum, average, min, max, mul |
| Any | last, first, layer |
| Boolean | or, and |

---

## Event Payload

```ts
{ key: string, value: float | int }
```

Versioned. No optional fields. No `any` types.

---

## Default Sources

Use useful defaults, not zeros. Prefer rails for animation:

| PayloadType | Default |
|-------------|---------|
| float | `phaseA` rail or `Constant(0.5)` |
| int | `Constant(1)` |
| vec2 | `Constant([0.5, 0.5])` |
| color | `HueRainbow(phaseA)` |
| phase | `phaseA` rail |
| bool | `Constant(true)` |
| unit | `phaseA` rail |
| domain | `DomainN(100)` |

---

## Runtime Erasure Requirements

Hard constraints for 5-10ms performance budget:

1. **No axis tags exist in runtime values**
2. **No referent ids exist in runtime values**
3. **No domain objects at runtime** - only loop bounds + layout constants
4. **Perspective/Branch** select program variants (v1+); v0 has exactly one

Runtime sees only: scalar values, dense arrays, event buffers, compiled schedules.

---

## Compilation Pipeline

`RawGraph → GraphNormalization → NormalizedGraph → Compilation → CompiledProgramIR`

### NormalizedGraph

```ts
type NormalizedGraph = {
  domains: DomainDecl[];
  nodes: Node[];
  edges: Edge[];
};
```

### Where the five-axis model lives

- **GraphNormalization**: assigns initial SignalType coordinates (mostly with `AxisTag.default`)
- **Compilation**:
  - Unifies axes (join rules)
  - Resolves defaults (DEFAULTS_V0, FRAME_V0)
  - Specializes schedules/loops based on resolved axes
  - Allocates state slots based on cardinality
  - **Erases axes from runtime IR**

---

## Basic 12 Blocks (MVP)

1. TimeRoot
2. DomainN
3. Id/U01
4. Hash
5. Noise
6. Add
7. Mul
8. Length
9. Normalize
10. UnitDelay
11. HSV→RGB
12. RenderInstances2D

---

## Architecture Principles

1. **No special cases** - Align with category theory (Functor/Applicative)
2. **No optional fields** - Use discriminated unions (AxisTag pattern)
3. **`kind` for discriminators** - Standard TS pattern
4. **Derived blocks are real** - Exist in patch, compiled normally, just not user-authored
5. **Compiler ignores roles** - Roles are for editor, not compilation
6. **Single source of truth** - Each concept has one canonical representation
7. **Domain is topology, not meaning** - Binding is separate from domain
8. **Runtime erasure** - All type coordinates resolved at compile time

---

## Reference: v1 Codebase

Located at `~/code/oscilla-animator_codex`:
- Block/Edge roles: `src/editor/types.ts`
- Role invariants: `design-docs/final-System-Invariants/15-Block-Edge-Roles.md`
- GraphNormalizer: `src/editor/graph/GraphNormalizer.ts`

---

## Next Steps

1. **Update source specs** - Apply v2.5 naming/type changes to all spec documents
2. **Implement SignalType** - Replace Type/World with PayloadType/Extent/SignalType
3. **Generate master compendium** - Consolidate into CANONICAL-ARCHITECTURE document
