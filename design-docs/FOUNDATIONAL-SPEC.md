---
parent: INDEX.md
priority: CRITICAL
---

# System Invariants

> **These rules are non-negotiable. Violations indicate bugs.**

Invariants are prominently placed because they constrain all other decisions.
When reading topic documents, keep these rules in mind.

---

## A. Time, Continuity, and Edit-Safety

### I1: Time is Monotonic and Unbounded

**Rule**: `tMs` never wraps, resets, or clamps. Time is always increasing.

**Rationale**: Monotonic time is required for deterministic phase calculations and replay.

**Consequences of Violation**: Phase discontinuities, non-deterministic behavior, broken replay.

**Enforcement**: Runtime assertion; TimeRoot implementation.

---

### I2: Gauge Invariance (Transport Continuity)

**Rule**: Effective values (phase, parameters, fields) are continuous across discontinuities unless explicitly reset by user action. This is enforced by gauge layers (phase offset, value reconciliation, field projection) that absorb discontinuities.

**Formal Statement**: For all observables `x_eff(t)`:
```
lim(t→t0⁻) x_eff(t) = lim(t→t0⁺) x_eff(t)
```
Even when underlying `x_base(t)` jumps due to scrubbing, looping, hot-swap, or topology changes.

**Rationale**: Without gauge invariance:
- Scrubbing breaks animation
- Loops pop at boundaries
- Edits feel jarring
- Export cannot match playback
- The system feels mechanical, not alive

**Consequences of Violation**: Visual pops, broken export parity, unusable live editing.

**Enforcement**: Continuity System (topic 11); phase offset in timeDerive; value reconciliation and field projection at hot-swap boundaries.

**See**: [11-continuity-system](./topics/11-continuity-system.md) for complete specification.

---

### I3: State Continuity with Stable IDs

**Rule**: Stateful blocks have stable StateIds. Migration rules:
- Same StateId + same type/layout → copy
- Same StateId + compatible layout → transform
- Else → reset + surface as diagnostic

**Rationale**: Without this, no determinism, debugging, or Rust port.

**Consequences of Violation**: State becomes "whatever closure happened to persist."

**Enforcement**: State migration system with diagnostics.

---

### I4: Deterministic Event Ordering

**Rule**: Events need stable ordering across combine and within-frame scheduling.

**Rationale**: "Sometimes it triggers, sometimes not" kills performance contexts.

**Consequences of Violation**: Non-deterministic behavior in live performance.

**Enforcement**: Explicit ordering in scheduler; writer order is stable.

---

### I5: Single Time Authority

**Rule**: One authority produces time; everything else derives.

**Rationale**: No "player loops" competing with patch loops.

**Consequences of Violation**: Unexplained jumps on bar boundaries.

**Enforcement**: Single TimeRoot per patch.

---

## B. Graph Semantics

### I6: Compiler Never Mutates the Graph

**Rule**: No blocks or edges inserted during compilation.

**Rationale**: The compiler consumes a fully explicit NormalizedGraph.

**Consequences of Violation**: Hidden behavior, debugging impossible.

**Enforcement**: Type signature; NormalizedGraph is immutable input.

---

### I7: Explicit Cycle Semantics

**Rule**: Cycles must be:
- Detected structurally (Tarjan's SCC)
- Validated (crosses a memory boundary - stateful block)
- Scheduled deterministically

**Rationale**: Otherwise any "cool" patch becomes a random bug generator.

**Consequences of Violation**: Non-deterministic feedback behavior.

**Enforcement**: Cycle validation in compiler.

---

### I8: Slot-Addressed Execution

**Rule**: Names are for UI; runtime uses indices. No lookups by string, closures, or object graphs in hot loops.

**Rationale**: Required for performance targets and Rust port.

**Consequences of Violation**: Never hit perf targets; Rust will be miserable.

**Enforcement**: CompiledProgramIR uses slot indices only.

---

### I9: Schedule is Data

**Rule**: No hidden evaluation. Schedule is inspectable, diffable, traceable data.

**Rationale**: If runtime behavior lives in incidental traversal order, debugging is impossible.

**Consequences of Violation**: Non-reproducible behavior.

**Enforcement**: Schedule IR is explicit data structure.

---

### I10: Uniform Transform Semantics

**Rule**: Transforms are table-driven and type-driven:
- Scalar transforms → scalars
- Signal transforms → signal plans
- Field transforms → field expr nodes
- Reductions (field→signal) are explicit and diagnosable

**Rationale**: If transforms are "whatever each block does," you can't reason about patches.

**Consequences of Violation**: Unpredictable type behavior.

**Enforcement**: Transform registry with type rules.

---

## C. Fields, Identity, and Performance

### I11: Stable Element Identity

**Rule**: Instances provide stable element IDs, not "array indices we hope stay stable."

**Rationale**: Required for: temporal effects, physics, per-element state, selection UI, caches.

**Consequences of Violation**: Can't do trails, history, physics, or coherent UI.

**Enforcement**: Instance as first-class identity handle; pool-based allocation with stable indices.

---

### I12: Lazy Fields with Explicit Materialization

**Rule**: Materialization must be scheduled, cached, and attributable.

**Rationale**: If every field becomes an array "because it's easiest," you hit a wall.

**Consequences of Violation**: Memory and performance explosion.

**Enforcement**: Explicit materialization points; field expr DAGs.

---

### I13: Structural Sharing / Hash-Consing

**Rule**: Identical FieldExpr/SignalExpr subtrees share an ExprId.

**Rationale**: Without canonicalization, compilation and runtime explode.

**Consequences of Violation**: Duplicate computation; memory bloat.

**Enforcement**: Hash-consing in expr construction.

---

### I14: Explicit Cache Keys

**Rule**: Every cache depends on: (time, instance, upstream slots, params, state version).

**Rationale**: Without explicit cache keys, oscillate between "slow" and "wrong."

**Consequences of Violation**: Stale caches or cache misses everywhere.

**Enforcement**: Cache key model in compilation.

---

## D. Rendering

### I15: Renderer is a Sink, Not an Engine

**Rule**: Renderer accepts render commands/instances, batches, sorts, culls, rasterizes. Zero "creative logic."

**Rationale**: All motion/layout/color comes from the patch.

**Consequences of Violation**: Renderer becomes second patch system.

**Enforcement**: Render IR; no "radius/wobble/spiral mode" in renderer.

---

### I16: Real Render IR

**Rule**: Generic render intermediate with instances, geometry assets, materials, layering.

**Rationale**: Otherwise every new visual idea requires new renderer code.

**Consequences of Violation**: Renderer becomes bottleneck for features.

**Enforcement**: Render IR specification.

---

### I17: Planned Batching

**Rule**: Render output contains enough info to batch deterministically.

**Rationale**: Canvas/WebGL performance requires minimizing state changes and draw calls.

**Consequences of Violation**: CPU-bound rendering.

**Enforcement**: Style/material keys, z/layer, blend in render commands.

---

### I18: Temporal Stability in Rendering

**Rule**: Old program renders until new program is ready. Swap is atomic. No flicker.

**Rationale**: Otherwise live editing feels like "glitching a web demo."

**Consequences of Violation**: Jank during edits.

**Enforcement**: Atomic swap; render continuity.

---

## E. Debuggability

### I19: First-Class Error Taxonomy

**Rule**: Errors include:
- Type mismatch: from/to, suggested adapters
- Cycle illegal: show loop and missing memory edge
- Bus conflict: show publishers + combine semantics
- Forced materialization: show culprit sink and expr chain

**Rationale**: If errors are vague, only programmers can use it.

**Consequences of Violation**: Unusable for non-programmers.

**Enforcement**: Error types in compiler output.

---

### I20: Traceability by Stable IDs

**Rule**: Every value is attributable: produced by NodeId/StepId, transformed by lens chain, combined on BusId, materialized due to SinkId.

**Rationale**: Must answer "why is this 0?" quickly.

**Consequences of Violation**: Feels like a toy.

**Enforcement**: Structural instrumentation with stable IDs.

---

### I21: Deterministic Replay

**Rule**: Given PatchRevision + Seed + inputs, output is identical.

**Rationale**: Foundation for bug reports, performance tuning, collaboration, server authority.

**Consequences of Violation**: Can't reproduce issues.

**Enforcement**: No Math.random(); seeded randomness only.

---

## F. Live Performance

### I22: Safe Modulation Ranges

**Rule**: Normalized domains (0..1, phase 0..1, timeMs), explicit unit tags where critical.

**Rationale**: Otherwise patches become fragile "magic numbers."

**Consequences of Violation**: Patches can't be reused.

**Enforcement**: Unit discipline in type system.

---

## G. Scaling

### I23: Separation of Patch vs Instance

**Rule**: A patch is a spec. A runtime instance has: time state, state cells, caches, inputs, render target.

**Rationale**: Required for multi-client and server-authoritative.

**Consequences of Violation**: Can't scale beyond single browser tab.

**Enforcement**: Patch/Instance separation in architecture.

---

### I24: Snapshot/Transaction Model

**Rule**: Live edits are transactional.

**Rationale**: Required for multi-client sync and trustworthy undo/redo.

**Consequences of Violation**: Desync and broken undo.

**Enforcement**: Transaction-based edit model.

---

### I25: Asset System with Stable IDs

**Rule**: Assets (geometry, fonts, SVGs) have stable IDs.

**Rationale**: Required for collaboration and deployment.

**Consequences of Violation**: "Whatever the client has loaded" breaks collaboration.

**Enforcement**: Asset registry with IDs.

---

## H. Architecture Laws

### I26: Every Input Has a Source

**Rule**: DefaultSource block is ALWAYS connected during GraphNormalization.

**Rationale**: Combine modes require exactly one aggregated value per frame.

**Consequences of Violation**: Undefined input behavior.

**Enforcement**: GraphNormalization invariant.

---

### I27: The Toy Detector Meta-Rule

**Rule**: If behavior depends on UI order, object identity, or incidental evaluation order—it's a toy.

**Rationale**: Execution order, identity, state, transforms, time topology must all be explicit.

**Consequences of Violation**: Non-deterministic, non-portable system.

**Enforcement**: This entire invariant set.

---

### I28: Diagnostic Attribution

**Rule**: Every diagnostic must be attributable to a specific graph element via TargetRef.

**Rationale**: Diagnostics must be navigable and fixable. A diagnostic without a target is useless.

**Consequences of Violation**: Users cannot locate/fix the problem.

**Enforcement**: TargetRef in Diagnostic type; compiler validation.

---

### I29: Error Taxonomy

**Rule**: Errors are categorized by domain (compile/runtime/authoring/perf) and severity (fatal/error/warn/info/hint).

**Rationale**: Different error streams require different UI treatment and urgency handling.

**Consequences of Violation**: UI cannot prioritize, users miss critical issues.

**Enforcement**: DiagnosticCode enumeration; severity assignment in producers.

---

### I30: Continuity is Deterministic

**Rule**: All continuity operations (phase offset, value reconciliation, field projection, slew) use `t_model_ms` and deterministic algorithms. Given same inputs, continuity produces identical outputs.

**Rationale**: Export must match playback. Non-deterministic continuity breaks replay and debugging.

**Consequences of Violation**: Export drifts from playback, debugging becomes impossible, profiling is meaningless.

**Enforcement**: Continuity System uses only `t_model_ms`, seeded RNGs, and deterministic mapping algorithms.

---

### I31: Export Matches Playback (Continuity Parity)

**Rule**: Export uses the exact same schedule, continuity steps, and policies as live playback. No "simplified" or "optimized" continuity for export.

**Rationale**: Users expect export to match what they see. Divergence destroys trust.

**Consequences of Violation**: "It looks different when I export" - deal-breaker for professional use.

**Enforcement**: Export loop executes same `StepContinuityApply` steps as live runtime.

---

## E. Type System Soundness

### I32: Single Type Authority

**Rule**: CanonicalType (`{ payload, unit, extent }`) is the ONLY type authority for all values. No parallel type representations (SignalType, PortType, FieldType, EventType, ResolvedPortType) may exist. Signal/field/event are derived from axes via `deriveKind()`, never stored as authoritative data.

**Rationale**: Duplicate type information will drift. When it drifts, you get "the type says signal but the kind field says field" bugs that are invisible until production.

**Consequences of Violation**: Type confusion, incorrect dispatch, silent data corruption, adapter insertion failures.

**Enforcement**: CI gate test for forbidden patterns; code review litmus tests. See [20-type-validation](./topics/20-type-validation.md).

---

### I33: Only Explicit Ops Change Axes

**Rule**: Extent axes may only be changed by a small, named set of explicit operations: broadcast (cardinality), reduce (cardinality), state ops (binding), adapters (declared transform). Ordinary computation (math kernels, constructors, getters) preserves all extent axes.

**Rationale**: If arbitrary operations could change axes, the type system cannot predict what a value "is" at any point in the graph.

**Consequences of Violation**: Silent signal→field conversion in a math kernel breaks all downstream type assumptions.

**Enforcement**: Kernel contracts are type-driven — output extent is determined by input extents and declared transform, never by "what kind of IR node this came from."

---

### I34: Axis Enforcement Is Centralized

**Rule**: There is exactly one enforcement gate — `validateAxes()` — that decides whether IR is valid. Small local asserts at boundaries are permitted as defense-in-depth, but the gate is the authority. No bypass in debug, preview, or partial compile paths.

**Rationale**: Multiple enforcement points will disagree on edge cases. One gate means one truth.

**Consequences of Violation**: "Passes the check in module A but fails in module B" → developer whack-a-mole with validation.

**Enforcement**: Single `validateAxes()` call in compilation pipeline. See [20-type-validation](./topics/20-type-validation.md).

---

### I35: State Is Scoped by Axes

**Rule**: Runtime storage is keyed by branch + instance lane identity. State operations must respect axis scoping — a value in branch A cannot silently read state from branch B.

**Rationale**: Preview, undo, and speculative execution rely on branch isolation. Instance identity relies on lane isolation.

**Consequences of Violation**: Preview changes corrupt main state, or undo accidentally uses prediction values.

**Enforcement**: Runtime state key includes branch + instance identity.

---

### I36: Const Literal Matches Payload

**Rule**: `ConstValue` is a discriminated union keyed by payload kind. A const value's kind must match its CanonicalType's payload kind. Constants are NOT stored as `number | string | boolean`.

**Rationale**: Untyped constants bypass the type system. `3.14` could be a float, a norm01, an angle-in-radians — the type is what gives it meaning.

**Consequences of Violation**: A bool constant with payload=float → runtime interprets `true` as `1.0` silently, or crashes on type mismatch.

**Enforcement**: `constValueMatchesPayload()` validation in compilation pipeline.

---

### I37: External Inputs Are Snapshot-Immutable

**Rule**: Once `commit()` is called at frame start, the ExternalChannelSnapshot is immutable for the entire frame. No mid-frame writes are visible to evaluation.

**Rationale**: Without this, external inputs could produce different values when evaluated multiple times in the same frame, breaking determinism and replay.

**Consequences of Violation**: Non-deterministic evaluation, broken replay, potential race conditions in multi-threaded scenarios.

**Enforcement**: ExternalChannelSystem.commit() swaps reference atomically; reader interface has no write methods.

---

## Invariant Quick Reference

| ID | Category | Rule (Brief) |
|----|----------|--------------|
| I1 | Time | Time is monotonic, never wraps |
| I2 | Continuity | Gauge invariance across discontinuities |
| I3 | Time | State migration with stable IDs |
| I4 | Time | Deterministic event ordering |
| I5 | Time | Single time authority |
| I6 | Graph | Compiler never mutates graph |
| I7 | Graph | Cycles cross stateful boundary |
| I8 | Graph | Slot-addressed execution |
| I9 | Graph | Schedule is data |
| I10 | Graph | Uniform transform semantics |
| I11 | Fields | Stable element identity |
| I12 | Fields | Lazy fields, explicit materialization |
| I13 | Fields | Structural sharing / hash-consing |
| I14 | Fields | Explicit cache keys |
| I15 | Render | Renderer is sink only |
| I16 | Render | Real render IR |
| I17 | Render | Planned batching |
| I18 | Render | Temporal stability (no flicker) |
| I19 | Debug | First-class error taxonomy |
| I20 | Debug | Traceability by stable IDs |
| I21 | Debug | Deterministic replay |
| I22 | Perf | Safe modulation ranges |
| I23 | Scale | Patch vs instance separation |
| I24 | Scale | Snapshot/transaction model |
| I25 | Scale | Asset system with stable IDs |
| I26 | Arch | Every input has a source |
| I27 | Arch | Toy detector meta-rule |
| I28 | Debug | Diagnostic attribution to targets |
| I29 | Debug | Error taxonomy by domain/severity |
| I30 | Continuity | Continuity is deterministic |
| I31 | Continuity | Export matches playback |
| I32 | Type System | Single type authority (CanonicalType only) |
| I33 | Type System | Only explicit ops change axes |
| I34 | Type System | Axis enforcement is centralized (validateAxes) |
| I35 | Type System | State scoped by axes (branch + instance) |
| I36 | Type System | Const literal matches payload kind |
| I37 | External Input | External inputs are snapshot-immutable |

# Oscilla v2.5: Executive Summary

> Start here for a high-level understanding of the architecture.

## What This System Does

Oscilla v2.5 is a **looping, interactive visual instrument** compiled from a typed reactive graph. Users create visual animations by connecting blocks in a patch; the system compiles patches to efficient runtime code; animations loop continuously, responding to time and user input.

The system is built on a node-based dataflow architecture with category-theoretic principles (Functor/Applicative patterns). Everything flows through typed wires with deterministic evaluation.

## Key Design Principles

1. **No special cases** - Align with category theory; avoid ad-hoc rules
2. **No optional fields** - Use discriminated unions (`AxisTag` pattern)
3. **Single source of truth** - Each concept has one canonical representation
4. **Runtime erasure** - All type information resolved at compile time
5. **State is explicit** - Only 4 stateful primitives; everything else is pure

## Architecture at a Glance

```
User Patch (RawGraph)
        │
        ▼
┌─────────────────────┐
│ GraphNormalization  │  ← Materializes derived blocks, assigns types
└─────────────────────┘
        │
        ▼
   NormalizedGraph     ← Domains + Nodes + Edges (all explicit)
        │
        ▼
┌─────────────────────┐
│    Compilation      │  ← Type unification, scheduling, IR generation
└─────────────────────┘
        │
        ▼
  CompiledProgramIR    ← Slot-based, axis-erased runtime code
        │
        ▼
┌─────────────────────┐
│      Runtime        │  ← Executes schedules, manages state
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│     Renderer        │  ← Sink only; receives render commands
└─────────────────────┘
```

### Major Components

| Component | Purpose | Key Document |
|-----------|---------|--------------|
| Type System | Five-axis type coordinates | [01-type-system.md](./topics/01-type-system.md) |
| Block System | Compute units and roles | [02-block-system.md](./topics/02-block-system.md) |
| Time System | Monotonic time, rails | [03-time-system.md](./topics/03-time-system.md) |
| Compilation | Graph → IR pipeline | [04-compilation.md](./topics/04-compilation.md) |
| Runtime | Execution and state | [05-runtime.md](./topics/05-runtime.md) |
| Renderer | Output sink | [06-renderer.md](./topics/06-renderer.md) |

### Data Flow

1. **Patches** define blocks and wires
2. **Normalization** makes all structure explicit (default sources, buses, lenses)
3. **Compilation** resolves types, schedules execution, generates IR
4. **Runtime** executes IR per-frame with explicit state management
5. **Renderer** receives instances and renders them

## Five-Axis Type System

Every value in the system has a single authoritative type: `CanonicalType = { payload, unit, extent }`.

The **extent** describes where/when/about-what a value exists via five independent axes:
1. **Cardinality** — How many lanes (zero/one/many)
2. **Temporality** — When values exist (continuous/discrete)
3. **Binding** — Referential anchoring (v0: default only)
4. **Perspective** — Viewpoint (v0: default only)
5. **Branch** — Timeline branch (v0: default only)

This cleanly separates concerns without concept conflation while maintaining runtime performance via compile-time erasure.

## Quick Reference

- **Invariants**: [INVARIANTS.md](./INVARIANTS.md) - 27 non-negotiable rules
- **Glossary**: [GLOSSARY.md](./GLOSSARY.md) - 50+ term definitions
- **Full Topic List**: [INDEX.md](./INDEX.md)
- **Resolution History**: [RESOLUTION-LOG.md](./RESOLUTION-LOG.md)
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
- `cameraProjection` → 1
- `shape2d` → 0 (non-sampleable; packed handle size: 8 u32 words)
- `shape3d` → 0 (non-sampleable; packed handle size: 12 u32 words)

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

### ColorPicker

**Definition**: Constant authoring source block producing a user-space OKLCH+A color.

**Type**: block

**Canonical Form**: `ColorPicker`

**Output**: Signal<color, OKLCH>

**Source**: Topic 23 (Color System)

**Note**: Parameters (h, s, l, a) are UI-controlled, not graph inputs.

---

### DefaultPolicyTable

**Definition**: Type-indexed resolution table for choosing default producers for unconnected inputs. Pure function: resolve(policyKey, targetType, targetPort) → DefaultProducerPlan | Diagnostic.

**Type**: concept

**Canonical Form**: `DefaultPolicyTable`

**Source**: Topic 25 (Pure Lowering)

**Note**: Enables per-port semantic defaults (render.pos → vec2(0.5,0.5), render.color → palette).

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

### OklchToRgba

**Definition**: Adapter block converting color payload from OKLCH unit to RGBA01 unit.

**Type**: block (adapter)

**Canonical Form**: `OklchToRgba`

**Source**: Topic 23 (Color System)

**Note**: The only place OKLCH→RGB conversion occurs.

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

### Lens

**Definition**: A port decorator that modifies signal values. Attached to both input and output ports. Compiled to blocks. No separate lens catalog — blocks can be used as lenses.

**Type**: concept

**Canonical Form**: `Lens`

**Purpose**: Value transformation and modulation

**Examples**:
- `scale(0..1 → 0..360)` - range mapping
- `ease(inOut)` - easing curve
- `offset(+0.5)` - value shift

**Minimal Ship Set** (10 lenses):
1. Scale+Bias (value shaping)
2. Clamp (value shaping)
3. Wrap01 (phase/hue hygiene)
4. Slew/Lag (dynamics)
5. StepQuantize (discretization)
6. Smoothstep (curves)
7. Broadcast (signal→field)
8. Reduce (field→signal: avg/sum/min/max)
9. Mask (gate/hold)
10. Extract/Construct (structural)

**Source**: [14-modulation-table-ui.md](./topics/14-modulation-table-ui.md), Topic 26 (Lens System)

**Note**: Lenses are port decorators (not edge decorators), attached to both input and output ports, compiled to blocks.

---

### LowerEffects

**Definition**: Declarative data describing side effects requested by a lowerer — state cell requests, kernel registrations, intrinsic dependencies.

**Type**: type

**Canonical Form**: `LowerEffects`

**Source**: Topic 25 (Pure Lowering)

**Note**: Part of the effects-as-data model.

---

### LowerSandbox

**Definition**: Constrained IR builder enforcing purity during block lowering. Provides capability-based API (emitConst, emitOp, emitKernel, etc.) while preventing graph mutation and scheduling side effects.

**Type**: concept (compilation component)

**Canonical Form**: `LowerSandbox`

**Source**: Topic 25 (Pure Lowering)

**Note**: Not a layer itself.

---

### Macro Lowering

**Definition**: Technique of invoking existing blocks' lower() functions through a LowerSandbox to produce IR without creating graph nodes. Used by DefaultSource.

**Type**: concept (compilation technique)

**Canonical Form**: `Macro Lowering`

**Source**: Topic 25 (Pure Lowering)

**Note**: Keeps block semantics as single source of truth. If HueRainbow changes, the default changes automatically.

---

### MakeColorOKLCH

**Definition**: Pack scalar h,s,l,a channels into a color payload with OKLCH unit. Enforces color validity.

**Type**: block

**Canonical Form**: `MakeColorOKLCH`

**Source**: Topic 23 (Color System)

**Note**: The enforcement point for OKLCH color validity.

---

### Primitive Block

**Definition**: A block that creates a single element of a specific domain type. Outputs `Signal<T>` (cardinality: one).

**Type**: concept (block category)

**Canonical Form**: `Primitive Block`

**Examples**: Circle, Rectangle, Polygon

**Source**: [02-block-system.md](./topics/02-block-system.md)

**Note**: Part of the three-stage architecture: Primitive → Array → Layout.

---

### Sampleable

**Definition**: A payload is "sampleable" iff payloadStride(payload) > 0. Payloads with stride=0 (shape2d, shape3d) are forbidden where numeric slots are required.

**Type**: concept

**Canonical Form**: `sampleable`

**Source**: Topic 24 (Multi-Component Signals)

**Note**: Stride 0 values cannot be stored in numeric slots and are never evaluated by numeric evaluators.

---

### SlotMetaEntry

**Definition**: Compiler-emitted metadata for each allocated slot: slot ID, base offset, stride, and payload type.

**Type**: type

**Canonical Form**: `SlotMetaEntry`

**Structure**:
```typescript
interface SlotMetaEntry {
  readonly slot: ValueSlot;
  readonly offset: number;
  readonly stride: 0|1|2|3|4;
  readonly payload: PayloadType;
}
```

**Source**: Topic 24 (Multi-Component Signals)

**Note**: stride === payloadStride(payload) is a compiler invariant.

---

### SplitColorOKLCH

**Definition**: Unpack a color payload with OKLCH unit into scalar h,s,l,a channels.

**Type**: block

**Canonical Form**: `SplitColorOKLCH`

**Source**: Topic 23 (Color System)

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
- `float`, `int`, `bool` → 1
- `vec2` → 2
- `vec3` → 3
- `color` → 4

**Note**: State stride may exceed payload stride when a primitive stores multiple values per lane (e.g., a filter storing y and dy has state stride 2 even for float payload). Stride 0 is a valid classification for non-sampleable payloads (shape2d, shape3d). Stride 0 values cannot be stored in numeric slots and are never evaluated by numeric evaluators.

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

**payloadStride**: 0 (non-sampleable)
**Packed handle size**: 8 u32 words

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

**Note**: DefaultSource is a polymorphic structural block whose output type uses payload and unit variables. Its lower() function dispatches on the resolved type via a DefaultPolicyTable, potentially invoking other blocks' lowerers as macros through a LowerSandbox.

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

**Definition**: Umbrella term for value transformations and type conversions applied to ports.

**Type**: concept

**Canonical Form**: `Transform`

**Related concepts**:
- **Adapter**: Type conversion that enables ports of different types to connect (mechanical compatibility, no value transformation). See [Adapter](#adapter).
- **Lens**: Port-attached value transformation (scale, offset, easing, etc.) compiled to blocks. See [Lens](#lens).

**Source**: [14-modulation-table-ui.md](./topics/14-modulation-table-ui.md), Topic 26 (Lens System)

**Implementation**: Transforms compile to blocks in the patch

**Note**: Adapters and lenses are distinct concepts — adapters change type compatibility, lenses change values. Both compile to blocks.

---

### Adapter

**Definition**: A transform that changes signal type to enable port connections, without transforming the value itself.

**Type**: concept (transform subtype)

**Canonical Form**: `Adapter`

**Purpose**: Mechanical port compatibility

**Example**: `phase → float` adapter allows phase output to connect to float input by converting type representation

**Source**: [14-modulation-table-ui.md](./topics/14-modulation-table-ui.md)

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

**Definition**: Semantic interpretation of a value's numbers. 6 structured kinds with no `var` branch in canonical type.

**Type**: type

**Canonical Form**: `none | count | angle(radians|degrees|phase01) | time(ms|seconds) | space(ndc|world|view, dims:2|3) | color(oklch|rgba01)`

**Source**: [01-type-system.md](./topics/01-type-system.md)

**Note**: Unit variables exist only in inference-only wrappers (`InferenceUnitType`), never in `UnitType`. The `color` kind uses `unit` as the sub-field name (not `space`). 6 concrete kinds: none, count, angle, time, space, color. `scalar` and `norm01` removed.

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

## External Input System

### ExternalChannelSnapshot

**Definition**: Immutable per-frame map of channel values. Read-only during frame execution.

**Type**: class

**Canonical Form**: `ExternalChannelSnapshot`

**Structure**:
```typescript
class ExternalChannelSnapshot {
  getFloat(name: string): number;       // returns 0 if absent
  getVec2(name: string): { x: number; y: number }; // returns {0,0} if absent
}
```

**Source**: [22-external-input-system.md](./topics/22-external-input-system.md)

**Note**: Once committed at frame start, snapshot is immutable for the entire frame (I37).

---

### ExternalWriteBus

**Definition**: Thread-safe write-side structure accepting set/pulse/add operations. Drained at frame boundary and folded into snapshot.

**Type**: class

**Canonical Form**: `ExternalWriteBus`

**Structure**:
```typescript
class ExternalWriteBus {
  set(name: string, v: number): void;   // For 'value' channels
  pulse(name: string): void;             // For 'pulse' channels
  add(name: string, dv: number): void;  // For 'accum' channels
}
```

**Source**: [22-external-input-system.md](./topics/22-external-input-system.md)

**Note**: Writers never mutate the snapshot, only the staging structure.

---

### ChannelKind

**Definition**: Semantics for how writes fold into snapshot. Defines whether a channel persists, pulses, or accumulates.

**Type**: enum

**Canonical Form**: `ChannelKind = 'value' | 'pulse' | 'accum' | 'latch'`

**Values**:
- `value`: Sample-and-hold, last write wins, persists across frames
- `pulse`: 1 for exactly one frame if any event occurred, then 0
- `accum`: Sums deltas/counts since last commit, then clears
- `latch`: *(optional)* Holds nonzero until explicitly cleared

**Source**: [22-external-input-system.md](./topics/22-external-input-system.md)

---

### ExternalInput

**Definition**: Block that reads a named external channel as a signal. Config-only (no inputs), single output.

**Type**: block

**Canonical Form**: `ExternalInput`

**Config**: `channel: string`
**Output**: `value: float` (or other allowed PayloadType)

**Lowering**: `ctx.b.sigExternal(channel, canonicalType('float'))`

**Source**: [22-external-input-system.md](./topics/22-external-input-system.md)

**Note**: Part of the io category; uses ExternalChannelSnapshot via runtime.

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
# Oscilla v2.5: Essential Specification

> **Purpose:** Condensed spec for agent consumption during implementation.
> For full detail, rationale, and examples, see individual topic files.
> Token target: <30k (vs ~124k for full spec)

---

## System Invariants

> **These rules are non-negotiable. Violations indicate bugs.**

### A. Time, Continuity, and Edit-Safety

| ID | Rule | Enforcement |
|----|------|-------------|
| I1 | Time is monotonic, never wraps/resets/clamps | TimeRoot implementation |
| I2 | Gauge invariance: effective values continuous across discontinuities | Continuity System |
| I3 | State migration with stable StateIds | State migration system |
| I4 | Deterministic event ordering | Explicit ordering in scheduler |
| I5 | Single time authority per patch | Single TimeRoot |

### B. Graph Semantics

| ID | Rule | Enforcement |
|----|------|-------------|
| I6 | Compiler never mutates the graph | NormalizedGraph is immutable input |
| I7 | Cycles must cross stateful boundary | Tarjan's SCC + validation |
| I8 | Slot-addressed execution (no string lookups) | CompiledProgramIR uses indices |
| I9 | Schedule is inspectable data | Schedule IR is explicit |
| I10 | Uniform transform semantics (table-driven) | Transform registry |

### C. Fields, Identity, and Performance

| ID | Rule | Enforcement |
|----|------|-------------|
| I11 | Stable element identity | Pool-based allocation |
| I12 | Lazy fields with explicit materialization | Field expr DAGs |
| I13 | Structural sharing / hash-consing | ExprId canonicalization |
| I14 | Explicit cache keys | Cache key model |

### D. Rendering

| ID | Rule | Enforcement |
|----|------|-------------|
| I15 | Renderer is sink only (no creative logic) | Render IR |
| I16 | Real render IR (generic intermediate) | Render IR spec |
| I17 | Planned batching | Style/material keys in commands |
| I18 | Temporal stability (no flicker on swap) | Atomic swap |

### E. Debuggability

| ID | Rule | Enforcement |
|----|------|-------------|
| I19 | First-class error taxonomy | Error types in compiler |
| I20 | Traceability by stable IDs | Structural instrumentation |
| I21 | Deterministic replay | Seeded randomness only |
| I28 | Diagnostic attribution to targets | TargetRef required |
| I29 | Error taxonomy by domain/severity | DiagnosticCode enum |

### F. Live Performance

| ID | Rule | Enforcement |
|----|------|-------------|
| I22 | Safe modulation ranges (normalized domains) | Unit discipline |

### G. Scaling

| ID | Rule | Enforcement |
|----|------|-------------|
| I23 | Patch vs instance separation | Architecture |
| I24 | Snapshot/transaction model | Transaction-based edits |
| I25 | Asset system with stable IDs | Asset registry |

### H. Architecture Laws

| ID | Rule | Enforcement |
|----|------|-------------|
| I26 | Every input has a source (DefaultSource) | GraphNormalization |
| I27 | Toy detector: explicit execution order, identity, state | Entire invariant set |
| I30 | Continuity is deterministic | Uses t_model_ms only |
| I31 | Export matches playback | Same schedule/continuity |

### I. Type System Soundness

| ID | Rule | Enforcement |
|----|------|-------------|
| I32 | Single type authority (CanonicalType only) | CI gate, code review |
| I33 | Only explicit ops change axes | Type-driven kernel contracts |
| I34 | Axis enforcement centralized (validateAxes) | Single gate, no bypass |
| I35 | State scoped by axes (branch + instance) | Runtime state keying |
| I36 | Const literal matches payload kind | constValueMatchesPayload() |

---

## Glossary (Core Terms)

### Type System

**PayloadType**: Discriminated union - `{ kind: 'float' } | { kind: 'int' } | { kind: 'bool' } | { kind: 'vec2' } | { kind: 'vec3' } | { kind: 'color' } | { kind: 'cameraProjection' } | { kind: 'shape2d' } | { kind: 'shape3d' }`

**payloadStride()**: Always derived from payload. `float/int/bool=1`, `vec2=2`, `vec3=3`, `color=4`, `cameraProjection=1`, `shape2d=0`, `shape3d=0`

**UnitType**: 6 structured kinds - `none | count | angle(radians|degrees|phase01) | time(ms|seconds) | space(ndc|world|view, dims:2|3) | color(oklch|rgba01)`. No `var` in canonical type.

**Phase**: Represented as `float` with `unit: { kind: 'angle', unit: 'phase01' }`. Not a distinct PayloadType.

**Extent**: 5-axis coordinate (cardinality, temporality, binding, perspective, branch)

**CanonicalType**: Single type authority = `{ payload: PayloadType; unit: UnitType; extent: Extent }`. No parallel type systems.

**Axis\<T, V\>**: `{ kind: 'var'; var: V } | { kind: 'inst'; value: T }`. `var` MUST NOT escape frontend.

**deriveKind()**: Total function `(type) → 'signal' | 'field' | 'event'`. Priority: discrete > many > default. Use `tryDeriveKind()` when axes may be unresolved.

**Cardinality**: `zero` (constant) | `one` (signal) | `many(instance)` (field)

**Temporality**: `continuous` (every frame) | `discrete` (events only)

**Domain**: Classification defining element kind (shape, circle, particle). NOT a count.

**DomainSpec**: Compile-time domain type spec with parent and intrinsics

**Instance**: Specific collection of domain elements with count and lifecycle

**InstanceDecl**: Per-patch instance declaration (id, domainType, maxCount, lifecycle)

**InstanceRef**: `{ kind: 'instance'; domainType: DomainTypeId; instanceId: InstanceId }`

### Derived Type Concepts

| Concept | Cardinality | Temporality |
|---------|-------------|-------------|
| Signal | `one` | `continuous` |
| Field | `many(instance)` | `continuous` |
| Trigger | `one` | `discrete` |

### Block System

**Block**: Only compute unit. Has `id`, `kind` (NOT type), `role`, `inputs`, `outputs`

**BlockRole**: `{ kind: 'user' }` | `{ kind: 'derived'; meta: DerivedBlockMeta }` (minimum variants; implementations may extend)

**DerivedBlockMeta**: `defaultSource` | `wireState` | `lens`

**EdgeRole**: `user` | `default` | `auto`

**Stateful Primitives (4)**: UnitDelay, Lag, Phasor, SampleAndHold

**Cardinality-Generic Block**: Per-lane semantics, works for both Signal and Field. Lane-local, cardinality-preserving.

**Payload-Generic Block**: Semantics defined over closed set of payload types. Fully specialized at compile time.

**Lane**: Individual element within a Field (positional offset, not semantic identity).

**StateId**: Stable identifier for a state array (not individual lanes). Format: `blockId + primitive_kind`.

### Architecture

**Primitive Block**: Creates ONE element (Signal output). Circle, Rectangle, Polygon.

**Array Block**: Cardinality transform. Signal → Field. Creates Instance.

**Layout Block**: Computes positions for field elements. Grid, Spiral, Random.

### Compilation

**NormalizedGraph**: Fully explicit graph the compiler consumes

**CompiledProgramIR**: Output of compilation — expression DAGs (computation shape) + schedule (execution ordering) + slot metadata (storage layout)

**Expression DAG**: Hash-consable tree of signal/field/event nodes. Referentially transparent, memoized per frame.

**Schedule**: Execution ordering as data — names which expr roots to evaluate/materialize, where to store results (slots), and phase ordering constraints

### Runtime

**StateSlot**: Persistent storage for stateful primitive

**ScalarSlot**: Storage for single-lane value

**FieldSlot**: Storage for multi-lane value (dense array)

### Combine System

**CombineMode**: Strategy for multi-writer inputs
- Numeric: `sum`, `avg`, `min`, `max`, `mul`
- Any: `last`, `first`, `layer`
- Boolean: `or`, `and`

### Rails (System Buses)

| Rail | Type | Description |
|------|------|-------------|
| `time` | `one + continuous + int` | tMs value |
| `phaseA` | `one + continuous + float(phase01)` | Primary phase |
| `phaseB` | `one + continuous + float(phase01)` | Secondary phase |
| `pulse` | `one + discrete + unit` | Frame tick |
| `palette` | `one + continuous + color` | Chromatic reference |

---

## Type System (Core)

### PayloadType Semantics

| Type | Stride | Range/Notes |
|------|--------|-------------|
| `float` | 1 | IEEE 754 |
| `int` | 1 | Signed 32-bit |
| `vec2` | 2 | Two floats |
| `vec3` | 3 | Three floats |
| `color` | 4 | RGBA, 0..1 each |
| `float(phase01)` | 1 | float with unit:phase01, 0..1 with wrap semantics |
| `bool` | 1 | true/false |
| `cameraProjection` | 1 | Closed string enum (orthographic/perspective) |
| `shape2d` | 0 | Non-sampleable opaque handle (packed size: 8 u32 words) |

### Extent (Five-Axis Coordinate)

```typescript
type Extent = {
  cardinality: AxisTag<Cardinality>;
  temporality: AxisTag<Temporality>;
  binding: AxisTag<Binding>;      // v0: 'unbound' only
  perspective: AxisTag<string>;   // v0: 'global' only
  branch: AxisTag<string>;        // v0: 'main' only
};
```

### Cardinality

```typescript
type Cardinality =
  | { kind: 'zero' }                           // compile-time constant
  | { kind: 'one' }                            // single lane (Signal)
  | { kind: 'many'; instance: InstanceRef };   // N lanes (Field)
```

### Temporality

```typescript
type Temporality =
  | { kind: 'continuous' }  // every frame
  | { kind: 'discrete' };   // events only
```

### Axis Unification Rules (v0)

```
default + default                → default
default + instantiated(X)        → instantiated(X)
instantiated(X) + instantiated(X) → instantiated(X)
instantiated(X) + instantiated(Y), X≠Y → TYPE ERROR
```

### Domain vs Instance

**Domain** = Classification (what kind of thing)
**Instance** = Collection (how many, which pool)

```typescript
interface DomainSpec {
  readonly id: DomainTypeId;
  readonly parent: DomainTypeId | null;
  readonly intrinsics: readonly IntrinsicSpec[];
}

interface InstanceDecl {
  readonly id: InstanceId;
  readonly domainType: DomainTypeId;
  readonly primitiveId: PrimitiveId;
  readonly maxCount: number;
  readonly countExpr?: SigExprId;
  readonly lifecycle: 'static' | 'pooled';
}
```

### Unit System

Units refine payload types. A `float` may carry a unit that constrains valid operations.

6 structured kinds:

| Kind | Sub-values | Examples |
|------|------------|----------|
| `none` | — | dimensionless multipliers, ratios |
| `count` | — | element counts |
| `angle` | `radians`, `degrees`, `phase01` | rotation, oscillator phase |
| `time` | `ms`, `seconds` | durations, timestamps |
| `space` | `ndc`/`world`/`view`, dims: 2/3 | positions, coordinates |
| `color` | `oklch`, `rgba01` | color space encoding |

**Unit checking is strict**: edges require exact unit match. No implicit conversion.

**Generic blocks** have type variables for payload (`PayloadVar`) and/or unit (`UnitVar`) that must be resolved by constraint solving. Example: `Const.out` is generic in both payload and unit — resolved by what it connects to, never defaulted to `float<none>`.

### Phase Arithmetic

Phase is `float` with `unit: 'phase01'`. Arithmetic rules:

| Operation | Result |
|-----------|--------|
| `float(phase01) + float` | `float(phase01)` |
| `float(phase01) * float` | `float(phase01)` |
| `float(phase01) + float(phase01)` | TYPE ERROR |

---

## Block System (Core)

### Block Structure

```typescript
interface Block {
  id: BlockId;
  kind: string;        // "Add", "UnitDelay" - NOT 'type'
  role: BlockRole;
  inputs: PortBinding[];
  outputs: PortBinding[];
}

interface PortBinding {
  id: PortId;
  dir: { kind: 'in' } | { kind: 'out' };
  type: CanonicalType;
  combine: CombineMode;
}
```

### Block Roles

```typescript
type BlockRole =
  | { kind: "user" }
  | { kind: "derived"; meta: DerivedBlockMeta };

type DerivedBlockMeta =
  | { kind: "defaultSource"; target: { kind: "port"; port: PortRef } }
  | { kind: "wireState"; target: { kind: "wire"; wire: WireId } }
  | { kind: "lens"; target: { kind: "node"; node: NodeRef } };
```

### Key Invariants

1. **Roles are for editor, not compiler** - Compiler sees all blocks equally
2. **Compiler ignores roles** - Roles inform UI, undo/redo, persistence
3. **User entities are canonical** - Derived can be regenerated

### Three-Stage Architecture

```
Primitive → Array → Layout

[Circle] ──Signal<circle>──▶ [Array] ──Field<circle>──▶ [Grid] ──position──▶ [Render]
```

1. **Primitive**: ONE element (Signal output)
2. **Array**: Cardinality transform (Signal → Field, creates Instance)
3. **Layout**: Spatial arrangement (computes positions)

### Stateful Primitives

| Block | Behavior |
|-------|----------|
| **UnitDelay** | `y(t) = x(t-1)` |
| **Lag** | Smooth toward target |
| **Phasor** | 0..1 phase accumulator with wrap |
| **SampleAndHold** | Latch on trigger |

### Cardinality-Generic Blocks

Blocks whose computation is **per-lane** and valid for both Signal (one) and Field (many):

**Contract**: (1) lane-local, (2) cardinality-preserving, (3) instance-aligned, (4) deterministic per-lane.

**Are generic**: Math (Add, Mul, Hash, Noise), Stateful (UnitDelay, Lag, Phasor, SampleAndHold)
**Are NOT generic**: Array (transform), Reduce (aggregation), Layout (lane-coupled), Render (sink)

Compiler specializes each instance to either scalar or field step — no runtime generics.

### Payload-Generic Blocks

Blocks whose semantics are defined over a **closed set of payload types**, fully specialized at compile time:

**Contract**: (1) Closed admissible payload set, (2) Total per-payload specialization, (3) No implicit coercions, (4) Deterministic resolution.

**Are generic**: Add/Mul (`{float, vec2, vec3}`), Normalize (`{vec2, vec3}`), UnitDelay/Lag (over `{float, vec2, vec3, color}`)
**Are NOT generic**: Cast blocks (fixed types), TimeRoot, Render, Array

**Validity shapes**: Homogeneous unary (`T→T`), Homogeneous binary (`T×T→T`), Mixed binary (`T×float→T`), Predicate (`T×T→bool`), Reduction-like (`T→float`)

Compiler emits fully specialized IR (e.g., `Add_f32`, `Add_vec2`, `Add_vec3`) — no runtime payload dispatch.

### Cycle Validation

Every strongly connected component must contain at least one stateful primitive.

### Default Sources

Every input always has exactly one source. DefaultSource blocks provide fallbacks:

| PayloadType | Default |
|-------------|---------|
| `float` | `phaseA` rail or `Constant(0.5)` |
| `int` | `Constant(1)` |
| `vec2` | `Constant([0.5, 0.5])` |
| `color` | `HueRainbow(phaseA)` or white |
| `float(phase01)` | `phaseA` rail |
| `bool` | `Constant(true)` |

---

## Compilation (Core)

### Pipeline

```
RawGraph → GraphNormalization → NormalizedGraph → Compilation → CompiledProgramIR
```

### NormalizedGraph

Fully explicit graph the compiler consumes:

```typescript
type NormalizedGraph = {
  domains: DomainDecl[];
  nodes: Node[];
  edges: Edge[];
};
```

Properties:
- All derived blocks materialized
- Every input connected
- Every port typed
- Immutable to compiler

### Anchor-Based Stable IDs

Structural artifacts keyed by anchor:

| Type | Anchor Format |
|------|---------------|
| Default source | `defaultSource:<blockId>:<portName>:<in|out>` |
| Wire-state | `wireState:<wireId>` |
| Bus junction | `bus:<busId>:<pub|sub>:<typeKey>` |

### Type Resolution

Type resolution is constraint-based unification, not local inference.

**Ordering requirement**: Run type resolution only after normalization has produced a fully explicit graph (all default sources materialized, all adapters explicit). Attempting to infer types before explicit structure exists causes directionality bugs.

**Constraint sources**:
- Monomorphic port definitions (e.g., `Camera.tiltDeg` is `float<deg>`)
- User-specified parameters (e.g., `Const` explicitly set to `float<phase01>`)
- Edge equality constraints: for every edge, `Type(fromPort) == Type(toPort)` (payload AND unit must match)
- Adapter blocks are the only place unit conversion is allowed

**Resolution phases**:
1. **Initialization**: Seed known types from monomorphic definitions and explicit user choices
2. **Propagation**: For each edge constraint, unify payload and unit variables
3. **Verification**: Any unresolved variable after fixed-point → compile error

**Critical invariant**: Unresolved generic types are hard errors, never silent defaults.

```typescript
// Resolved types are cached by port binding
type PortBindingKey = `${BlockId}:${PortName}:${'in' | 'out'}`;
resolvedPortTypes: Map<PortBindingKey, CanonicalType>;

// getPortType() behavior:
// 1. If resolved override exists → return it
// 2. Else if monomorphic definition → return definition type
// 3. Else if generic and unresolved → UnresolvedType ERROR (not scalar fallback)
```

**Diagnostic on unresolved type**:
- Identify: block, port, why unconstrained
- Suggest fixes: connect to typed consumer, set unit explicitly, or insert adapter

### CompiledProgramIR Structure

The compilation output has two layers: expression DAGs that define computation shape, and a schedule that defines execution ordering.

```typescript
interface CompiledProgramIR {
  // Layer 1: Expression DAGs (computation shape)
  signalExprs: ExprTable<SigExpr>;
  fieldExprs: ExprTable<FieldExpr>;
  eventExprs: ExprTable<EventExpr>;

  // Layer 2: Execution schedule (ordering + materialization)
  schedule: ScheduleIR;

  // Storage layout
  slotMeta: SlotMeta[];

  // Ancillary
  fieldSlotRegistry: FieldSlotRegistry;
  debugIndex: DebugIndex;
  renderGlobals: RenderGlobals;
}
```

### Expression DAGs

Computation is represented as hash-consable DAG nodes referenced by typed IDs (`SigExprId`, `FieldExprId`, `EventExprId`). Expression evaluation is referentially transparent and memoized per frame.

Signal expressions (`SigExpr`):
- `const`, `slot`, `time`, `external` — leaf nodes
- `map`, `zip` — combinators
- `stateRead`, `shapeRef`, `eventRead` — state/context access

Field expressions (`FieldExpr`):
- `const`, `intrinsic`, `broadcast` — leaf nodes
- `map`, `zip`, `zipSig`, `array` — combinators
- `stateRead` — per-lane state access

Combine operations are expression nodes emitted at compile time (validation + construction), not runtime schedule steps.

### Execution Schedule

The schedule defines externally visible ordering boundaries. Expression evaluation within a step is demand-driven and cached.

```typescript
interface ScheduleIR {
  steps: Step[];
  instances: InstanceDecl[];
  stateSlotCount: number;
  stateMappings: StateMapping[];
}

type Step =
  | { kind: 'evalSig'; expr: SigExprId; target: ValueSlot }
  | { kind: 'materialize'; field: FieldExprId; instanceId: number; target: ValueSlot }
  | { kind: 'render'; instanceId: number; slots: RenderSlots }
  | { kind: 'stateWrite'; source: ValueSlot; stateSlot: number }
  | { kind: 'fieldStateWrite'; source: ValueSlot; stateSlot: number; instanceId: number }
  | { kind: 'continuityMapBuild'; instanceId: number; ... }
  | { kind: 'continuityApply'; instanceId: number; ... }
  | { kind: 'evalEvent'; expr: EventExprId; target: ValueSlot };
```

Phase ordering:
1. Update time inputs (rails, tMs)
2. Evaluate continuous scalars (`evalSig`)
3. Build continuity mappings (`continuityMapBuild`)
4. Materialize continuous fields (`materialize`)
5. Apply continuity (`continuityApply`)
6. Execute discrete events (`evalEvent`)
7. Render sinks (`render`)
8. State writes (`stateWrite`, `fieldStateWrite`)

### Where Semantics Live

| Concern | Authority |
|---------|-----------|
| Shape of computation | Expression DAGs |
| When it happens | Schedule step ordering |
| Where values live | SlotMeta (typed storage + offsets/strides) |
| Why fields are special | Materializer + demand-driven behavior |
| What's externally ordered | Events, state writes, continuity, render |

### Slot Allocation

| Cardinality | Slot Type | Buffer Size |
|-------------|-----------|-------------|
| `zero` | Inlined constant | 0 |
| `one` | ScalarSlot | stride floats |
| `many(instance)` | FieldSlot | laneCount × stride floats |

### Runtime Erasure

No type information at runtime:
- No axis tags in runtime values
- No referent ids
- No domain objects (only loop bounds)
- Perspective/Branch erased (v0 defaults)

---

## Runtime (Core)

### Execution Model

Every tick:
1. Sample external inputs
2. Update time (tMs, phases)
3. Execute schedule steps in phase order (see Compilation → Execution Schedule)

Target: **5-10ms per frame** (60-200 fps)

### Storage Model

```typescript
interface RuntimeState {
  scalars: Float32Array;
  fields: Map<number, Float32Array>;
  events: Map<number, EventPayload[]>;
  state: Map<number, Float32Array>;
}
```

### State Management

State keyed by stable `StateId` (identifies state array, not individual lanes):

| Cardinality | State Allocation | Mapping Type |
|-------------|------------------|--------------|
| `one` | `stride` floats | `StateMappingScalar { stateId, slotIndex, stride, initial }` |
| `many(instance)` | `laneCount × stride` floats | `StateMappingField { stateId, instanceId, slotStart, laneCount, stride, initial }` |
| `zero` | No state | None |

### State Migration

| Condition | Action |
|-----------|--------|
| Same StateId + same layout | Copy |
| Same StateId + compatible | Transform |
| Different/incompatible | Reset + diagnostic |

### Hot-Swap

- Old program renders until new is ready
- Atomic swap, no flicker
- State migrates based on StateId
- Caches invalidated

### Performance Constraints

- **No string lookups**: Use slot indices
- **No runtime type dispatch**: Compile-time slot selection
- **Dense arrays**: Not sparse maps
- **No Math.random()**: Seeded randomness only

### Three-Layer Execution Architecture

| Layer | I/O | Semantics | Examples |
|-------|-----|-----------|---------|
| **Opcode** | `number[] → number` | Pure generic math, no domain knowledge | sin, cos, add, mul, lerp |
| **Signal Kernel** | `scalar → scalar` | Domain-specific, fixed arity | oscSin, easeInQuad, noise1 |
| **Field Kernel** | field buffers lane-wise | Vec2/color/field ops | circleLayout, hsvToRgb, jitter2d |

**Materializer** orchestrates (not a layer): IR → buffers → dispatch → sinks.

---

## Coordinate Spaces (Topic 16)

### Three-Space Model

| Space | Role | Range |
|-------|------|-------|
| **Local (L)** | Geometry/control points | Centered (0,0), O(1) |
| **World (W)** | Instance placement | [0..1] normalized |
| **Viewport (V)** | Backend output | Pixels/viewBox |

### `scale` Semantics

- `scale`: Isotropic local→world factor (`Signal<float>` or `Field<float>`)
- `scale2`: Optional anisotropic (`Signal<vec2>` or `Field<vec2>`)
- Backend: `scalePx = scale × min(W, H)`
- Combined: `S_effective = (scale × scale2.x, scale × scale2.y)`

### Enforcement

Convention-based: `controlPoints` = local, `position` = world. Type-level axis deferred.

---

## Renderer (Core)

### RenderFrameIR (Draw-Op-Centric)

```typescript
interface RenderFrameIR { passes: RenderPassIR[]; }
type RenderPassIR = { kind: 'drawPathInstances'; op: DrawPathInstancesOp };

interface DrawPathInstancesOp {
  geometry: PathGeometryTemplate;  // Local-space points + topology
  instances: PathInstanceSet;       // World-space transforms (SoA)
  style: PathStyle;                 // Fill/stroke/opacity
}
```

Each op is inherently a batch (shared geometry+style = one draw call).
