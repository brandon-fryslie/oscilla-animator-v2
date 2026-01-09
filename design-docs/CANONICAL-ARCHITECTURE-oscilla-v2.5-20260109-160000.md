---
command: /canonicalize-architecture design-docs/spec/ @"design-docs/spec/_architecture-refinement/ChatGPT-Fundamental Axes in Systems.md"
files: INDEX.md 00-invariants.md AMBIGUITIES.md graph/02-time.md graph/03-buses.md graph/06-blocks.md graph/07-transforms.md graph/08-primitives-composites.md graph/stateful-blocks.md graph/basic-12-blocks.md compiler/01-type-system.md compiler/02-polymorphism.md compiler/03-category-theory.md compiler/04-compilation.md compiler/canonical-types-and-constraints.md compiler/canonical-types-and-constraints-UPDATED.md compiler/maybe-block-defs.md runtime/05-runtime.md renderer/09-renderer.md renderer/RENDER-PIPELINE.md time/10-phase-matching-system.md time/11-phase-unwrap-IMPORTANT.md _architecture-refinement/ChatGPT-Fundamental Axes in Systems.md
status: CANONICAL
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
archived_to: design-docs/spec-archived-20260109-160000/
encyclopedia: CANONICAL-oscilla-v2.5-20260109/
---

# Oscilla v2.5: Canonical Architecture Specification

> **This is the authoritative source of truth for the Oscilla Animator v2.5 type system and architecture.**
> Generated after full resolution of all contradictions, ambiguities, and gaps.
> All other design documents for this topic are superseded by this specification.
>
> **For detailed specifications, see the encyclopedia:** [CANONICAL-oscilla-v2.5-20260109/](./CANONICAL-oscilla-v2.5-20260109/)

Generated: 2026-01-09T16:00:00Z
Approved by: Brandon Fryslie
Approval Method: Full walkthrough (50 items reviewed)

Source Documents: 23 files from `design-docs/spec/`
Resolution History:
- CANONICALIZED-QUESTIONS-oscilla-v2-20260108-140000.md
- CANONICALIZED-QUESTIONS-oscilla-v2-20260109-120000.md
- USER-APPROVAL-oscilla-v2-20260109-150000.md

**Encyclopedia Topics (detailed specifications):**
- [01-type-system.md](./CANONICAL-oscilla-v2.5-20260109/topics/01-type-system.md) - Five-axis type model
- [02-block-system.md](./CANONICAL-oscilla-v2.5-20260109/topics/02-block-system.md) - Blocks and roles
- [03-time-system.md](./CANONICAL-oscilla-v2.5-20260109/topics/03-time-system.md) - Time and rails
- [04-compilation.md](./CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md) - Compilation pipeline
- [05-runtime.md](./CANONICAL-oscilla-v2.5-20260109/topics/05-runtime.md) - Execution model
- [06-renderer.md](./CANONICAL-oscilla-v2.5-20260109/topics/06-renderer.md) - Render pipeline

---

## 1. Overview

Oscilla v2.5 is a **looping, interactive visual instrument** compiled from a typed reactive graph. It is a node-based animation system built on dataflow architecture with category-theoretic principles (Functor/Applicative patterns).

### What Oscilla Does

- Users create visual animations by connecting blocks in a patch
- The system compiles patches to efficient runtime code
- Animations loop continuously, responding to time and user input
- Everything flows through typed wires with deterministic evaluation

### Key Design Principles

1. **No special cases** - Align with category theory
2. **No optional fields** - Use discriminated unions (`AxisTag` pattern)
3. **Single source of truth** - Each concept has one canonical representation
4. **Runtime erasure** - All type information resolved at compile time
5. **State is explicit** - Only 4 stateful primitives; everything else is pure

### v2.5 Major Change

The type system upgrades from a single `World` discriminator to a **five-axis coordinate system** that cleanly separates concerns without concept conflation, while maintaining runtime performance via compile-time erasure.

---

## 2. Invariants

These are non-negotiable rules. Violations indicate bugs.

### 2.1 Graph and Compilation Boundaries

- **Compiler never mutates the graph.** No blocks or edges inserted during compilation.
- **GraphNormalization is required.** Compiler consumes fully explicit NormalizedGraph.
- **Everything is a block or wire at compile time.** Buses, default sources, lenses are derived blocks.
- **Transforms are blocks.** Lenses/adapters normalize into explicit derived blocks.
- **Derived blocks are real blocks.** Compiled and executed like any other block.

### 2.2 Time

- **Time is monotonic and unbounded.** `tMs` never wraps, resets, or clamps.
- **Only two TimeRoot kinds exist:** finite and infinite.
- **TimeRoot is system-managed.** Not user-placeable on patch.

### 2.3 Multi-Writer Inputs

- **Every input supports multiple writers.** No implicit single-writer assumption.
- **Every input has a CombineMode.** Deterministic combination each frame.
- **DefaultSource block is ALWAYS connected during GraphNormalization.**

### 2.4 State and Feedback

- **The vast majority of blocks are PURE and STATELESS.**
- **Statefulness must be explicit.** Any operation with memory is a block.
- **Feedback only through explicit stateful blocks.**
- **Cycle validation is mandatory.** Every cycle must cross a stateful boundary.

### 2.5 Determinism and Replay

- **No Math.random() at runtime.** All randomness is seeded and deterministic.
- **Order-dependent combine is deterministic.** Writer ordering is stable and explicit.
- **Replay is exact.** Given patch revision + seed + inputs, output is identical.

### 2.6 Runtime Continuity

- **Hot-swap preserves time.** Recompilation never resets `tMs`.
- **State continuity follows explicit StateIds.** If identity changes, state resets with diagnostics.
- **Old program renders until new program is ready.** Swap is atomic.

### 2.7 Runtime Erasure (MVP)

Hard constraints for 5-10ms performance budget:

1. No axis tags exist in runtime values
2. No referent ids exist in runtime values
3. No domain objects at runtime - only loop bounds + layout constants
4. Perspective/Branch are v0 defaults only

Runtime sees only: scalar values, dense arrays, event buffers, compiled schedules.

### 2.8 Expression DAG Efficiency

- **Structural sharing / hash-consing for expr DAGs.** Identical FieldExpr/SignalExpr subtrees share an ExprId. Cache hit rate increases as patches reuse structures. Recompile doesn't explode expr count for unchanged semantics.

### 2.9 Cache Keys

- **Cache keys are explicit and correct.** Every cache depends on: (time, domain, upstream slots, params, state version). Caches express "stable across frames" vs "changes each frame". Cross-hot-swap reuse when StepIds persist. Without explicit cache keys, the system oscillates between "slow" and "wrong."

### 2.10 Render Contract

- **Renderer is a sink, not an engine.** Renderer accepts render commands/instances, batches, sorts, culls, rasterizes. Zero "creative logic" in renderer—all motion/layout/color comes from the patch.
- **Batching is planned, not accidental.** Render output contains enough info to batch deterministically (style/material keys, z/layer, blend). Renderer does minimal per-instance work in hot loop.
- **No-jank edits.** Old program renders until new program is ready. Swap is atomic. No flicker/blank frames during compile/swap.

### 2.11 Debuggability

- **Structural instrumentation.** Every meaningful runtime action maps to stable IR identifiers (NodeId/BusId/StepId/ExprId/ValueSlot). Tracing is not heuristic.
- **Low-overhead tracing.** Ring buffers / low allocation in hot paths. Can be enabled without rewriting evaluation.
- **Causal explainability.** Always possible to reconstruct "why this value is this" via causal links: source slot → transforms → bus combine → consumer.

---

## 3. Architecture

### 3.1 Type System (Five-Axis Model)

#### 3.1.1 PayloadType

The base data type of a value - what the payload is made of.

```ts
type PayloadType = 'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit';
```

**Notes:**
- `float` and `int` are PayloadTypes (domain model)
- `number` is TypeScript-only (implementation detail)
- Does NOT include 'event' or 'domain'

#### 3.1.2 Extent (5-Axis Coordinate)

Describes where/when/about-what a value exists. Independent of payload.

```ts
type Extent = {
  cardinality: AxisTag<Cardinality>;
  temporality: AxisTag<Temporality>;
  binding: AxisTag<Binding>;
  perspective: AxisTag<PerspectiveId>;
  branch: AxisTag<BranchId>;
};
```

#### 3.1.3 SignalType (Complete Contract)

The full type description for a port or wire.

```ts
type SignalType = {
  payload: PayloadType;
  extent: Extent;
};
```

#### 3.1.4 AxisTag (No Optional Fields)

Discriminated union representing "default unless instantiated".

```ts
type AxisTag<T> =
  | { kind: 'default' }
  | { kind: 'instantiated'; value: T };
```

#### 3.1.5 Cardinality (How Many Lanes)

```ts
type DomainId = string;
type DomainRef = { kind: 'domain'; id: DomainId };

type Cardinality =
  | { kind: 'zero' }                      // compile-time constant, no runtime lanes
  | { kind: 'one' }                       // single lane
  | { kind: 'many'; domain: DomainRef };  // N lanes aligned by domain
```

**Mapping from old World:**
- `zero` = was `static` / `config` / `scalar`
- `one` = was `signal`
- `many(domain)` = was `field(domain)`

#### 3.1.6 Temporality (When)

```ts
type Temporality =
  | { kind: 'continuous' }  // value exists every frame/tick
  | { kind: 'discrete' };   // event occurrences only
```

#### 3.1.7 Binding (v0: Default-Only)

```ts
type ReferentId = string;
type ReferentRef = { kind: 'referent'; id: ReferentId };

type Binding =
  | { kind: 'unbound' }
  | { kind: 'weak'; referent: ReferentRef }
  | { kind: 'strong'; referent: ReferentRef }
  | { kind: 'identity'; referent: ReferentRef };
```

**Note:** Binding is independent of Domain. Same domain can host unbound image vs bound mask.

#### 3.1.8 V0 Canonical Defaults

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

#### 3.1.9 World → Axes Mapping Table

| Old World | Cardinality | Temporality |
|-----------|-------------|-------------|
| static | zero | continuous |
| signal | one | continuous |
| field(domain) | many(domain) | continuous |
| event | one OR many(domain) | discrete |

**Derived Concepts:**
- **Signal**: `one + continuous`
- **Field**: `many(domain) + continuous` (UI still uses "field" terminology)
- **Trigger**: `one + discrete`
- **Per-lane Event**: `many(domain) + discrete`

### 3.2 Domain System

#### 3.2.1 Domain as Compile-Time Resource

Domain is NOT a wire value. It's a compile-time declared stable index set.

```ts
type DomainDecl =
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'fixed_count'; count: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'grid_2d'; width: number; height: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'voices'; maxVoices: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'mesh_vertices'; assetId: string } };
```

**Properties:**
- Domains are patch-level resources
- Referenced by SignalType via Cardinality axis
- At runtime: erased to loop bounds + layout constants
- v0 invariant: every domain compiles to dense lanes 0..N-1

### 3.3 Block System

#### 3.3.1 Block Structure

```ts
interface Block {
  id: BlockId;
  kind: string;        // "Add", "UnitDelay", etc. (NOT type)
  role: BlockRole;
  // ...
}
```

**Note:** Use `kind` property, not `type` (reserved for type system).

#### 3.3.2 Block and Edge Roles

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

#### 3.3.3 Stateful Primitives

**MVP Set (4 primitives):**

| Block | Definition | Behavior |
|-------|------------|----------|
| **UnitDelay** | Fundamental feedback gate | `y(t) = x(t-1)` |
| **Lag** | Smoothing filter | Linear/exponential smooth toward target |
| **Phasor** | Phase accumulator | 0..1 ramp with wrap semantics |
| **SampleAndHold** | Latch on trigger | `if trigger(t): y(t) = x(t) else y(t) = y(t-1)` |

**Post-MVP:** Accumulator (`y(t) = y(t-1) + x(t)`, unbounded, distinct from Phasor)

**Note:** Lag is technically a composite but labeled as primitive for practical purposes. The distinction is arbitrary.

**State Allocation by Cardinality:**
- `cardinality = one` → one state cell
- `cardinality = many(domain)` → N(domain) state cells
- `cardinality = zero` → no runtime state

State keyed by `(blockId, laneIndex)` tuple.

#### 3.3.4 Basic 12 Blocks (MVP)

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
11. **HSV->RGB** - Color conversion
12. **RenderInstances2D** - Render sink

### 3.4 Time System

#### 3.4.1 TimeRoot Outputs

| Output | Cardinality | Temporality | Payload | Description |
|--------|-------------|-------------|---------|-------------|
| `tMs` | one | continuous | int | Monotonic time in milliseconds |
| `phaseA` | one | continuous | phase | Primary phase |
| `phaseB` | one | continuous | phase | Secondary phase |
| `progress` | one | continuous | unit | 0..1 for finite only |
| `pulse` | one | discrete | unit | Frame tick trigger |

#### 3.4.2 Rails

Immutable system-provided buses. Cannot be deleted or renamed. Rails are blocks—they can have inputs overridden and be driven by feedback like any other block.

**MVP Rails:** `time`, `phaseA`, `phaseB`, `pulse`, `palette`

**Note:** `palette` is the chromatic reference frame—a time-indexed color signal that provides the default color atmosphere for a patch. It exists whether or not the patch references it.

### 3.5 Compilation Pipeline

```
RawGraph → GraphNormalization → NormalizedGraph → Compilation → CompiledProgramIR
```

#### 3.5.1 NormalizedGraph

```ts
type NormalizedGraph = {
  domains: DomainDecl[];
  nodes: Node[];
  edges: Edge[];
};
```

Ports are typed (SignalType); edges are simple connections. Combine mode is on input port.

#### 3.5.2 Where the Five-Axis Model Lives

- **GraphNormalization**: assigns initial SignalType coordinates (mostly with `AxisTag.default`)
- **Compilation**:
  - Unifies axes (join rules)
  - Resolves defaults (DEFAULTS_V0, FRAME_V0)
  - Specializes schedules/loops based on resolved axes
  - Allocates state slots based on cardinality
  - **Erases axes from runtime IR**

#### 3.5.3 Axis Unification Rules (v0)

Strict join rules, compile-time only:

- `default + default` → `default`
- `default + instantiated(X)` → `instantiated(X)`
- `instantiated(X) + instantiated(X)` → `instantiated(X)`
- `instantiated(X) + instantiated(Y), X≠Y` → **type error**

No implicit merges. No "best effort." Applied to all five axes.

#### 3.5.4 CompiledProgramIR Storage Model (MVP)

```ts
type ScalarSlot = { kind: 'scalar_slot'; id: number };
type FieldSlot  = { kind: 'field_slot'; id: number; domain: DomainId };
type EventSlot  = { kind: 'event_slot'; id: number };
type StateSlot  = { kind: 'state_slot'; id: number };
```

No binding/perspective/branch at runtime.

### 3.6 Combine System

**Built-in only. No custom registry.**

| Type | Available Modes |
|------|-----------------|
| Numeric | sum, average, min, max, mul |
| Any | last, first, layer |
| Boolean | or, and |

### 3.7 Default Sources

Use useful defaults, not zeros. Prefer rails for animation.

| PayloadType | Default |
|-------------|---------|
| float | `phaseA` rail or `Constant(0.5)` |
| int | `Constant(1)` |
| vec2 | `Constant([0.5, 0.5])` |
| color | `HueRainbow(phaseA)` or `Constant(white)` |
| phase | `phaseA` rail |
| bool | `Constant(true)` |
| unit | `phaseA` rail or `Constant(0.5)` |
| domain | `DomainN(100)` |

### 3.8 Events

#### 3.8.1 Event Payload

```ts
{ key: string, value: float | int }
```

Versioned. No optional fields. No `any` types. Blocks interpret events as they see fit.

#### 3.8.2 Phase Type Semantics

- `phase + float` → phase (offset)
- `phase * float` → phase (scale)
- `phase + phase` → **invalid** (type error)

---

## 4. Glossary

### 4.1 Core Terms

| Term | Definition |
|------|------------|
| **PayloadType** | Base data type: `float | int | vec2 | color | phase | bool | unit` |
| **Extent** | 5-axis coordinate: cardinality/temporality/binding/perspective/branch |
| **SignalType** | Complete type contract: `PayloadType + Extent` |
| **Cardinality** | How many lanes: `zero | one | many(domain)` |
| **Temporality** | When value exists: `continuous | discrete` |
| **Binding** | Referential anchoring: `unbound | weak | strong | identity` |
| **Domain** | Compile-time resource defining element topology (NOT a wire value) |
| **Field** | SignalType with `many(domain) + continuous` |
| **Signal** | SignalType with `one + continuous` |
| **Trigger** | SignalType with `one + discrete` |
| **Block** | The only compute unit; has stable identity, typed ports |
| **Rail** | Immutable system-provided bus |
| **CombineMode** | Strategy for combining multiple writers to an input |

### 4.2 Naming Conventions

#### Types
- **PascalCase**: `SignalType`, `PayloadType`, `BlockRole`, `Extent`

#### Blocks
- **PascalCase**: `UnitDelay`, `RenderInstances2D`
- Use `kind` property (not `type`)

#### Variables
- **camelCase**: `tMs`, `dtMs`, `phaseA`
- Time values suffixed with unit: `tMs`, `durationMs`

#### Discriminated Unions
- Use `kind` as discriminator everywhere
- Closed unions (no free-form keys)
- No optional fields - use union branches

### 4.3 Deprecated Terms

| Deprecated | Use Instead |
|------------|-------------|
| DomainTag | PayloadType |
| ValueType | PayloadType |
| World | Extent |
| Type / TypeDesc | SignalType |
| config (world) | cardinality = zero |
| scalar (world) | cardinality = zero |
| signal (world) | one + continuous |
| field (world) | many(domain) + continuous |
| event (world) | discrete temporality |
| Block.type | Block.kind |
| structural (role) | derived |
| State block | UnitDelay |
| custom combine | (removed) |

---

## 5. Behavioral Specifications

### 5.1 State Migration

Block IDs are stable UUIDs. State is keyed per-ID. Hot-swap matches by ID.

**MVP behavior:** If block ID changes, state resets with diagnostics.

**Note:** May evolve for better stability/UX/no resets during playback.

### 5.2 Domain Lifting

- Explicit domain reference required for `cardinality = many(domain)`
- Signal→Field promotion via explicit `broadcast_scalar_to_field` op
- **No implicit domain inference**

### 5.3 Cycle Validation

Tarjan's algorithm for SCC detection. Each strongly-connected component must contain at least one stateful primitive.

---

## 6. Error Handling

### 6.1 Type Errors

- Axis unification mismatch: `instantiated(X) + instantiated(Y)` where X≠Y
- Phase arithmetic: `phase + phase` is invalid
- Domain mismatch: `many(A)` cannot combine with `many(B)`

### 6.2 Graph Errors

- Cycle without stateful primitive
- Missing required input (after default source application)

---

## 7. Edge Cases

### 7.1 Cardinality Zero at Runtime

A `cardinality = zero` value doesn't exist at runtime - it's inlined by the compiler. `Constant(5)` with cardinality=zero produces no slot, just literal `5` in generated code.

### 7.2 Per-Lane Events

Values with `cardinality = many(domain)` and `temporality = discrete`. Representation details deferred to implementation.

---

## 8. Resolution Log

Key decisions made during canonicalization:

| Decision | Options Considered | Resolution | Rationale |
|----------|-------------------|------------|-----------|
| Stateful primitive count | 3, 4, or 5 | 4 MVP + 1 post-MVP | UnitDelay, Lag, Phasor, SampleAndHold for MVP; Accumulator later |
| Lag status | Primitive vs composite | Primitive (labeled) | Technically composite but distinction arbitrary |
| Phasor vs Accumulator | Same vs distinct | Distinct | Different semantics: wrap vs unbounded |
| Custom combine modes | Allow vs disallow | Disallow | Complexity not worth marginal benefit |
| Domain on wires | Wire value vs resource | Compile-time resource | Runtime performance, cleaner types |
| World replacement | Keep vs split | Split into 5 axes | Clean separation of concerns |
| Optional fields | Allow vs unions | Discriminated unions | TypeScript type narrowing, explicit defaults |
| Block.type naming | Keep vs rename | Rename to Block.kind | Reserve `type` for type system |
| Role naming | structural vs derived | derived | Better describes system-generated entities |
| Default sources | Zeros vs useful values | Useful values | Animation system should move by default |

---

## Appendix A: Source Document Map

| Section | Primary Sources |
|---------|-----------------|
| Invariants | 00-invariants.md |
| Type System | compiler/01-type-system.md, compiler/canonical-types-and-constraints.md, _architecture-refinement/ChatGPT-Fundamental Axes in Systems.md |
| Block System | graph/06-blocks.md, graph/08-primitives-composites.md |
| Stateful Blocks | graph/stateful-blocks.md |
| Time System | graph/02-time.md |
| Buses/Rails | graph/03-buses.md |
| Compilation | compiler/04-compilation.md |
| Runtime | runtime/05-runtime.md |
| Renderer | renderer/09-renderer.md, renderer/RENDER-PIPELINE.md |

## Appendix B: Superseded Documents

The following documents are now historical artifacts. This compendium is the authoritative source:

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

## Appendix C: Approval Notes

The following items were approved with user clarifications:

1. **Lag as Primitive** - Technically composite but labeled primitive; distinction arbitrary
2. **Field terminology** - UI will still use "field"; SignalType constraint is internal
3. **State Migration** - MVP behavior; may evolve for better stability/UX
4. **Runtime Erasure** - Hard requirement for MVP only
5. **CompiledProgramIR Storage** - MVP only
