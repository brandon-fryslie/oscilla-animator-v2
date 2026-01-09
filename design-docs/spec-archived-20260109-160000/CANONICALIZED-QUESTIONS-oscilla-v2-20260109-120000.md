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

# Open Questions & Ambiguities: Oscilla v2

Generated: 2026-01-09T12:00:00Z
Supersedes: CANONICALIZED-QUESTIONS-oscilla-v2-20260108-140000.md
Refinement Applied: ChatGPT-Fundamental Axes in Systems.md (v2.5 five-axis model)

---

## Summary of Refinement Applied

The v2.5 refinement document introduces a **five-axis type coordinate system** that:
1. Replaces the single `World` discriminator with explicit axes
2. Separates concerns cleanly (no concept conflation)
3. Maintains runtime performance via compile-time erasure
4. Enables future extensibility (binding/perspective/branch)

---

## Quick Wins

| # | Item | Status | Resolution |
|---|------|--------|------------|
| 1 | `tMs` vs `time` output naming | RESOLVED | `tMs` for signal, `time` for rail name |
| 2 | `float` vs `number` in Domain | RESOLVED | `float` and `int` are PayloadTypes; `number` is TypeScript-only |
| 3 | `trigger` vs `event` world | RESOLVED | `discrete` is the temporality axis; trigger is `one + discrete` |
| 4 | Phase rail names | RESOLVED | `phaseA`, `phaseB` |
| 5 | Time output type | RESOLVED | `tMs`: cardinality=one, temporality=continuous, payload=int |

---

## 1. Critical Contradictions

### C1: Stateful Block Count (4 vs 5)

- **Status**: RESOLVED
- **Resolution**: MVP stateful primitives (4): UnitDelay, Lag, Phasor, SampleAndHold
- **Note**: Accumulator will be added in a later stage, not MVP

---

### C2: Phasor vs Accumulator Identity

- **Status**: RESOLVED
- **Resolution**: **Distinct** - Phasor and Accumulator are separate primitives (Accumulator deferred to post-MVP)
- Phasor: phase accumulator (0..1 ramp with wrap) - **MVP**
- Accumulator: `y(t) = y(t-1) + x(t)` (unbounded) - **post-MVP**

---

### C3: Lag as Primitive vs Composite

- **Status**: RESOLVED
- **Resolution**: **Lag IS a primitive** - one of the 4 MVP stateful blocks
- Lag: smoothing (linear/exponential)

---

### C4: "State" Block in basic-12-blocks.md

- **Status**: RESOLVED
- **Resolution**: **Remove** - this is just UnitDelay; no separate "State" block concept

---

## 2. High-Impact Ambiguities

### A1: Stateful Primitives World Coverage

- **Status**: RESOLVED
- **Resolution (updated by v2.5)**:
  - Stateful blocks are polymorphic over cardinality
  - State allocation determined by resolved cardinality:
    - `cardinality = one` → allocate one state cell
    - `cardinality = many(domain)` → allocate `N(domain)` state cells (one per lane)
    - `cardinality = zero` → no runtime state exists
  - State keyed by (blockId, laneIndex) tuple

---

### A2: Custom Combine Mode Registry

- **Status**: RESOLVED
- **Resolution**: **Remove entirely** from spec. Combine modes are built-in per type. No custom combine registry.

---

### A3: Domain Lifting Rules for Fields

- **Status**: RESOLVED (clarified by v2.5)
- **Resolution**:
  - Explicit domain reference required for `cardinality = many(domain)`
  - Signal→Field promotion via explicit `broadcast_scalar_to_field` op
  - No implicit domain inference

---

### A4: Phase Type Semantics

- **Status**: RESOLVED
- **Resolution**: Phase is a PayloadType with arithmetic rules:
  - `phase + float` → phase (offset)
  - `phase * float` → phase (scale)
  - `phase + phase` → invalid

---

### A5: Event Payload Shape and Combine

- **Status**: RESOLVED
- **Resolution**: Event payload is versioned with structure:
  ```ts
  { key: string, value: float | int }
  ```
  No optional fields. No `any` types. Blocks interpret events as they see fit.

---

### A6: TimeRoot Output Naming Inconsistency

- **Status**: RESOLVED (retyped by v2.5)
- **Resolution**: Canonical TimeRoot outputs with v2.5 typing:
  - `tMs`: `one + continuous` (payload: int) - monotonic time in milliseconds
  - `phaseA`: `one + continuous` (payload: phase) - primary phase
  - `phaseB`: `one + continuous` (payload: phase) - secondary phase
  - `progress`: `one + continuous` (payload: unit) - 0..1 for finite only
  - `pulse`: `one + discrete` (payload: unit) - frame tick trigger

---

## 3. Type System (v2.5 Five-Axis Model)

### T-NEW-1: World → Cardinality + Temporality Separation

- **Status**: RESOLVED (by refinement)
- **Resolution**: Replace `World` enum with two orthogonal axes:

| Old World | New Cardinality | New Temporality |
|-----------|-----------------|-----------------|
| static | zero | continuous |
| signal | one | continuous |
| field(domain) | many(domain) | continuous |
| event | one OR many(domain) | discrete |

---

### T-NEW-2: PayloadType / Extent / SignalType Naming

- **Status**: RESOLVED (by refinement)
- **Resolution**: New canonical terminology:
  - **PayloadType** (was ValueType): the in-memory/value-level shape
  - **Extent** (was World): the 5-axis coordinate (cardinality/temporality/binding/perspective/branch)
  - **SignalType** (was Type): the complete contract for a port/wire (`PayloadType + Extent`)

```ts
type PayloadType = 'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit';

type Extent = {
  cardinality: AxisTag<Cardinality>;
  temporality: AxisTag<Temporality>;
  binding: AxisTag<Binding>;
  perspective: AxisTag<PerspectiveId>;
  branch: AxisTag<BranchId>;
};

type SignalType = {
  payload: PayloadType;
  extent: Extent;
};
```

---

### T-NEW-3: AxisTag and DefaultSemantics

- **Status**: RESOLVED (by refinement)
- **Resolution**: No optional fields. Explicit defaults via discriminated unions:

```ts
type AxisTag<T> =
  | { kind: 'default' }
  | { kind: 'instantiated'; value: T };

type DefaultSemantics<T> =
  | { kind: 'canonical'; value: T }  // v0
  | { kind: 'inherit' };             // v1+
```

---

### T-NEW-4: Cardinality Axis

- **Status**: RESOLVED (by refinement)
- **Resolution**:

```ts
type DomainId = string;
type DomainRef = { kind: 'domain'; id: DomainId };

type Cardinality =
  | { kind: 'zero' }                      // compile-time constant, no runtime lanes
  | { kind: 'one' }                       // single lane
  | { kind: 'many'; domain: DomainRef };  // N lanes aligned by domain
```

---

### T-NEW-5: Temporality Axis

- **Status**: RESOLVED (by refinement)
- **Resolution**:

```ts
type Temporality =
  | { kind: 'continuous' }  // value exists every frame/tick
  | { kind: 'discrete' };   // event occurrences only
```

---

### T-NEW-6: Binding Axis (v0 default-only)

- **Status**: RESOLVED (by refinement)
- **Resolution**: Exists in type coordinate but inert in v0:

```ts
type ReferentId = string;
type ReferentRef = { kind: 'referent'; id: ReferentId };

type Binding =
  | { kind: 'unbound' }
  | { kind: 'weak'; referent: ReferentRef }
  | { kind: 'strong'; referent: ReferentRef }
  | { kind: 'identity'; referent: ReferentRef };
```

- `unbound`: pure value/signal/field
- `weak`: measurement-like about a referent
- `strong`: property-like about a referent
- `identity`: stable entity identity

**Binding is independent of Domain**: same domain can host unbound image vs bound mask.

---

### T-NEW-7: Perspective and Branch (v0 default-only)

- **Status**: RESOLVED (by refinement)
- **Resolution**: Encoded for future use, canonical defaults in v0:

```ts
type PerspectiveId = string;
type BranchId = string;

const DEFAULTS_V0 = {
  cardinality: { kind: 'canonical', value: { kind: 'one' } },
  temporality: { kind: 'canonical', value: { kind: 'continuous' } },
  binding:     { kind: 'canonical', value: { kind: 'unbound' } },
  perspective: { kind: 'canonical', value: 'global' },
  branch:      { kind: 'canonical', value: 'main' },
};
```

---

### T-NEW-8: Domain as Compile-Time Resource

- **Status**: RESOLVED (by refinement)
- **Resolution**: Domain is NOT a wire value. It's a compile-time declared stable index set:

```ts
type DomainDecl =
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'fixed_count'; count: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'grid_2d'; width: number; height: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'voices'; maxVoices: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'mesh_vertices'; assetId: string } };
```

- Domains are patch-level resources
- Referenced by SignalType via Cardinality axis
- At runtime: loop bounds + layout constants (erased as object)

---

### T-NEW-9: Axis Unification Rules (v0)

- **Status**: RESOLVED (by refinement)
- **Resolution**: Strict v0 join rules (compile-time only):

- `default + default` → `default`
- `default + instantiated(X)` → `instantiated(X)`
- `instantiated(X) + instantiated(X)` → `instantiated(X)`
- `instantiated(X) + instantiated(Y), X≠Y` → **type error**

No implicit merges. No "best effort." Applied to all five axes.

---

### T-NEW-10: Field as SignalType Specialization

- **Status**: RESOLVED (by refinement)
- **Resolution**: A **Field** is a SignalType where:
  - `extent.cardinality = many(domain)`
  - `extent.temporality = continuous`

Taxonomy:
- **Signal**: `one + continuous`
- **Field**: `many(domain) + continuous`
- **Event**: `one + discrete`
- **Per-lane Event**: `many(domain) + discrete`

---

## 4. Terminology & Naming

### Ambiguous Terms (All Resolved)

| # | Term | Status | Resolution |
|---|------|--------|------------|
| T1 | Domain (concept) | RESOLVED | `Domain` = compile-time resource (element topology); NOT a wire value |
| T2 | Phasor | RESOLVED | Distinct from Accumulator |
| T3 | Lag | RESOLVED | Doesn't exist |
| T4 | field domain ref | RESOLVED | Cardinality axis references DomainId |
| T5 | float vs number | RESOLVED | `float` and `int` are PayloadTypes; `number` is TypeScript-only |
| T6 | trigger vs event | RESOLVED | `discrete` is temporality; trigger = `one + discrete` |
| T7 | time type | RESOLVED | `tMs`: `one + continuous` + `int` |
| T8 | unit vs unit01 | RESOLVED | Use `unit` as PayloadType for [0,1] values |
| T9 | ValueType | RESOLVED | Renamed to **PayloadType** |
| T10 | World | RESOLVED | Split into **Cardinality** + **Temporality** (+ other axes) |
| T11 | Type | RESOLVED | Renamed to **SignalType** |
| T12 | 5-axis coordinate | RESOLVED | Named **Extent** |

---

## 5. Gaps and Missing Content

### G1: Default Source Catalog

- **Status**: RESOLVED
- **Resolution**: Defaults should be useful, not zeros. Use rails where sensible:
  - float: `phaseA` rail or `Constant(0.5)`
  - int: `Constant(1)`
  - vec2: `Constant([0.5, 0.5])` (center)
  - color: `HueRainbow(phaseA)` or `Constant(white)`
  - phase: `phaseA` rail
  - bool: `Constant(true)`
  - unit: `phaseA` rail or `Constant(0.5)`
  - domain: `DomainN(100)`

---

### G2: Block Roles Specification

- **Status**: RESOLVED
- **Resolution**: Block and Edge roles use discriminated unions with `derived`:

```ts
type BlockRole =
  | { kind: "user" }
  | { kind: "derived"; meta: DerivedBlockMeta };

type DerivedBlockMeta =
  | { kind: "defaultSource"; target: { kind: "port"; port: PortRef } }
  | { kind: "wireState";     target: { kind: "wire"; wire: WireId } }
  | { kind: "bus";           target: { kind: "bus"; busId: BusId } }
  | { kind: "rail";          target: { kind: "bus"; busId: BusId } }
  | { kind: "lens";          target: { kind: "node"; node: NodeRef; port?: string } };

type EdgeRole =
  | { kind: "user" }
  | { kind: "default"; meta: { defaultSourceBlockId: BlockId } }
  | { kind: "busTap";  meta: { busId: BusId } }
  | { kind: "auto";    meta: { reason: "portMoved" | "rehydrate" | "migrate" } };
```

---

### G3: Cycle Validation Details

- **Status**: RESOLVED
- **Resolution**: Tarjan's algorithm for SCC detection. Each SCC must contain at least one stateful primitive.

---

### G4: Complete Primitive Block Catalog

- **Status**: RESOLVED
- **Resolution**: Basic-12 blocks define MVP. UnitDelay (not "State").

---

### G5: State Migration on Block ID Change

- **Status**: RESOLVED
- **Resolution**: Block IDs are stable UUIDs. State is per-ID. Hot-swap matches by ID.

---

### G6: Runtime Erasure Requirements

- **Status**: RESOLVED (by refinement)
- **Resolution**: Hard constraints for 5-10ms budget:
  1. No axis tags exist in runtime values
  2. No referent ids exist in runtime values
  3. No domain objects at runtime; only loop constants/layout
  4. Perspective/Branch select program variants (v1+); in v0 exactly one

Runtime sees only: scalar values, dense arrays, event buffers, compiled schedules.

---

### G7: NormalizedGraph Representation

- **Status**: RESOLVED (by refinement)
- **Resolution**:

```ts
type NormalizedGraph = {
  domains: DomainDecl[];
  nodes: Node[];
  edges: Edge[];
};
```

Ports are typed (SignalType); edges are simple connections. Combine mode is on input port.

---

### G8: CompiledProgramIR Storage Model

- **Status**: RESOLVED (by refinement)
- **Resolution**: Erased semantics runtime storage:

```ts
type ScalarSlot = { kind: 'scalar_slot'; id: number };
type FieldSlot  = { kind: 'field_slot'; id: number; domain: DomainId };
type EventSlot  = { kind: 'event_slot'; id: number };
type StateSlot  = { kind: 'state_slot'; id: number };
```

No binding/perspective/branch at runtime.

---

## 6. Low-Impact Items (All Resolved)

| # | Item | Status | Resolution |
|---|------|--------|------------|
| L1 | DomainTag includes "event" and "domain" | RESOLVED | Moot - PayloadType excludes these |
| L2 | "path2d" in Domain enum | RESOLVED | Asset type, not PayloadType |
| L3 | Config vs Scalar world | RESOLVED | `cardinality = zero` (static) |
| L4 | Rail list completeness | RESOLVED | MVP: time, phaseA, phaseB, pulse |
| L5 | FieldExpr vs Field type | RESOLVED | Field = SignalType constraint; FieldExpr = IR node |

---

## 7. Naming Changes Summary (Updated)

| Old | New | Reason |
|-----|-----|--------|
| `DomainTag` | `PayloadType` | Domain = topology; PayloadType = float/vec2/etc |
| `ValueType` | `PayloadType` | More precise - it's the payload of the signal |
| `World` | `Extent` (5-axis coordinate) | World implied scene; Extent = where/when/about-what |
| `Type` / `TypeDesc` | `SignalType` | Complete contract: PayloadType + Extent |
| `config` / `scalar` | `cardinality = zero` | Clearer: no runtime lanes |
| `signal` | `cardinality = one, temporality = continuous` | Explicit axes |
| `field(domain)` | `cardinality = many(domain), temporality = continuous` | Explicit axes |
| `event` | `temporality = discrete` | Orthogonal to cardinality |
| `Block.type` | `Block.kind` | Reserve `type` for type system |
| `structural` | `derived` | Better describes system-generated |

---

## 8. Resolution Progress

| Category | Total | Resolved | Remaining |
|----------|-------|----------|-----------|
| Quick Wins | 5 | 5 | 0 |
| Critical Contradictions | 4 | 4 | 0 |
| High-Impact Ambiguities | 6 | 6 | 0 |
| Type System (v2.5) | 10 | 10 | 0 |
| Terminology | 12 | 12 | 0 |
| Gaps | 8 | 8 | 0 |
| Low-Impact | 5 | 5 | 0 |
| **Total** | **50** | **50** | **0** |

**Progress: 100%**

All items resolved including v2.5 type system refinements. Ready to generate master compendium.
