# Fundamental Axes in Systems

**User:** Brandroid Frizzle (brandroid@vast.wang)  
**Created:** 1/8/2026 5:15:06 PM  
**Updated:** 1/9/2026 6:30:53 AM  
**Exported:** 1/9/2026 6:31:25 AM  
**Link:** [https://chatgpt.com/c/69604796-87ac-8330-b7e5-1cb26d56ef27](https://chatgpt.com/c/69604796-87ac-8330-b7e5-1cb26d56ef27)  

## Prompt:
you mentioned compiler changes?  Can you design me a compiler for this that is performant and compatible with all my goals?

## Response:
Thought for 18s

Yes. The compiler you want is essentially a **normalizing, type-directed lowering pipeline** that turns a patch (graph + resources) into a **fully-specified execution program** where runtime has _zero authority to guess anything_ (layout, offsets, shapes, temporality semantics). Your `slotMeta` rule is the right “hard edge” to anchor that design.

Below is a concrete compiler architecture that is performant, deterministic, hot-swap friendly, and stays faithful to the goals we’ve locked: 5-axis semantics are compile-time only; domains are resources; state exists only in state blocks; runtime executes a schedule over preallocated stores.

* * *

1) Compiler input and output contracts
--------------------------------------

### Input

**RawPatch**

*   DomainDecl resources (grid/voices/mesh/etc.)
*   Node instances (block kind + params)
*   Edges (port connections)
*   No derived nodes/edges required to be explicit

### Output

**CompiledProgramIR** (the only runtime contract)

*   `tables`: dense arrays describing all runnable nodes/expressions grouped by class (signal exprs, field exprs, event ops, sinks, etc.)
*   `schedule`: a sequence of ops that reference **slot IDs** only (not offsets)
*   `slotMeta`: required if schedule has any slot ops (your hard rule)
*   `constants`: JSON-only pool (your hard rule)
*   `debugIndex`: stable mapping from IR nodes/slots back to patch nodes/ports (for tooling)

Runtime must not infer anything from schedule; it only:

1.  allocates stores from `slotMeta`
2.  runs `schedule`

* * *

2) The compiler pipeline (passes)
---------------------------------

This is the full pass stack. The key idea: every pass either **adds explicit structure** or **removes ambiguity**. Nothing “magical” remains by the time you emit IR.

### Pass 0 — Parse / Validate (cheap)

*   Validate graph connectivity, missing ports, unknown block kinds
*   Validate DomainDecl parameters are well-formed (positive sizes, asset IDs present)

### Pass 1 — Normalize Graph (makes implicit things explicit)

Goal: produce a **NormalizedGraph** that is closed under your rules.

Operations:

*   Materialize default sources for every input port that requires them (as you already do)
*   Materialize rails/buses as synthetic sources
*   Normalize “writers” into explicit combine points on input ports (combine mode lives on port)
*   Expand any syntactic sugar blocks into canonical primitives
*   Canonicalize node IDs (stable, deterministic ordering)

Output: `NormalizedGraph` + `NormalizationIndex` (what was created and why)

### Pass 2 — Type assignment (5-axis coordinate, still mostly default)

Goal: assign each port a `SignalType = {payload, extent}` where:

*   payload is known or inferred
*   extent has AxisTag per axis

Rules:

*   Blocks declare **port type schemas** as constraints (not concrete types)
*   Edges propagate constraints
*   Default axes remain `AxisTag.default` unless the block explicitly instantiates (e.g., a Field operator instantiates cardinality=many(domain))

### Pass 3 — Unification (strict, no implicit merges)

Goal: make the graph _provably consistent_ or fail early.

*   Unify per-edge (output type must unify with input type)
*   Unify per-input combine point (all incoming writers must unify with the port)
*   Use the strict v0 unification rule you locked:
    *   default + instantiated → instantiated
    *   instantiated mismatch → error

Important: in v0, **domain alignment is identity**:

*   `many(domain A)` and `many(domain B)` mismatch unless A==B
*   no automatic mapping/resampling

### Pass 4 — Resolve defaults (compile-time only)

Goal: produce a fully-instantiated “ResolvedType” per port/wire.

*   Apply `AxisDefaults` + `EvalFrame` resolution
*   v0: canonical defaults only (`global/main/unbound`)
*   No runtime resolution exists

### Pass 5 — Lower to execution forms (type-directed lowering)

This is where your system becomes performant. You don’t “interpret blocks”; you lower them into a small set of execution kernels.

Lower each node into one of these _execution classes_ based on resolved extent:

*   **Scalar continuous**: `one + continuous` → scalar expr node
*   **Field continuous**: `many(domain) + continuous` → field expr node (looped)
*   **Scalar discrete**: `one + discrete` → event stream ops
*   **Field discrete**: `many(domain) + discrete` → per-lane event stream ops (v0 choose representation)
*   **Sinks**: render/write endpoints

Each lowered node declares:

*   the slots it reads/writes
*   whether it requires state slots
*   which domain loop it belongs to (if any)

### Pass 6 — Build program tables (dense, cache-friendly layout)

Goal: runtime-friendly memory locality.

Instead of a single “node list,” store IR in **tables per class**, e.g.:

*   `signalExprs.nodes[]`
*   `fieldExprs.nodes[]`
*   `eventOps.nodes[]`
*   `renderSinks.nodes[]`

This is what allows you to derive FrameCache capacities from program tables (your hard rule).

### Pass 7 — Schedule construction (topological + phase ordering)

Goal: produce a deterministic schedule with minimal overhead.

Scheduling constraints:

*   Respect data dependencies
*   Respect state update ordering (stateful ops define dependencies)
*   Separate phases:
    1.  update rails/time inputs
    2.  execute continuous scalars
    3.  execute continuous fields (domain loops)
    4.  apply discrete ops (events) (or integrate into phases if you model event->signal explicitly)
    5.  sinks

Performance rule: schedule ops are coarse enough that the hot loop is predictable:

*   “execute all scalar expr nodes”
*   “execute field expr nodes per domain”
*   not “execute arbitrary graph node with dynamic dispatch”

### Pass 8 — Slot planning (the `slotMeta` pass you already scoped)

Goal: make runtime layout fully explicit and deterministic.

Inputs:

*   all slots referenced by tables/schedule
*   their storage class requirements
*   payload type widths
*   per-domain cardinality (for field/state arrays)

Output:

*   `program.slotMeta[]` with per-slot:
    *   `slotId`
    *   `storage: f64|f32|i32|u32|object`
    *   `offset` (index within that storage array, not bytes)
    *   `shape` (scalar vs field with laneCount) if you represent shape explicitly
    *   debugName optional (if you allow it; still no optionals can be achieved with union variants)

Critical: offsets are per-storage and stable-ordered (slotId ascending within storage), exactly as you wrote.

This pass is also where you compute store sizes:

*   numeric typed arrays
*   object arrays
*   field buffers sized by laneCount

### Pass 9 — Emit constants pool (JSON-only)

*   `program.constants = { json: unknown[] }`
*   no typed-array const pools, no constIndex indirection in runtime state init

### Pass 10 — Debug index (required for sanity)

Emit:

*   patch node/port → lowered node entries
*   slotId → (origin node/port)
*   domainId → loop sites
*   error provenance data (for diagnostics)

This keeps you from losing debuggability as you increase specialization.

* * *

3) Performance properties and why this hits 5–10ms
--------------------------------------------------

### Runtime is O(work) with predictable loops

*   scalar phase: linear in number of scalar ops
*   field phase: sum over domains of (laneCount × fieldOpsInThatDomain)
*   state ops: same as above, but with state array reads/writes

No runtime type checks. No runtime “is this signal or field?” branching. No runtime domain lookup. No runtime slot inference.

### Compiler cost is manageable and incremental

*   Normalization + type solve: roughly linear in nodes/edges (plus small union-find–style unification)
*   Lowering + table building: linear
*   Slot planning: linear in slots

You can add incremental compilation later by memoizing per-subgraph hashes and reusing unchanged lowered tables and slot plans, but you don’t need that to be correct.

* * *

4) How this supports “ignore perspective/branch for now”
--------------------------------------------------------

You keep `Extent` with those axes, but:

*   v0 defaults are canonical
*   you compile exactly one variant

Later, you have two compatible paths:

1.  **Program variant dispatch**: compile multiple programs keyed by (perspective, branch), select at runtime
2.  **State variant dispatch**: compile one program, allocate multiple state buffers keyed by (perspective, branch)

Both preserve the “runtime dumb” rule.

* * *

5) The main design tension (both sides)
---------------------------------------

### The “tables + coarse schedule” approach (recommended)

Pros:

*   fastest runtime
*   simplest runtime
*   excellent cache behavior
*   makes your `slotMeta` rule natural

Cons:

*   compiler is more complex up front
*   adding exotic blocks sometimes requires adding new execution-class kernels

### The “generic node VM schedule” approach

Pros:

*   easier compiler initially
*   more flexible “just add a node” workflow

Cons:

*   runtime pays dynamic dispatch and tag branching
*   harder to guarantee 5–10ms as features grow
*   slot inference temptations creep back in

Given your explicit goals, the first approach is the correct one.

* * *

6) What you should implement first (minimum viable compiler)
------------------------------------------------------------

If you want the smallest slice that still locks the architecture correctly:

1.  Normalization (default sources + rails)
2.  2-axis extent (cardinality/temporality) + payload type inference
3.  Lower into just two tables:
    *   scalar continuous
    *   field continuous (with domain loops)
4.  Slot planning emits required `slotMeta`
5.  Runtime uses only `slotMeta` + `schedule`

Then you layer in discrete/event tables and finally binding/perspective/branch constraints.

That’s a complete compiler design that is performant, deterministic, and fully compatible with your “no inference at runtime” IR contract.

## Prompt:
I have my graph normalizer as a separate component. the compiler only sees a normalized graph

## Response:
Good — that separation is compatible with everything we’ve designed, and it lets you keep the compiler fast and “dumb” in the same way you want runtime to be dumb.

Here’s the clean contract split that preserves all goals (no conflation, minimal complexity, no runtime guessing), and how the five-axis system fits into it.

* * *

1) The single rule: Normalizer owns _structure_, Compiler owns _execution_
--------------------------------------------------------------------------

### Normalizer (front-end)

Produces a **ClosedNormalizedGraph**. It is responsible for making the patch _explicit_:

*   Materialize default sources
*   Materialize rails/buses
*   Expand syntactic sugar into canonical nodes
*   Ensure every input port has a declared combine mode site
*   Resolve _resource references_ (domains/assets) into a stable DomainDecl table
*   Produce a stable, deterministic ordering of nodes/edges/ports

The output must be _complete enough_ that the compiler never needs to invent nodes, edges, or wiring.

### Compiler (back-end)

Consumes only **ClosedNormalizedGraph**, and produces **CompiledProgramIR**:

*   Type-check + axis unification (or accept already-proved types from normalizer, see below)
*   Resolve axis defaults to concrete “resolved extents”
*   Lower nodes into execution classes (scalar/field/event/sink)
*   Build dense program tables
*   Build schedule
*   Allocate slots and emit `program.slotMeta` offsets
*   Emit JSON constants pool

The compiler must not create graph structure. It only plans and lowers.

* * *

2) Where the 5-axis work should live
------------------------------------

You have two viable architectures; pick one and keep it strict.

### Option A (recommended): Normalizer annotates, Compiler proves

Normalizer emits tentative per-port **SignalType/Extent** with many `AxisTag.default`.

Compiler performs:

*   axis unification across edges and combine points
*   default resolution
*   final lowering decisions

Pros: compiler is the single authority on semantic correctness; normalizer stays simpler.

### Option B: Normalizer fully type-proves, Compiler trusts

Normalizer emits a graph where every port has a **ResolvedType** (no defaults, no unknowns) and includes a proof artifact (or simply “this graph is known good”).

Compiler then:

*   does no unification
*   just lowers and allocates

Pros: compiler gets even faster; you can unit-test typing separately.  
Cons: normalizer becomes “the real compiler front-end,” heavier and easier to accidentally let semantics creep into structure.

Given your emphasis on clean boundaries, I’d still do Option A unless you already have a full type solver embedded in the normalizer.

* * *

3) The NormalizedGraph contract you should enforce
--------------------------------------------------

The compiler should be able to assume all of this is true:

### 3.1 Graph closure invariants

*   Every input port has **at least one** incoming edge after defaults are materialized.
*   Rails are explicit source nodes with explicit outputs.
*   No “implicit writers” exist; all writer behavior is represented as edges into ports.
*   Combine mode is stored on the **input port** (the accumulation site), not on edges.

### 3.2 Domain invariants

*   Domains exist as a **DomainDecl table** in the normalized graph.
*   Field ports reference domains by `DomainRef`.
*   No domain flows over wires.

### 3.3 Determinism invariants

*   Node ordering is stable and deterministic.
*   IDs are stable (or canonicalized to stable internal IDs).
*   All derived nodes have stable IDs derived from their origin (for hot-swap).

* * *

4) What the compiler now looks like (simplified)
------------------------------------------------

With that contract, the compiler can be extremely direct:

1.  **Read tables**: nodes, ports, edges, domains
2.  **Type unify** (if Option A)
3.  **Resolve defaults** (v0 canonical)
4.  **Lower** each node into one of:
    *   scalar-continuous kernel
    *   field-continuous kernel (domain loop)
    *   discrete/event kernel
    *   sink kernel
5.  **Build schedule** by dependency ordering + phase ordering
6.  **Allocate slots** → emit `slotMeta` with per-storage offsets (your rule)
7.  Emit `CompiledProgramIR`

No normalization logic, no guessing, no structure creation.

* * *

5) How this affects performance and complexity
----------------------------------------------

This separation is exactly what lets you keep the runtime small and deterministic:

*   Normalizer can be slower and more sophisticated; it’s not in the frame budget.
*   Compiler is deterministic and cacheable (same normalized input → same IR).
*   Runtime executes IR with no inference, consistent with your `slotMeta` contract.

* * *

6) One hard boundary to write into the spec
-------------------------------------------

> **The compiler must reject any NormalizedGraph that requires structural inference.**  
> Concretely: if a port has zero writers and no default source edge, that is a normalizer bug, not a compiler responsibility.

This is the same philosophy as your `slotMeta` rule: no silent fallback.

* * *

If you want, the next step is to pin down the exact `ClosedNormalizedGraph` TypeScript schema (including how you represent derived nodes and domain decls) so the interface between components is mechanically unambiguous.

## Prompt:
This is our old one:

# Graph Normalization: System Invariants

**Status**: Final System Invariant

---

## Core Principle

The compiler consumes a **NormalizedGraph**, not the raw UI graph.

The compiler should never see:
- "bus UI"
- "wire sidecar state"
- "default-source badge"

It should only see:
- Ordinary blocks
- Ordinary edges
- Roles (for debug labeling only)

---

## The Two Graphs

### 1. RawGraph (UI Graph)

What the user edits: blocks, edges, plus role metadata.

This graph may contain "attached" concepts that are not represented as explicit nodes yet:
- Default source attachments (badges on ports)
- Wire-state indicators (slew/delay markers)
- Bus tap UI affordances

**RawGraph is the authoritative, undoable user intent.**

### 2. NormalizedGraph (Compiler Graph)

A fully explicit graph where:
- Every default-source is an actual BlockInstance + Edge
- Every bus tap/publish is an actual block + edges
- Every wire-state sidecar is an actual state block + edges
- No implicit attachments remain

**NormalizedGraph is what you compile.**

---

## Invariant 1: Normalization is a Pure, Deterministic Rewrite

typescript
normalized = normalize(raw, previousNormalized?)

**Key properties:**

1. **Id-stable**: Structural nodes/wires get stable IDs derived from anchors (not from creation order)
2. **Deterministic**: Same raw input → same normalized output
3. **Incremental**: Can reuse previous normalized mapping to avoid churn, but correctness must not depend on it

---

## Invariant 2: Structural IDs Derive from Anchors

Structural things must be keyed by what they attach to.

### Anchor Examples

| Structural Type | Anchor Format |
|-----------------|---------------|
| Default source | defaultSource:<blockId>:<portName>:<in\|out> |
| Wire-state | wireState:<wireId> |
| Bus junction | bus:<busId>:<pub\|sub>:<typeKey> |

### ID Generation

typescript
structNodeId = hash("structNode", anchor)
structEdgeId = hash("structEdge", anchor, localEdgeName)

**Why anchors matter:** Structural objects stop thrashing when the user rearranges things. Moving a block doesn't regenerate all its default-source IDs.

---

## Invariant 3: Single Writer for Structural Artifacts

**Hard rule:**
- User actions can create/remove/edit user blocks/edges
- Structural artifacts are derived, not directly edited (even if visible in UI)

**Store flow:**
user edits → mutate RawGraph → run normalization → produce NormalizedGraph → compile

This eliminates:
- Compiler inserting anything "helpful"
- Runtime repairing missing structural pieces
- Multiple "writers" of structural artifacts (guaranteed drift)

---

## Invariant 4: Structural Artifacts Have Strong Validation

A validator runs after normalization:

1. Every structural node has a valid anchor target
2. Every default-source edge points to the correct port
3. No cycles unless mediated by allowed memory blocks
4. Role kinds are consistent (no wireState node not connected to its wire)

**If validation fails: the editor throws, not the compiler.**

---

## Invariant 5: History Operates on User Intent

Undo/redo operates on RawGraph user intent, not on expanded normalized artifacts.

For debugging and selection, maintain a bidirectional mapping:
- structuralId → anchor
- anchor → structuralId(s)

So UI can click a badge and select the structural node that represents it.

---

## Architecture

### Module Structure

Create one module that owns all structural behavior:

src/editor/graph/
├── RawGraphStore.ts       # Authoritative, undoable user intent
├── GraphNormalizer.ts     # Pure function: RawGraph → NormalizedGraph + Mapping
├── StructuralManager.ts   # Policy engine: decides what structural objects must exist
└── StructuralMapping.ts   # Anchor ↔ IDs, for UI selection + incremental stability

### Type Shapes (Minimal)

typescript
// What the user edits
interface RawGraph {
  blocks: RawBlock[];           // User blocks only
  edges: RawEdge[];             // User edges only
  attachments: Attachment[];    // Default sources, wire-state markers, etc.
}

// What the compiler sees
interface NormalizedGraph {
  blocks: BlockInstance[];      // User + structural blocks
  edges: Edge[];                // User + structural edges
  // No attachments - everything is explicit
}

// Anchor types
type Anchor =
  | { kind: "defaultSource"; blockId: BlockId; port: PortRef; direction: "in" | "out" }
  | { kind: "wireState"; wireId: WireId }
  | { kind: "busJunction"; busId: BusId; role: "pub" | "sub"; typeKey: string };

// Bidirectional mapping for UI
interface StructuralMapping {
  anchorToIds: Map<string, { nodeId?: BlockId; edgeIds: EdgeId[] }>;
  idToAnchor: Map<BlockId | EdgeId, Anchor>;
}

### Normalization Passes (Strict Order)

1. **Default sources** → Create structural blocks + edges for unconnected inputs
2. **Bus junctions** → Create explicit junction blocks for bus connections
3. **Wire-state** → Create infrastructure blocks for slew/delay on wires
4. **Final validation** → Type-check, cycle-check, role consistency

---

## What This Enables

1. **Compiler simplicity**: Compiler sees only blocks + edges, no special cases
2. **Deterministic compilation**: Same user intent → same IR
3. **Stable undo/redo**: History is user intent, derived state regenerates
4. **UI flexibility**: Can show/hide structural artifacts per user preference
5. **Validation at the right layer**: Editor catches structural errors before compilation

---

## What This Prevents

1. **Compiler inserting "helpful" blocks** - Compiler is pure transform of NormalizedGraph
2. **Runtime repair** - No missing structural pieces to fix at runtime
3. **Writer conflicts** - Single source of truth for structural artifacts
4. **ID thrashing** - Anchor-based IDs are stable across edits

---

## Relationship to Other Invariants

### Block & Edge Roles (§15)
Normalized graph contains both user and structural blocks/edges, all with explicit roles.
Roles are preserved through normalization for debug visibility.

### Default Sources (§13)
Default sources are one type of structural artifact created during normalization.
The normalization pass implements the invariant: "every input has exactly one source."

### Unified Transforms (§Unified-Transforms-Architecture)
Graph surgery (inserting infrastructure blocks for stateful transforms) is part of normalization.
The editor performs surgery; the compiler sees the result.

---

## Summary

The editor maintains two graph representations:
- **RawGraph**: User intent, undoable, may have implicit attachments
- **NormalizedGraph**: Fully explicit, compiled, structural artifacts materialized

Normalization is pure, deterministic, and anchor-stable. The compiler never sees UI concepts. Structural artifacts are derived, not edited. Validation happens in the editor, not the compiler.

Can you please provide the replacement for this?

## Response:
Thought for 33s

Graph Normalization v2.5: System Invariants (5-Axis + Domains-as-Resources)
===========================================================================

**Status**: Final System Invariant  
**Applies to**: Looping, real-time, interactive visual instrument (typed reactive graph)

* * *

Core Principle
--------------

The compiler consumes a **ClosedNormalizedGraph**, not the raw UI graph.

The compiler must never see:

*   “bus UI”
*   “wire sidecar state”
*   “default-source badge”
*   “domain picker UI”
*   any implicit/attached concepts

The compiler should only see:

*   **Domain resources** (DomainDecl table)
*   **Ordinary nodes** (user + structural)
*   **Ordinary edges**
*   **Port types** (payload + extent tags; mostly defaults are fine)
*   **Roles** (debug labeling only)

* * *

The Two Graphs
--------------

### 1) RawGraph (UI graph)

What the user edits: user blocks, user edges, and UI attachments.

RawGraph may contain non-graph concepts expressed as attachments:

*   default-source badges
*   bus tap/publish UI
*   wire-state decorations (slew/delay)
*   domain configuration UI state (domain rack entries, domain pickers)
*   cosmetic / selection metadata

**RawGraph is authoritative user intent and undo/redo operates on it.**

### 2) ClosedNormalizedGraph (compiler graph)

A fully explicit graph where:

*   every default source is a real node + edge(s)
*   every bus publish/subscribe is a real node + edge(s)
*   every wire-state transform is a real node + edge(s)
*   every domain is a **DomainDecl resource** referenced by types (never a wire)
*   no implicit attachments remain

**ClosedNormalizedGraph is the only thing you compile.**

* * *

Terminology (non-overlapping)
-----------------------------

### PayloadType

The in-wire payload kind (float/vec2/color/phase/bool/…).

### Extent (5-axis coordinate; compile-time only)

A value’s existence across:

*   cardinality (`zero | one | many(domain)`)
*   temporality (`continuous | discrete`)
*   binding (aboutness; usually default/unbound in v0)
*   perspective (default in v0)
*   branch (default in v0)

### SignalType

`{ payload: PayloadType, extent: Extent }` — the complete port/wire contract.

### DomainDecl

A patch-level **resource** defining a stable lane index set used only when `cardinality = many(domain)`.

DomainDecl is not a runtime value and never flows on wires.

* * *

Invariant 1: Normalization is a Pure, Deterministic Rewrite
-----------------------------------------------------------

```ts
normalized = normalize(raw, previousNormalized, previousMapping)
```

Properties:

1.  **Id-stable**  
    Structural nodes/edges have stable IDs derived from anchors (not creation order).
2.  **Deterministic**  
    Same RawGraph → same ClosedNormalizedGraph.
3.  **Incremental**  
    May reuse previous normalized artifacts to reduce churn, but correctness must not depend on reuse.

* * *

Invariant 2: Structural IDs Derive from Anchors
-----------------------------------------------

All structural artifacts must be keyed by what they attach to.

### Anchor examples (v2.5)

| Structural artifact | Anchor format |
| --- | --- |
| Default source node + edge(s) | `defaultSource:<nodeId>:<portId>` |
| Combine point materialization (if explicit) | `combine:<nodeId>:<portId>` |
| Wire-state transform node(s) | `wireState:<edgeId>:<transformKind>` |
| Bus publish node | `bus:pub:<busId>:<typeKey>` |
| Bus subscribe node | `bus:sub:<busId>:<typeKey>:<nodeId>:<portId>` |
| Rail source node | `rail:<railName>:<typeKey>` |
| Domain resource | `domain:<domainId>` |

### ID generation

```ts
structNodeId = hash("structNode", anchor)
structEdgeId = hash("structEdge", anchor, localEdgeName)
```

Anchors prevent ID thrash when the user rearranges the patch.

* * *

Invariant 3: Single Writer for Structural Artifacts
---------------------------------------------------

Hard rule:

*   user edits create/remove/edit **user** blocks/edges/attachments in RawGraph
*   structural artifacts are **derived** by normalization only

Store flow:

```
user edits → mutate RawGraph → normalize → ClosedNormalizedGraph → compile
```

This prevents:

*   compiler inserting “helpful” structure
*   runtime repairing missing structure
*   multi-writer drift

* * *

Invariant 4: Domains are Resources, Not Wires
---------------------------------------------

1.  Domains exist in ClosedNormalizedGraph as a **DomainDecl table**.
2.  Ports/wires reference domains only via `DomainRef` inside `extent.cardinality = many(domain)`.
3.  No node may output “a domain” and no port may accept “a domain” as a payload.
4.  DomainDecl parameters must be compile-time resolvable to lane counts (v0).

This makes domain a compile-time loop contract, not a runtime value.

* * *

Invariant 5: ClosedNormalizedGraph is Structurally Closed
---------------------------------------------------------

After normalization:

1.  Every **input port** has at least one incoming edge.  
    If the user did not connect anything, normalization must connect a default source edge.
2.  Rails/buses are explicit nodes and edges.  
    No “implicit global” sources exist beyond the explicit rail nodes.
3.  No attachments remain.  
    All UI-level attachments must be represented as nodes/edges/resources or be absent from ClosedNormalizedGraph entirely.
4.  All structural nodes/edges carry explicit roles for debugging only.  
    Roles never change compilation semantics.

* * *

Invariant 6: Normalization Seeds Types; Compiler Proves Them
------------------------------------------------------------

ClosedNormalizedGraph must include a `SignalType` per port, but normalization is allowed to leave axes as `AxisTag.default`.

*   Normalizer responsibilities:
    *   ensure every port has a declared `SignalType`
    *   instantiate _only what is structurally known_ (e.g., `many(domain)` when a port is explicitly configured as field)
    *   keep binding/perspective/branch as defaults in v0 unless the patch explicitly sets them
*   Compiler responsibilities:
    *   strict axis unification across edges and combine points
    *   default resolution (canonical defaults in v0)
    *   lowering decisions (scalar/field/event) from resolved extent

Normalization must not “guess” semantics that require whole-graph proof.

* * *

Invariant 7: Validation Happens in the Editor Layer, Not the Runtime
--------------------------------------------------------------------

A validator runs immediately after normalization and must fail fast.

### Structural validation (normalizer-owned)

1.  Every structural artifact has a valid anchor target.
2.  Every default-source edge points to the correct port.
3.  Every DomainRef points to an existing DomainDecl.
4.  No port direction violations (out→in only).
5.  No dangling nodes/ports created by normalization.

### Cycle validation (normalizer-owned)

*   Cycles are allowed only if mediated by explicit memory/state blocks (UnitDelay/Accumulator/SampleHold/Phasor-class).  
    Everything else must be acyclic in the dependency sense.

### Semantic validation (compiler-owned)

*   axis unification errors
*   payload type mismatches
*   temporality mismatches (continuous vs discrete) unless bridged by explicit operators

If structural validation fails: **the editor throws** (normalizer bug or invalid RawGraph state).  
If semantic validation fails: **the compiler errors** with references back through the structural mapping.

* * *

Invariant 8: History Operates on User Intent
--------------------------------------------

Undo/redo operates on RawGraph only.

To support UI selection/debugging of structural artifacts, normalization must produce a bidirectional mapping:

*   `anchor → structural IDs`
*   `structural ID → anchor`

This mapping is the sole bridge between UI affordances and compiler-visible artifacts.

* * *

Architecture
------------

### Module structure (v2.5)

```
src/editor/graph/
├── RawGraphStore.ts            # Authoritative user intent + undo/redo
├── GraphNormalizer.ts          # Pure function: RawGraph → ClosedNormalizedGraph + Mapping
├── StructuralPolicy.ts         # Decides required structural artifacts from RawGraph + rules
├── StructuralAnchors.ts        # Anchor definitions + stable ID derivation
├── StructuralMapping.ts        # Anchor ↔ IDs (UI selection, incremental stability)
├── GraphValidation.ts          # Post-normalization structural/cycle validation
└── DomainRack.ts               # DomainDecl authoring + validation (resource layer)
```

* * *

Type Shapes (No Optional Fields; Discriminated Unions Only)
-----------------------------------------------------------

### RawGraph (user intent)

```ts
type RawGraph = {
  blocks: RawBlock[];         // user blocks only
  edges: RawEdge[];           // user edges only
  attachments: Attachment[];  // UI-only intent markers
  domains: DomainDecl[];      // user-authored domain resources
};
```

### ClosedNormalizedGraph (compiler input)

```ts
type ClosedNormalizedGraph = {
  domains: DomainDecl[];   // includes normalized/validated domain resources
  nodes: NodeInstance[];   // user + structural nodes
  edges: Edge[];           // user + structural edges
};
```

### Attachments (UI-only)

```ts
type Attachment =
  | { kind: "defaultSourceBadge"; target: { nodeId: NodeId; portId: PortId } }
  | { kind: "wireStateMarker"; edgeId: EdgeId; transform: WireTransformKind }
  | { kind: "busTap"; busId: string; role: "pub" | "sub"; target: { nodeId: NodeId; portId: PortId } }
  | { kind: "domainBinding"; target: { nodeId: NodeId; portId: PortId }; domainId: DomainId };
```

### Ports (input and output are distinct variants, no optional combine)

```ts
type CombineMode =
  | { kind: "numeric"; op: "sum" | "avg" | "min" | "max" | "mul" }
  | { kind: "any"; op: "last" | "first" | "layer" }
  | { kind: "bool"; op: "or" | "and" };

type InPort = {
  kind: "in";
  id: PortId;
  type: SignalType;
  combine: CombineMode;
};

type OutPort = {
  kind: "out";
  id: PortId;
  type: SignalType;
};

type Port = InPort | OutPort;
```

### Node instances (origin is a union; no optional fields)

```ts
type Origin =
  | { kind: "user"; rawNodeId: NodeId }
  | { kind: "structural"; anchor: Anchor };

type NodeInstance = {
  id: NodeId;
  kind: string;     // block kind
  origin: Origin;
  ports: Port[];
  role: Role;       // debug labeling only
};
```

### Structural mapping

```ts
type StructuralMapping = {
  anchorToIds: Map<string, { nodeIds: NodeId[]; edgeIds: EdgeId[] }>;
  idToAnchor: Map<string, Anchor>; // stringified (NodeId|EdgeId) → Anchor
};
```

* * *

Normalization Passes (Strict Order)
-----------------------------------

1.  **Canonicalize**  
    Normalize IDs, sanitize ports, normalize block parameter shapes.
2.  **Domains**  
    Validate/normalize `DomainDecl` table; ensure every referenced domain exists; compute any compile-time metadata needed for compiler (laneCount for v0).
3.  **Rails / Buses**  
    Insert explicit rail source nodes; lower bus pub/sub UI into explicit nodes/edges.
4.  **Default Sources**  
    For every input port with no writer edge, insert a default source node + edge anchored to that port.
5.  **Wire-State Transforms**  
    Lower wire-sidecar markers into explicit state/transform nodes and rewire edges.
6.  **Final Validation**  
    Run structural + cycle validation; produce StructuralMapping and debug provenance.

* * *

What This Enables (v2.5)
------------------------

1.  Compiler sees a closed, explicit graph and can stay purely a lowering/scheduling engine.
2.  Domain becomes a compile-time loop contract that never leaks into runtime.
3.  Five-axis semantics stay compile-time only; perspective/branch remain inert defaults until enabled.
4.  Runtime never repairs or infers anything; it executes `CompiledProgramIR` with required `slotMeta`.

* * *

What This Prevents (v2.5)
-------------------------

1.  Compiler inserting “helpful” missing structure.
2.  Runtime guessing offsets, storage classes, or slot layouts.
3.  Domain-as-value confusion (no domain wires, no runtime domain objects).
4.  ID thrash when the user rearranges or refactors the patch.

* * *

Summary
-------

The editor maintains two graphs:

*   **RawGraph**: user intent + UI attachments + domain resources
*   **ClosedNormalizedGraph**: fully explicit nodes/edges + domain decls, free of UI concepts

Normalization is pure, deterministic, anchor-stable, and structurally validating, and the compiler is a pure transform from ClosedNormalizedGraph to a fully specified runtime program with no fallback inference.



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)