# Oscilla V2 Architecture Notes (Living Doc)

This document captures a structured, item-by-item review of the V2 repo. Each topic includes:
- What I see in the repo
- What looks right
- What looks wrong or risky
- Open questions

We’ll fill this in sequentially with your answers and intent for V2 and V3.

## Topics (in order)

1. High-level architecture and guiding principles
2. Repo layout and module boundaries
3. Patch/graph data model
4. Compiler pipeline
5. Runtime execution model
6. Render pipeline
7. Block registry and lowering system
8. Expression DSL and IR
9. Patch DSL, import/export, persistence
10. State management (stores, MobX usage)
11. UI/editor architecture
12. Diagnostics, events, logging
13. Services and utilities
14. Settings and persistence
15. Testing strategy
16. Tooling, build, lint, dev scripts
17. Demos, examples, and docs

---

## 1) High-Level Architecture and Guiding Principles

**What I see**
- The canonical architecture spec is ` /Users/bmf/code/oscilla-animator-v2/design-docs/CANONICAL-oscilla-v2.5-20260109/ `.
- The index points to a condensed spec (`ESSENTIAL-SPEC.md`), invariants, glossary, and 21 topic areas.
- ` /Users/bmf/code/oscilla-animator-v2/ARCHITECTURE.md ` exists but is not authoritative.

**What looks right**
- The guiding principles are clear and coherent.
- The compilation pipeline is explicit and lends itself to testability and deterministic behavior.
- Non-negotiables are strong constraints that support correctness and performance.

**What looks wrong / risky**
- The authoritative spec is large and still updating, which makes implementation alignment difficult without stronger traceability.
- Test coverage is extensive but not tagged by “behavior to keep” vs “behavior to change,” making refactors risky.

**Progress / decisions captured so far**
- Canonical baseline: V3 carry-forward baseline is the entire canonical spec directory `design-docs/CANONICAL-oscilla-v2.5-20260109/` (not `ARCHITECTURE.md`).
- Top-level goal: implement the canonical spec so it (a) works and (b) is architecturally robust/stable; no additional top-level goals identified.
- Scope guardrails: the biggest risk is shipping “toy” subsystems missing essential functionality/optimizations/complexity that will only become obviously necessary late in development (e.g., v1 had robust events/diagnostics that were initially ignored/forgotten in v2).
- Timeline guardrails: timeline is explicitly subordinate to correctness and architectural soundness; optimize for sequencing and building the right thing reliably (not “shipping fast”).
- Invariant framing: keep performance mechanics (e.g., structural sharing / hash-consing, explicit cache keys) as tools/solutions, not as first-class goals competing with product features.
- “Toolbox” doc pattern (proposed for V3): keep correctness/semantics in core invariants/contract docs; keep performance techniques in a separate “implementation toolbox” with explicit triggers (“only required when X budget is exceeded”).
- Transactions: `I24 Snapshot/Transaction Model` is affirmed; intended meaning for V3 is command transactions (atomic command batches) as the foundation for trustworthy undo/redo + multi-client sync.
- Patch validity: `I26 Every Input Has a Source` is intended to be enforced such that users never experience an “invalid patch”; patch is normalized and recompiled on every edit, and any user-reachable broken state is a product bug.
- Toy detector: `I27 Toy Detector` should not be treated as an invariant; preference is to drop it.
- Docs taxonomy: split fundamental conceptual contracts (core engine/protocol invariants) from product design / UI docs (mutable, deletable without changing core contracts).
- Testing: for V3, reliable/deterministic/realistic testing should be a first-class design constraint; testing difficulty in V2 contributed to unnecessary complexity.
- Test-porting expectation: V3 is expected to be a fundamentally new architecture; do not assume any V2 tests port directly (tests should be rebuilt around V3 contracts).

**Open questions**
- None (resolved as of this pass).

---

## 2) Repo Layout and Module Boundaries

**What I see**
- Top-level structure includes `src/`, `design-docs/`, `docs/`, `tests/`, `public/`, `scripts/`, `eslint-rules/`, `dist/`, `web/`, plus tool configs (`vite`, `vitest`, `tsconfig`, `eslint`).
- `src/` is organized by domain: `blocks/`, `compiler/`, `runtime/`, `render/`, `ui/`, `stores/`, `graph/`, `types/`, `services/`, `settings/`, `expr/`, `events/`, `diagnostics/`, `patch-dsl/`, `projection/`, `transforms/`.
- `design-docs/` contains the canonical spec system, while `docs/` appears to hold implementation-facing notes.
- Custom ESLint rules exist in `eslint-rules/` and are applied to hot-path files and block lowering constraints, but there are no visible module-boundary rules in `eslint.config.js`.
- `web/` contains a `WEB-INF/` directory (purpose unclear from layout alone).

**What looks right**
- The `src/` layout mirrors the conceptual architecture (compiler/runtime/render/ui/stores).
- Custom lint rules for performance and hot-path safety show good engineering intent.
- Canonical spec is centralized under `design-docs/`.

**What looks wrong / risky**
- Module boundaries are implied by folder names but not enforced by tooling.
- `docs/` vs `design-docs/` separation could lead to conflicting truths.
- Presence of `dist/` and `test-results/` in the repo root can cause confusion if they’re not clearly ignored or managed.
- `web/WEB-INF` is an outlier directory that might indicate an abandoned or legacy integration.

**Progress / decisions captured so far**
- V3 will be a new repo (V2 continues in parallel); V3 repo layout and boundaries are free to change.
- V3 direction is a package-oriented layout with structural enforcement of boundaries (explicit exports, tooling-enforced dependency graph, one mutation doorway via commands).
- Boundary enforcement: module boundaries should be formalized/enforced in tooling (not just implied by folders).
- Docs taxonomy (V2 intent): `docs/` is user-facing usage documentation; `design-docs/` is internal development specs/proposals (canonical spec lives here).

**Open questions**
- None (resolved as of this pass).

---

## 3) Patch/Graph Data Model

**What I see**
- ` /Users/bmf/code/oscilla-animator-v2/src/graph/Patch.ts ` defines the user-facing, undoable graph model and explicitly forbids compiler/runtime artifacts from being written back into Patch objects.
- Patch shape:
- Blocks with `id`, `type`, `params` (config), `displayName` (required), `domainId` (nullable), `role`, plus first-class `inputPorts` and `outputPorts`.
- Edges with `id`, `from`, `to`, `enabled`, `sortKey`, `role`.
- Endpoints exist as `{ kind: 'port', blockId: string, slotId: string }` (naming/type consistency appears in flux).
- Ports carry per-instance authoring intent:
- Default sources (`defaultSource`) and combine mode (`combineMode`) for normal inputs.
- Varargs connections stored on the input port (bypass combine/edges).
- Lenses stored as per-port attachments keyed by a `sourceAddress` and expanded during normalization.
- A canonical naming/addressing system appears in the repo (`src/graph/address-*`, canonical-name utilities) and is referenced by varargs/lenses.

**What looks right**
- Clear intent: Patch is “authoritative user intent” and compiler artifacts stay out of it. This is the correct boundary for undo/redo and collaboration.
- Modeling lenses/varargs/default sources as explicit authoring intent (not implicit typechecker behavior) supports determinism and debuggability.
- Deterministic ordering is explicitly represented (`sortKey`) rather than being implicit in array insertion order.

**What looks wrong / risky**
- ID/type consistency: `BlockId` is strongly typed in `src/types`, but edges/endpoints still use plain `string` in `Patch.ts`. This can lead to subtle bugs as features like collaboration and undo/redo mature.
- “Endpoint” concept is unclear and may duplicate “Port” semantics; the naming (`slotId`) suggests historical baggage and risks confusion.
- Edge IDs were introduced after initially treating edges as implicit; retrofitting persistence later added complexity (this is a known pain point).
- Canonical addresses are powerful but unforgiving: if addresses change under rename (intended), rename becomes non-local and must be implemented as a deterministic rewrite/propagation across the patch.

**Progress / decisions captured so far**
- Type/ID system: `BlockId` existed early; edges were originally implicit and later became explicit (retrofit complexity).
- Edge modeling (updated decision): edges are explicit and persisted (even if the patch DSL continues to express connections compactly).
- Duplicate connections are not allowed (treat duplicates as a product bug).
- Edge identity (proposed canonical identity): a single connection is uniquely identified by `{ fromPortAddress, toPortAddress, role }` (no duplicates), where each port address is a canonical address for a specific block port.
- Edge ordering: `sortKey` remains the explicit authoring mechanism for deterministic ordering into multi-input combines (ordering is separate from identity).
- Diagnostics targeting: diagnostics should reference both endpoints (fromPortAddress + toPortAddress) and may optionally include a derived `edgeKey` string for UI highlighting; conceptually “diagnostics attach to the connection”, not exclusively “on the edge” or “on the port”.
- Endpoint vs port: “Endpoint” is likely just “Port” in disguise; the model should converge on a single, unambiguous concept and naming.
- Canonical addressing: strongly preferred for V3 from the beginning; it is critical for human-debuggable errors and for keeping tests/fixtures compact.
- Patch DSL alignment: canonical address system and the HCL patch DSL should be intentionally aligned so tests and examples don’t depend on ad-hoc object construction.
- Lenses: intended to apply to both inputs and outputs; each port can own a `lensStack` (expanded deterministically by normalization).
- Layout (node positions): must be persistent for UX, and should participate in undo/redo and collaboration.
- Layout storage structure: no strong preference (“whatever is standard”); choose the simplest model that supports persistence + undo/redo + collaboration.
- “Patch validity”: users should never reach a broken/invalid patch state; if they can, it’s a bug (normalization + fast recompilation is expected to guarantee this).
- Patch persistence today: the live patch is the canonical state; the HCL patch DSL is generated from the live patch (two-way sync/translation exists).
- Canonical addresses and rename semantics: canonical addresses are intentionally not stable across renames (rename changes address); this is a feature (Terraform-style).
- Optional naming: consider an optional `label` field for user-facing renames that should not affect canonical addressing.
- Rename propagation: renaming a block instance must deterministically propagate through the patch; no cross-patch references are expected to block this.
- Identity split (V3 intent): canonical addresses identify patch elements (human-readable, used in diagnostics/commands); runtime/continuity uses separate stable IDs (e.g., `StateId`) for instance elements.
- Layout persistence (V3 default): treat layout as a separate persisted object (an overlay “document”) keyed by canonical addresses, so layouts can be per-user, multi-layout, or shared without polluting core patch semantics. Command transactions may include both patch ops and layout ops atomically when needed.

**Open questions**
- None (resolved as of this pass).

---

## 4) Compiler Pipeline

**What I see**
- Main entry points:
- ` /Users/bmf/code/oscilla-animator-v2/src/compiler/compile.ts ` exports `compile(patch, options?)` and implements a full pipeline end-to-end.
- ` /Users/bmf/code/oscilla-animator-v2/src/compiler/frontend/index.ts ` exports `compileFrontend(patch)` which produces a typed patch + cycle summary for UI.
- ` /Users/bmf/code/oscilla-animator-v2/src/compiler/backend/index.ts ` exports `compileBackend(typedPatch, convertToProgram, options?)` which consumes frontend output and produces a runnable program IR.
- Normalization is conceptually “compiler frontend” now:
- `src/graph/normalize.ts` is a shim re-exporting `src/graph/passes`, which itself re-exports passes implemented in `src/compiler/frontend/normalize-*`.
- Observability hooks are integrated:
- `CompilationInspectorService` captures pass snapshots by name (normalization, type constraints, type graph, time, depgraph, scc, lowering, schedule).
- `EventHub` emits `CompileBegin` / `CompileEnd` events with diagnostics payloads (at least in the monolithic `compile()` path).
- Pass structure (current `compile()`):
- Normalization (`normalize(patch)`)
- Pass 1: type constraints (union-find / constraint propagation)
- Pass 2: type graph validation / typed patch build
- Pass 3: time model derivation
- Pass 4: dependency graph derivation
- Pass 5: SCC/cycle validation
- Pass 6: block lowering to IR fragments (uses `AddressRegistry`)
- Pass 7: schedule construction
- Phase B: kernel resolution (resolve kernel names → runtime handles via default registry)
- Output shaping:
- `compile()` converts builder + schedule into a `CompiledProgramIR` including slot metadata, render outputs, field slot registry, debug index, and a kernel registry handle table.
- There is evidence of legacy/migration artifacts:
- `src/compiler/passes-v2/` exists alongside the newer frontend/backend split.
- Several `*.backup` / `*.orig` files exist under `src/compiler/`.

**What looks right**
- The frontend/backend split is a strong structure for “always show something in the UI” even when the backend cannot run.
- Normalization as a deterministic, ordered pass pipeline aligns with the “never-invalid patch” UX goal.
- Inspector + events provide a workable bridge between “engine pipeline” and “debuggability/diagnostics” without requiring the UI to introspect internals directly.
- Kernel resolution as an explicit phase makes runtime dispatch more predictable and avoids late failures.

**What looks wrong / risky**
- Pipeline duplication / confusion risk: there are multiple compilation entrypoints (monolithic `compile()`, `compileFrontend()`, `compileBackend()`), plus legacy `passes-v2`. This can fragment behavior and tests if not kept aligned intentionally.
- Error/diagnostic type fragmentation: `compile()` defines its own `CompileError` shape, while `src/compiler/types.ts` defines a different unified `CompileError` used by `passes-v2`.
- Non-local policy decisions embedded in compiler:
- Reachability filtering can downgrade certain errors for unreachable blocks (good UX, but it’s a policy that could surprise if not clearly documented and tested).
- Diagnostic flag overrides can downgrade errors to warnings and even apply fallbacks (e.g., unitless fallback for conflicting units).
- `compile()` currently does a lot of “program assembly” work (slot meta, debug index, outputs) inline; this can make the boundary between “compilation” vs “program packaging” less clear.

**Progress / decisions captured so far**
- Current architecture trend is toward an explicit frontend/backend split (UI-first typed graph + backend runnable IR), with `compile()` acting as an end-to-end convenience entrypoint that can reuse precomputed frontend output.
- UX hard requirement: “dragging a block into a working patch should not immediately break everything and fill the screen with diagnostic errors.”
- Reachability filtering / tree-shaking direction:
- Default behavior should prevent unreachable block issues from breaking a working patch.
- Prefer skipping compilation (lowering/scheduling) for blocks not connected to a sink (e.g., render sink), rather than compiling everything and then suppressing errors.
- Whether this is configurable is not important; the UX rule is the contract. (Concern: configuration toggles can make testing harder.)
- Testing hard requirement: it must be possible to test patches without deleting everything from the patch each time (reachability filtering is in service of this).
- Normalization placement: moving normalization under compiler frontend is contextually understandable; not a strong preference, but there’s suspicion the “normalization is part of compiler” gravity will recur.
- Diagnostic flag system: considered ad-hoc/weak; V3 should redesign from first principles. Reuse parts if helpful, but treat none of it as authoritative.
- Legacy `passes-v2`: not a V3 design concern. V3 won’t spec or port a “migration harness” for a new app; V2 keeps its own history.
- Events/diagnostics emission: event system is currently ad-hoc and lightly used; V3 likely needs a full redesign (keep whatever is useful).
- Reachability semantics (captured):
- Definition: reachable if it has any direct/transitive connection to a render sink.
- Sink policy: debug sinks downgrade to warnings; render/export sinks are errors.
- Granularity: reachability is per block; connected blocks can fail compilation; unconnected blocks do not fail compilation.
- Frontend/backend split: frontend may still normalize + type-check unreachable blocks (for UI), while backend tree-shakes them out of lowering/scheduling.
- Diagnostics: frontend should surface unreachable-block diagnostics as warnings for discoverability.

**Open questions**
- None (resolved as of this pass).

---

## 5) Runtime Execution Model

**What I see**
- The runtime executes a compiled program per frame via `executeFrame()` in ` /Users/bmf/code/oscilla-animator-v2/src/runtime/ScheduleExecutor.ts `.
- Execution is explicitly described as a two-phase model (compute first, then write state for next frame) to enforce stateful semantics and cycle legality.
- Slot-addressed storage:
- ` /Users/bmf/code/oscilla-animator-v2/src/runtime/RuntimeState.ts ` defines `ValueStore` (primarily `Float64Array` + `objects` map + `shape2d` bank) and slot metadata is produced by the compiler to map slots → storage/offset/stride.
- Per-frame caching:
- `FrameCache` uses stamp-based invalidation and caches signal values and field buffers; includes migration-era caches for legacy vs ValueExpr paths.
- Hot-swap and continuity support are built-in:
- `RuntimeState` composes long-lived `SessionState` (time, external channels, continuity, health, optional debug tap) plus per-compile `ProgramState` (values, caches, primitive state array, event storage).
- State migration is implemented in ` /Users/bmf/code/oscilla-animator-v2/src/runtime/StateMigration.ts ` using stable `StateId`s and lane mapping for field state.
- Continuity (gauge + slew) is applied using deterministic `t_model_ms` time in ` /Users/bmf/code/oscilla-animator-v2/src/runtime/ContinuityApply.ts ` and related continuity modules.
- External inputs:
- `ExternalChannelSystem` is part of session state; commits happen at frame start in `executeFrame()`.
- Events:
- Runtime maintains per-frame event scalars plus event payload arrays (`events: Map<slot, EventPayload[]>`) that are cleared each frame.
- Rendering integration:
- Runtime collects render steps and assembles a `RenderFrameIR` via ` /Users/bmf/code/oscilla-animator-v2/src/runtime/RenderAssembler.ts `; camera is resolved via ` /Users/bmf/code/oscilla-animator-v2/src/runtime/CameraResolver.ts `.

**What looks right**
- Two-phase execution is a strong, explicit contract that supports determinism, correct stateful semantics, and hot-swap/state migration without accidental intra-frame feedback.
- Session vs program state split is a clean structural boundary that makes hot-swap lifecycle explicit.
- Slot-addressed typed storage + precomputed slot lookup tables are the right performance shape for a real-time system.
- Continuity and state migration are treated as first-class runtime concerns rather than being bolted on as UI hacks.

**What looks wrong / risky**
- Global/module-level caches and pools (e.g., slot lookup cache and materializer pool) can make deterministic testing harder and can complicate multiple-runtime-instance scenarios if that ever becomes a goal.
- Runtime code still carries explicit “migration path” complexity (legacy caches and predicate tracking alongside ValueExpr systems), which increases cognitive load and test surface.
- Continuity promises “allocation-free per frame,” but domain change paths intentionally allocate snapshots when resizing buffers; this is probably fine, but should be treated as a documented, budgeted exception.
- `RuntimeState` is a flattened composition of Session+Program state for backwards compatibility; convenient, but can blur lifecycle boundaries in practice.

**Progress / decisions captured so far**
- Runtime capabilities to explicitly preserve/document (beyond a simplistic “two-phase model” summary):
- Stateful blocks (frame-delayed semantics for state reads/writes).
- Cycles are legal if a stateful block breaks the cycle (previous-frame reads; synth-style semantics).
- Continuity system is always-on (gauge invariance + configurable real-time transition period) to prevent jank across recompiles.
- Events have special handling in runtime (exact semantics to be captured).
- Hot swap is a fundamental necessity (live performance + authoring).
- Multi-runtime instances are a baseline requirement (e.g., live previewing edits); architecture should support multiple simultaneous runtimes.
- Determinism/replay: required contract since v0 (may not be fully achieved yet, but is non-negotiable).
- V3 lifecycle boundary preference: whatever best enables multiple runtimes; an explicit “engine instance” object that owns caches/pools sounds like the right direction.
- State identity: `StateId` refers to instance elements, not patch nodes; it is conceptually separate from canonical addresses.
- Candidate stable ID derivation: `<canonical address of owner block>[element index]` (or similar).
- Rename policy tradeoffs if stable IDs depend on canonical addresses:
- Names write-once (poor UX).
- Names editable; rename recreates elements (continuity can smooth “added/removed element” transitions; mid-performance renames become a known behavior).
- Names editable only when stopped (read-only while running).
- Multi-runtime requirement: must support both multiple patches concurrently and multiple instances of the same patch (e.g., previews).
- Determinism/replay boundary: time is required; randomness must be seeded and deterministic; external channels should be deferred/captured carefully (avoid making them part of “guaranteed replay” until they’re properly specified).
- Runtime capabilities inventory (V2 code reality):
- Two-phase schedule execution (`ScheduleExecutor.executeFrame`) with strict separation of phase-1 eval vs phase-2 state writes.
- Slot-addressed storage (`RuntimeState.values` + `program.slotMeta` lookup) with typed banks (`Float64Array`, `Uint32Array shape2d`, `objects: Map` for non-f64).
- Field materialization path via unified `ValueExprMaterializer` (buffer pooling + per-frame cache stamps).
- Time resolution (`timeResolution.resolveTime`) with monotonic `tMs`, phases, palette/energy outputs, and phase offset reconciliation for hot-swap continuity.
- External input infrastructure (`ExternalChannelSystem`) with a thread-safe write bus and per-frame immutable snapshots; channel kinds support value/pulse/accum semantics.
- Discrete event evaluation (`ValueExprEventEvaluator`) with const/never/pulse/combine(any|all)/wrap(rising edge) semantics, plus runtime cycle-detection as a safety guard.
- Event lifetime semantics: per-slot `eventScalars` are cleared each frame; within a frame, firing is monotone-OR (once fired, stays fired for the tick).
- Event payload infrastructure exists (`RuntimeState.events: Map<eventSlot, EventPayload[]>`) and is cleared each frame, but (currently) appears mostly wired for tests/infrastructure rather than pervasive block-level usage.
- Hot-swap support via session/program state split (`SessionState` preserved, `ProgramState` rebuilt) and state migration (`StateMigration.migrateState`) using stable `StateId`s + continuity lane mapping.
- Continuity system integration (`ContinuityMapping`, `ContinuityApply`, `ContinuityState`) including stable/unstable domain identity modes and mapping-by-id / mapping-by-position fallbacks.
- Render assembly in runtime (`RenderAssembler`) producing renderer-ready `RenderFrameIR` using `RenderBufferArena` for allocation control; includes projection (ortho/persp), visibility culling, depth sorting + compaction, and pass grouping.
- Camera globals resolution (`CameraResolver`) with deterministic sanitization and defaults.
- Runtime health monitoring (`HealthMonitor`) for frame timing, NaN/Inf batching, pool stats, throttled snapshot emission (integrates with diagnostics/events).
- Optional observation hook (`DebugTap`) for low-coupling instrumentation of slot/field values during execution.
- Kernel dispatch infrastructure (`KernelRegistry`, `SignalKernelLibrary`, `OpcodeInterpreter`) oriented toward handle-based dispatch and no string lookups in hot loops.
- Multi-instance pressure points (V2): module-level caches/pools exist (`SLOT_LOOKUP_CACHE`, `MATERIALIZER_POOL`) and would need scoping to an engine instance in V3 (already aligned with the “no singletons” preference).
- Events semantics (canonical + code-aligned summary):
- Storage: events are per-tick scratch buffers (scalar “fired” plus optional payload arrays); all cleared at tick start.
- Ordering/determinism: schedule order is deterministic; event combine order is derived from stable writer ordering; within V2 boolean event evaluation, `combine(any|all)` short-circuits (fine for fired/not-fired) but payload ordering would require full evaluation if/when payloads become first-class.
- Predicate-to-event conversion: `wrap` implements rising-edge detection of a boolean predicate derived from a continuous signal (`signal >= 0.5`), with NaN/Inf treated as false.
- Explicit event-to-continuous conversion: events do not implicitly become continuous; dedicated blocks (e.g., SampleAndHold) must bridge.

**Open questions**
- None (resolved as of this pass).

---

## 6) Render Pipeline

**What I see**
- The render boundary is a concrete draw-op IR:
- ` /Users/bmf/code/oscilla-animator-v2/src/render/types.ts ` defines `RenderFrameIR` (v2) as a list of fully-resolved `DrawOp`s (`DrawPathInstancesOp`, `DrawPrimitiveInstancesOp`) with local-space geometry and world-space instance transforms.
- The runtime is responsible for producing `RenderFrameIR`:
- ` /Users/bmf/code/oscilla-animator-v2/src/runtime/RenderAssembler.ts ` assembles render ops by resolving fields/scalars/shape2d records and applying projection/compaction/depth-sorting.
- Renderers are pure sinks:
- Canvas 2D backend: ` /Users/bmf/code/oscilla-animator-v2/src/render/canvas/Canvas2DRenderer.ts ` consumes `RenderFrameIR` and draws.
- SVG backend: ` /Users/bmf/code/oscilla-animator-v2/src/render/svg/SVGRenderer.ts ` consumes `RenderFrameIR`, uses `<defs>/<use>` geometry reuse, and updates per-frame instance nodes.
- Allocation strategy:
- ` /Users/bmf/code/oscilla-animator-v2/src/render/RenderBufferArena.ts ` provides a preallocated arena for render-time buffers (positions, colors, indices, etc.) and is used by the runtime render assembler for zero-allocation rendering after init.
- There are WebGL design notes but not (obviously) a full implementation:
- `src/render/webgl/webgl-renderer-spec.md` and `src/render/webgl/webgl-renderer-pitfalls.md`.

**What looks right**
- Draw-op centric `RenderFrameIR` cleanly enforces “renderer is a sink”: no slot IDs, no compiler/runtime references, no late interpretation.
- Local-space geometry + world-space transforms is a solid uniform-modulation model and keeps renderer logic predictable.
- Multiple backends (Canvas2D + SVG) help validate the render IR abstraction and prevent overfitting to one implementation.
- `RenderBufferArena` is an effective enforcement mechanism for “no allocations in render hot path” (fail-fast on overflow).

**What looks wrong / risky**
- Cross-layer coupling: `Canvas2DRenderer` imports `isPathTopology` from `runtime/RenderAssembler`, which is a layering smell (render backend depending on runtime helpers).
- Cache identity hazards: SVG geometry reuse is keyed by `(topologyId, points Float32Array identity)` which is fast, but could leak `<defs>` entries if points buffers churn identity across frames/compiles.
- Multi-runtime requirement pressure: any global/singleton arena or global renderer state will fight the “multiple simultaneous runtimes” requirement unless scoped to an engine instance.
- Canvas2D per-instance `save/restore` and path rebuilding in inner loops may become a performance limit at higher instance counts (may be acceptable for now).

**Progress / decisions captured so far**
- Default/authoritative backend priority (V3 intent): #1 WebGL, #2 SVG; Canvas is not a target.
- Depth sorting: always required.
- Stable identity: treat “stable across recompile” as a universal requirement (geometry/topology/cache identity should not churn on recompile).
- Multi-runtime constraint: no global singletons; render arenas and renderers should be owned per engine instance (or equivalent instance boundary).

**Open questions**
- None (resolved as of this pass).

## 7) Block Registry and Lowering System

**What I see**
- Block definitions live in a global registry:
- ` /Users/bmf/code/oscilla-animator-v2/src/blocks/registry.ts ` defines `BlockDef` (UI metadata + port typing + lowering), `registerBlock()`, and lookup helpers (`getBlockDefinition`, `requireBlockDef`, etc.).
- Registration is side-effect driven:
- ` /Users/bmf/code/oscilla-animator-v2/src/blocks/all.ts ` imports each block category index to trigger `registerBlock()` calls.
- The compiler “owns” loading blocks:
- ` /Users/bmf/code/oscilla-animator-v2/src/compiler/compile.ts ` does a side-effect `import '../blocks/all'`.
- Blocks are organized by category folders under `src/blocks/` (math/signal/field/render/time/etc.), and each block typically registers itself from its module.
- `BlockDef` is doing a lot (by design):
- UI metadata: `label`, `category`, `description`.
- Ports: `inputs: Record<string, InputDef>`, `outputs: Record<string, OutputDef>`; port types are `InferenceCanonicalType` (payload/unit vars allowed in defs; resolved during type inference).
- Compilation annotations: `form`, `capability`, `isStateful`, payload + cardinality metadata, optional `adapterSpec`.
- Lowering: `lower(args) => LowerResult`, plus optional `lowerOutputsOnly()` for two-pass SCC lowering.
- There is a “purity / effects-as-data” migration in flight:
- Some blocks mark `loweringPurity: 'pure'` and return declarative `effects` (slot requests, state decls, step requests) instead of allocating imperatively in the builder.
- The backend contains explicit machinery to support both styles.
- Composite blocks are first-class definitions in a separate registry:
- ` /Users/bmf/code/oscilla-animator-v2/src/blocks/composite-types.ts ` defines `CompositeBlockDef` (internal graph + exposed ports).
- ` /Users/bmf/code/oscilla-animator-v2/src/blocks/registry.ts ` also includes composite registration (`registerComposite`) and validation.
- ` /Users/bmf/code/oscilla-animator-v2/src/blocks/composites/index.ts ` registers library composites and loads user composites from localStorage (and registers them too).
- Lowering pass structure:
- ` /Users/bmf/code/oscilla-animator-v2/src/compiler/backend/lower-blocks.ts ` pass6 lowers each block via its registered `lower()` function.
- Multi-input resolution happens in lowering via `resolveBlockInputs()` + `createCombineNode()` from `src/compiler/passes-v2/*` utilities (writer resolution + combine emission).
- Cycles are handled via SCC-aware two-pass lowering:
- Non-trivial SCCs call phase-1 `lowerOutputsOnly()` for stateful blocks to produce outputs without inputs, then phase-2 `lower()` for all blocks with inputs available.
- There is an emerging “binding pass” for deterministic allocation:
- ` /Users/bmf/code/oscilla-animator-v2/src/compiler/backend/binding-pass.ts ` defines a pure `bindEffects()` (allocation decisions) + mechanical application (`applyBinding`) to make resource allocation deterministic and idempotent (especially across SCC phase-1/phase-2).

**What looks right**
- “One registry” is a useful forcing function: blocks have a single authoritative definition that compilers/UI can refer to.
- Using `InferenceCanonicalType` in block defs is the right long-term shape: block authors can define payload/unit-generic blocks without inventing parallel type systems.
- Two-pass SCC lowering is the right conceptual strategy for stateful-cycle legality: it enforces “outputs can be read before inputs are available” only where explicitly supported.
- The `effects-as-data` + binding pass direction is strong:
- It moves allocation and “side effects” out of ad-hoc per-block imperative lowering and into a deterministic, testable pass.
- It is the kind of structure that naturally supports collaboration/undo/redo via server-sequenced ops (because it removes hidden allocation behavior).
- Composite defs being validated at registration time is good hygiene (fail early).

**What looks wrong / risky**
- Global singleton registry + side-effect imports are a scalability hazard:
- It makes tests order-dependent (import order matters).
- It makes “multiple engine instances” awkward (V3 requirement): per-instance block libraries become hard if registry is process-global.
- It couples the compiler to the full block library (`compile.ts` importing `blocks/all`), which blurs boundaries and makes it harder to run compiler logic against a different block set.
- `BlockDef` mixes UI metadata + lowering behavior in one object:
- This is convenient, but it invites layering violations (UI importing compiler/runtime types, blocks importing UI-only types, etc.).
- If V3 wants hard boundaries, this is one of the biggest “easy-to-violate” spots unless structurally enforced.
- Purity migration increases complexity:
- Supporting both imperative lowering and declarative effects means more surface area, more “partial patterns”, and more subtle bugs until the migration completes.
- Backend lowering still depends on `passes-v2` utilities for multi-input combine/writers:
- This suggests duplication/legacy pressure inside backend passes, and increases the chance of divergent behavior (frontend vs backend expectations).
- User composites loaded from localStorage and registered into the same global registry:
- Great for product iteration, but dangerous for determinism, testing, and collaboration unless composite libraries are modeled as explicit, versioned inputs to compilation.

**Progress / decisions captured so far**
- V3 constraint alignment (from earlier topics): no global singletons; support multi-runtime instances. This directly implies the block registry must be instance-scoped (not a process-global singleton) in V3.
- V3 direction (proposed): treat “block library” as an explicit input to compilation/runtime:
- `EngineInstance` owns `{ blockLibrary, kernelRegistry, caches }`.
- `compile(patch, { blockLibrary, ... })` is parameterized rather than importing global side effects.
- V3 direction (proposed): finish the migration and enforce `lower()` as a pure function returning declarative effects (no hidden allocation), with a single deterministic binder allocating slots/state/steps.
- V3 direction (proposed): keep composite blocks as first-class definitions, but model the “composite library” as a versioned input (not an ambient localStorage side channel) so collaboration/replay can reproduce exactly.
- Registry lifetime (V3): one `BlockLibrary` per `EngineInstance` is acceptable.
- Lowering contract (V3): “lowering is pure + effects-as-data” must be an enforceable invariant (explicitly prevent backsliding; prefer mechanical enforcement such as `eslint` + tests).
- User composites (V3): generally should be part of persisted patch revision for collab/replay, but this is extremely low priority until the system is rendering and there is any meaningful patch export system.
- Versioning/migrations (V3): deferred; likely yes, but treat as “version: 1” now and do not prioritize until rendering exists.

**Open questions**
- None (resolved as of this pass).

---

## 8) Expression DSL and IR

**What I see**
- There is a real “mini compiler” for expression strings:
- ` /Users/bmf/code/oscilla-animator-v2/src/expr/index.ts ` exposes `compileExpression()` and hides internals.
- ` /Users/bmf/code/oscilla-animator-v2/src/expr/lexer.ts ` → `parser.ts` → `typecheck.ts` → `compile.ts` implements the pipeline.
- The DSL is explicitly treated as user-facing and frozen:
- ` /Users/bmf/code/oscilla-animator-v2/src/expr/GRAMMAR.md ` and ` /Users/bmf/code/oscilla-animator-v2/src/expr/FUNCTIONS.md ` are both marked FROZEN with review gates.
- The DSL supports:
- Arithmetic + comparisons + boolean ops + ternary.
- Function calls.
- Vector swizzles/component access (implemented via structural IR `extract` / `construct`).
- Optional block output member references via canonical addressing (e.g., `circle_1.radius`) when `BlockRefsContext` is provided (address registry + allowlist).
- The DSL typechecker currently reasons in terms of `PayloadType` (not full `CanonicalType`), with notes that phase/unit semantics are owned by the canonical type system instead of the DSL.
- Expression compilation produces unified IR nodes:
- The DSL compiler emits `ValueExprId` nodes via `IRBuilder` methods like `kernelMap`, `kernelZip`, `extract`, `construct`, etc.
- The IR core is a single unified `ValueExpr` table:
- ` /Users/bmf/code/oscilla-animator-v2/src/compiler/ir/value-expr.ts ` defines a canonical union with a small `kind` space and `type: CanonicalType` on every node.
- ` /Users/bmf/code/oscilla-animator-v2/src/compiler/ir/IRBuilder.ts ` is the primary construction API; `IRBuilderImpl` also hash-conses by JSON-stringifying the node (structural sharing in the builder).
- Runtime evaluation is aligned to the unified ValueExpr model:
- ` /Users/bmf/code/oscilla-animator-v2/src/runtime/ValueExprSignalEvaluator.ts ` evaluates continuous+one (signals).
- ` /Users/bmf/code/oscilla-animator-v2/src/runtime/ValueExprMaterializer.ts ` materializes continuous+many (fields) to `Float32Array`.
- ` /Users/bmf/code/oscilla-animator-v2/src/runtime/ValueExprEventEvaluator.ts ` evaluates discrete (events).
- There is an explicit “enforcement belt buckle” for types:
- ` /Users/bmf/code/oscilla-animator-v2/src/compiler/frontend/axis-validate.ts ` validates axis invariants + “no var escapes” and is run in `compileFrontend()` (frontend boundary).
- There are explicit “prevent backsliding” tests:
- ` /Users/bmf/code/oscilla-animator-v2/src/compiler/__tests__/no-legacy-types.test.ts ` mechanically fails if legacy expression families (SigExpr/FieldExpr/EventExpr, etc.) reappear in production code.

**What looks right**
- The “frozen grammar + compilation-only” approach is correct:
- No runtime parsing/eval means determinism and performance are naturally preserved.
- A single canonical ValueExpr table is exactly the kind of foundational design that prevents “Type System drift”:
- There is one expression family, one ID type (`ValueExprId`), and types live on nodes (`CanonicalType`).
- The axis-validation belt-buckle is the right pattern for agent work:
- It gives you one hard enforcement point that makes it difficult for partial implementations to “cheat” by leaking var axes or allowing invalid axis shapes.
- The existence of enforcement tests that grep the repo is extremely valuable:
- This is a concrete pattern for preventing agents from reintroducing legacy types or helper APIs “because it’s easier”.
- The IRBuilder / “effects-as-data” direction (from Topic 7) complements this:
- It naturally supports incremental, testable changes without hidden behavior that can be masked by shallow tests.

**What looks wrong / risky**
- Documentation drift exists inside the expression DSL module:
- ` /Users/bmf/code/oscilla-animator-v2/src/expr/README.md ` still references `SigExprId` even though the implementation uses `ValueExprId`. This is a small example of a bigger risk: docs becoming “aspirational” instead of mechanically true.
- The Expression DSL currently typechecks only `PayloadType`:
- This is probably fine for MVP, but it creates a seam where agents may accidentally (or intentionally) implement unit semantics in the DSL, creating a second type authority. If v3 cares about “Type System, Type System, Type System”, this seam needs an explicit guardrail.
- `PureFn` includes `{ kind: 'expr' }` and the runtime has infrastructure for “expression strings as ops”:
- Even if currently used only as an escape hatch, this is a backsliding vector (agents will reach for “just interpret it” if tests allow it). If it stays, it needs hard constraints around where it is allowed.
- Slot-read semantics appear under-specified in the runtime evaluators:
- `ValueExprSignalEvaluator` and `ValueExprMaterializer` have `slotRead` codepaths that treat `ValueSlot` as a direct array offset, while the compiled program’s `slotMeta` defines offsets separately. This may be “unused today” (looks mostly covered by tests), but it is a future footgun if slotRead becomes real.
- The IRBuilder hash-consing uses `JSON.stringify(expr)` as the cache key:
- Fine as a pragmatic compile-time technique, but it’s not a structural invariant and can be fragile (property ordering, performance). This belongs in the “toolbox” category, not as a semantic dependency.

**Progress / decisions captured so far**
- V3 motivation alignment: a big reason to do v3 is to bake in the “one canonical ValueExpr + one canonical type system + one axis validation gate” pattern from day zero, instead of carrying migration seams and legacy helpers.
- “Prevent backsliding” is already happening in v2 in a valuable way:
- Axis validation gate at the frontend boundary.
- Grep-based enforcement tests to prevent legacy types from reappearing.
- V3 direction (proposed, enforcement-first):
- Every “foundational type system rule” must have at least one mechanical enforcement:
- `eslint` rules for dependency boundaries and forbidden imports/identifiers.
- Test gates like `no-legacy-types.test.ts` for “you can’t cheat”.
- A single canonical validation gate (axis + no-var-escape) that the backend refuses to bypass.
- Agents must be able to implement increments without “simplifying away” future constraints:
- Prefer writing tests that force the constraint to exist (e.g., tests that fail if var axes escape, or if discrete payload isn’t bool+none).
- Prefer storing provenance/metadata in IR in a way that later systems can consume (diagnostics, debug tracing), so “we’ll add it later” doesn’t become permanent technical debt.
- Expression DSL typing (V3): full `CanonicalType` compilation/typechecking is a hard requirement (avoid the “second type authority” seam).
- `PureFn.expr` (V3): must never be allowed anywhere; prefer mechanical prevention (types + lint + tests) so agents cannot reintroduce runtime interpretation.
- Member access UX: expressions remain local-input only; “block.port” in the expression editor should be UX sugar that auto-wires that port into the Expression block’s varargs input (keep modularity + improve usability).
- Architecture enforcement suite: yes, but be careful not to encode and therefore “bless” V2’s bad patterns into V3.
- Doc drift prevention (proposed): treat public-facing docs as mechanically verifiable:
- Add grep-based tests (in the style of `no-legacy-types.test.ts`) to fail if docs mention deleted/legacy identifiers (e.g., `SigExprId`).
- Prefer generating API references (or keep them minimal + link to canonical spec) to prevent “aspirational docs”.
- SlotRead footgun (V2 note): current evaluators treat `ValueSlot` as an array offset; if/when `slotRead` becomes real, it must route through `slotMeta` offsets (otherwise it will be a persistent correctness hazard).

**Open questions**
- None (resolved as of this pass).

---

## 9) Patch DSL, Import/Export, and Persistence

**What I see**
- There is a real Patch DSL subsystem, implemented as an HCL-inspired text format:
- Public API lives at ` /Users/bmf/code/oscilla-animator-v2/src/patch-dsl/index.ts ` and intentionally does not export lexer/parser/AST internals.
- Patch serialization is implemented in ` /Users/bmf/code/oscilla-animator-v2/src/patch-dsl/serialize.ts `:
- Deterministic output: blocks are sorted by canonical name and attributes are sorted by key.
- Name collision handling: collisions are resolved by appending `_2`, `_3`, etc.
- Edge serialization is “inline”: enabled user edges are emitted under `outputs {}` inside the *source* block (single target uses `out = other.in`; fan-out uses a list).
- Port overrides (`combineMode`, `defaultSource`) are emitted as `port "in" { ... }` blocks (only when non-default).
- Varargs are emitted as `vararg "in" { connect { sourceAddress = "..."; alias?; sortKey = N } }`.
- Lenses are emitted as `lens "LensType" { port = "..."; sourceAddress = "..."; ...params }`.
- Patch deserialization is implemented in ` /Users/bmf/code/oscilla-animator-v2/src/patch-dsl/deserialize.ts `:
- Pipeline is Lex → Parse → AST→Patch conversion.
- It returns `{ patch, errors, warnings }` and is designed to “never throw” (exceptions are caught and converted into errors with an empty patch).
- The parser is handwritten and explicitly supports error recovery (` /Users/bmf/code/oscilla-animator-v2/src/patch-dsl/parser.ts `).
- AST→Patch conversion is done in ` /Users/bmf/code/oscilla-animator-v2/src/patch-dsl/patch-from-ast.ts `:
- Standalone `connect {}` blocks are explicitly rejected; edge declarations must be inline via `outputs {}` / `inputs {}` within blocks.
- Edges are resolved after block registration and deduplicated by endpoint pairs (`from.blockId:from.port → to.blockId:to.port`).
- Block ports are seeded from the current block registry (`getBlockDefinition(type)`), with unknown types producing warnings.
- Patch DSL has a “tripwire” test suite that encodes known bug regressions and edge cases:
- ` /Users/bmf/code/oscilla-animator-v2/src/patch-dsl/__tests__/tripwire.test.ts `
- There is also roundtrip and error recovery coverage (`roundtrip.test.ts`, `serialize.test.ts`, `deserialize.test.ts`, `error-recovery.test.ts`, plus composite tests).
- Persistence in the running app is *not* Patch DSL by default:
- ` /Users/bmf/code/oscilla-animator-v2/src/services/PatchPersistence.ts ` persists the live patch as JSON in `localStorage` (key `oscilla-v2-patch-v10`), while Patch DSL is used for import/export (`exportPatchAsHCL` / `importPatchFromHCL`).

**What looks right**
- The Patch DSL is exactly the kind of “engineering affordance” that makes the system buildable:
- Compact fixtures: tests and examples can be written as declarative text instead of ad-hoc object construction.
- Human-debuggable: when something breaks, you can paste a patch into a test and keep iterating.
- Deterministic serialization is a big deal:
- It naturally enables stable diffs, golden tests, and mechanical verification that “nothing changed” across refactors.
- “Never throw + partial patch” import behavior is a very good UX and a very good dev affordance:
- It means you can treat Patch DSL as an editor format (or at least a robust interchange format) without catastrophic failure modes.
- The existence of targeted “tripwire” tests is a good pattern to promote for V3:
- They catch extremely specific, high-value edge cases that are easy for agents to re-break.

**What looks wrong / risky**
- There are currently two persistence truths:
  - JSON localStorage is the default persistence mechanism, while Patch DSL is import/export.
  - This split is pragmatic for V2, but it’s a drift vector for V3 (agents can “fix” one path and forget the other).
  - Response: the patch-dsl was implemented very recently and everything else in the system predates it, which is why it's not well integrated
- Deserialization currently generates random IDs (`generateId()` uses time + counter):
  - This is fine for “import a patch as a new object”, but it is directly at odds with V3 goals like canonical addressing, deterministic replay, and stable identity for collaboration/undo.
  - Response: Definitely some stuff to figure out.  If there are lessons we can take from terraform, let's do it
- Edge representation in Patch DSL is intentionally compact, but it discards some patch-level details:
  - Serializer filters to enabled user edges only and does not preserve edge IDs (and the DSL itself has no explicit edge identity).
  - Response: Edge representation will need to be explicit in v3, patch-dsl must change
  - That is probably correct for an interchange format, but V3 must be explicit about what is “authoritative patch semantics” vs “derived/presentation”.
  - Response: If we can get it to authoritative patch semantics while remaining actually usable, that is great.  if its not possible, lean into 'lightweight UX affordance'
    - Response: There could also be a 'patch-dsl-lite' for in-editor usage and a full patch-dsl for export, and it could even include the entire block schemas if necessary.  it would be expected users would import it and do the actual editing within the app on the 'lite' format
- Reference resolution uses canonicalized display names (and an identifier-safe mapping) as the indirection mechanism:
  - This works, but it implies rename is a semantic rewrite. In V3, that is acceptable (Terraform-like), but it must be intentionally designed and mechanically enforced across the whole system (ops log, canonical addresses, layout overlays, tests).
  - Response: maybe another argument for 'patch-dsl-lite'.  in-editor we know we can fully handle renames on the lite dsl.  patch-dsl-export format has a built in mapping of some sort?  open question, not critical to solve today
- Ports are seeded from the *current* block registry at import time:
  - Great for UX (“you always get the right ports”), but it means import is not a pure function of the DSL text if block definitions change over time.
  - Response: include block schema for included blocks within patch-dsl-export.  either way we have a long way to go before this is on anyones radar
- This pushes V3 toward needing a real story for block/type versioning or explicit “migration layers” (even if deferred, the contract needs to be acknowledged).
  - Response: Strong agree.
- The DSL currently rejects standalone `connect {}` blocks:
  - This is not necessarily wrong, but it removes a representation that might be very useful for future edge identity, metadata, and diffs (especially for collaboration-oriented workflows).
  - Response: Revert this decision.  Require connect blocks (or a similar constrct) to make edges a first class citizen

**Progress / decisions captured so far**
- “Patch DSL is a keeper” is reaffirmed:
- It should be a first-class tool for tests/fixtures/debugging in V3, and it should be intentionally aligned with the canonical addressing system from day zero (Terraform-style mental model).
- Integration gap (V2 reality): patch-dsl is very new relative to the rest of the system, which is why local persistence and other workflows are not deeply integrated with it yet.
- V3 guardrail direction (enforcement-first):
- Choose one canonical persistence substrate and generate all derived forms from it (avoid multiple “writers” that can drift).
- Invest early in mechanical verification around Patch DSL and persistence:
- Deterministic serialization golden tests.
- Roundtrip tests that force preservation of semantics (not necessarily IDs).
- Tripwire suites for “previously broken edge cases”.
- Grep/lint-based enforcement to prevent bypassing the import/export boundary (e.g., “don’t build patches by hand in tests; use the DSL”).
- Alignment with collaboration/undo model:
- Patch DSL is best treated as a snapshot/interchange format.
- Collaboration and undo/redo should be built primarily on server-sequenced ops + atomic command transactions (Topic 1/3), with Patch DSL used for fixtures, import/export, and “bootstrap snapshots” when needed.
- V3 patch-dsl direction:
- Edge representation must become explicit (edges are first-class and persisted; patch-dsl must change accordingly).
- Require `connect {}` blocks (or an equivalent construct) so edges are first-class citizens and can carry identity/metadata.
- Prefer authoritativeness where feasible: if patch-dsl can be authoritative while remaining usable, do it; otherwise explicitly support a “UX-lite” representation.
- Proposed split: `patch-dsl-lite` (in-editor / UX-oriented / rename-friendly) vs `patch-dsl-export` (export/import / higher fidelity, potentially including embedded block schemas).
- Terraform lessons: lean into Terraform-style addressing concepts for determinism, but acknowledge there is real engineering work to reconcile canonical addressing with stable runtime/collab identity.
- Block schema/versioning direction (V3): agree this needs a real story (migration layers), even if it’s deferred; one option is embedding schema for referenced blocks in `patch-dsl-export`.
- V3 persistence substrate (inferred from the collaboration model): server-sequenced ops is the primary model; local/offline persistence should be “ops log + periodic snapshots” (with deterministic snapshots), not “random IDs on import”.

**Open questions**
- None (resolved as of this pass).

---

## 10) State Management (Stores, MobX)

**What I see**
- The app uses MobX (6.x) + `mobx-react-lite` for state management.
- MobX is configured in strict mode via ` /Users/bmf/code/oscilla-animator-v2/src/stores/configure.ts `:
  - `enforceActions: 'always'` (mutations must be inside actions)
  - `computedRequiresReaction: true`
  - `reactionRequiresObservable: true`
- Store composition is centralized in ` /Users/bmf/code/oscilla-animator-v2/src/stores/RootStore.ts `:
  - One RootStore owns all sub-stores (PatchStore, SelectionStore, ViewportStore, SettingsStore, DiagnosticsStore, FrontendResultStore, etc).
  - RootStore wires an `EventHub` (` /Users/bmf/code/oscilla-animator-v2/src/events/EventHub.ts `) and a `DiagnosticHub` for event-driven diagnostics.
  - RootStore tracks a `patchRevision` counter, used by diagnostics and compile orchestration.
- PatchStore is explicitly framed as the “single source of truth” for patch topology in ` /Users/bmf/code/oscilla-animator-v2/src/stores/PatchStore.ts `:
  - Internal mutable state is stored in `_data` (Map of blocks + array of edges).
  - All mutations are MobX `action`s; read APIs are `computed`.
  - It exposes an “immutable view” getter `patch` (type `ImmutablePatch`) that:
    - Uses a cached snapshot to avoid GC churn.
    - Is invalidated by `_dataVersion++` on each mutation.
    - Freezes the returned snapshot object/edges array.
- There is an explicit pattern of “UI stores store IDs only”:
  - ` /Users/bmf/code/oscilla-animator-v2/src/stores/SelectionStore.ts ` holds selected/hovered IDs and derives block/edge objects from PatchStore.
  - ` /Users/bmf/code/oscilla-animator-v2/src/stores/LayoutStore.ts ` owns node positions as UI state, not patch topology.
- Compilation is triggered by a MobX reaction, not by explicit command/transaction boundaries:
  - ` /Users/bmf/code/oscilla-animator-v2/src/services/LiveRecompile.ts ` sets up a `reaction()` that watches `store.patch.patch` (the cached immutable snapshot) and computes a deep hash via `JSON.stringify(block.params)` and inputPorts data.
  - Compile orchestration uses `untracked(() => store.patch.patch)` to read patch imperatively (` /Users/bmf/code/oscilla-animator-v2/src/services/CompileOrchestrator.ts `).
- There is a public “stores barrel” module with stated boundary constraints:
  - ` /Users/bmf/code/oscilla-animator-v2/src/stores/index.ts ` claims “Only this module may import 'mobx'” and “rootStore singleton removed”.
  - In practice, many store modules import `mobx` directly and a singleton store module still exists (` /Users/bmf/code/oscilla-animator-v2/src/stores/instance.ts `).

**What looks right**
- MobX strict-mode is a real guardrail:
  - It pushes mutations into well-defined action boundaries and prevents the most common “spooky state update” bugs.
- PatchStore’s “single source of truth” framing is correct (and crucial for V3):
  - Selection/layout stores storing only IDs (and deriving data) is the correct separation between undoable patch state and pure UI state.
- PatchStore snapshot caching is a pragmatic, real performance win:
  - It addresses a common MobX pitfall (accidentally allocating huge object graphs on every render/reaction).
  - The explicit `_dataVersion` invalidation gives a single, mechanical “reactive pulse” to depend on.
- `FrontendResultStore` is the kind of “stable UI contract” store you want:
  - It translates compiler internals into a canonical-address query API (` /Users/bmf/code/oscilla-animator-v2/src/stores/FrontendResultStore.ts `).
  - This is a good precedent for “keep compiler internals out of UI”.
- SettingsStore token registry + per-namespace persistence is clean and scalable (` /Users/bmf/code/oscilla-animator-v2/src/stores/SettingsStore.ts `).

**What looks wrong / risky**
- There is no explicit, enforceable “transaction/command” boundary for patch edits:
  - PatchStore has many small action methods (addBlock, updateBlockParams, addEdge, addLens, etc.), but there is no “one doorway” abstraction that makes ops invertible for undo/redo and serializable for collaboration.
  - This is the single biggest reason state complexity tends to explode as features accumulate.
- Deep change detection is currently solved with ad-hoc hashing (`LiveRecompile.hashBlockParams`):
  - This is an “agent simplification trap”: it passes today’s tests but becomes fragile as soon as state grows (performance, missed fields, accidental non-determinism).
  - It is evidence that the reactive model is shallow relative to the true domain model (graphs, nested maps, port attachments, etc.).
- Patch revision and GraphCommitted semantics appear inconsistent:
  - RootStore emits `GraphCommitted` based only on `{ blocks.size, edges.length }` reaction (and comments admit it’s a “Sprint 1 simplified implementation”).
  - PatchStore also emits `GraphCommitted` for some mutations (defaultSource, lenses, varargs), with `patchRevision + 1` in places.
  - This makes it hard to build a reliable “rev → compile → diagnostics” pipeline, and will absolutely fight collaboration.
- The declared architectural boundaries around store imports aren’t mechanically enforced and are already drifting:
  - `src/stores/index.ts` states constraints that are not true in code today.
  - This is exactly the kind of “backsliding” that V3 should structurally prevent (lint/test gates, not comments).
- Store lifetime and multi-instance support are not first-class:
  - A singleton RootStore module exists (`src/stores/instance.ts`) even though React uses StoreProvider.
  - For V3’s “multiple runtimes / multiple patches / collaboration”, global singletons are a recurring failure mode.

**Progress / decisions captured so far**
- V3 requirement alignment:
  - Patch/graph/params/settings/layout that are patch-serializable must be undoable and collaboration-ready.
  - Pure UI state (selection/hover) is not undoable.
  - Collaboration is server-sequenced ops (so the state model must be ops-first, not “MobX mutation-first”).
- State-management direction for V3 (proposal consistent with your goals):
  - Treat “ops log + deterministic reducer + validation gates” as the canonical state engine.
  - Use a UI state library (MobX is fine) as a view-layer integration on top of the canonical engine, not as the engine itself.
  - Build mechanical enforcement so agents cannot cheat:
    - One `applyOps()` doorway in the editor domain package.
    - Forbidden-import lint rules (`mobx` must not appear in domain packages; UI packages must not mutate patch directly).
    - Tests that fail if patch state changes without producing an op record (undo/redo and collab depend on this).
- MobX-State-Tree (MST) fit (initial take):
  - MST can help with snapshot/patch emission and undo/redo for tree state, but the V3 requirements are graph + server-sequenced ops + invertibility + deterministic replay.
  - Even if MST is used, you still need an explicit op model (do not let “recording mutations” become the op protocol).
  - Net: MST is unlikely to be the best foundational choice for V3; it may still be useful as a UI-layer tool, but not as the canonical collaboration/undo substrate.
- Decision (V3): canonical editor state is `ops log + deterministic reducer + periodic deterministic snapshots` (server-sequenced ops is the source of truth).
- Decision (V3): keep MobX out of the canonical engine:
  - MobX may still be used for UI-only state and UI projections, but patch/layout semantics must not depend on MobX mutation recording.
  - This aligns with priorities of “lots of examples” while keeping the core correctness/collab guarantees in a mechanically testable reducer/op model.
- Decision (V3): undo is expressed as a normal op batch (client-generated inverse ops) and is sequenced by the server like any other edit:
  - This forces invertibility to be a first-class constraint and avoids a separate “undo protocol” that agents can accidentally special-case.
- Decision (V3): layout is a separate document/stream by default (can be per-user or shared), but the protocol must support atomic transactions that include both patch ops and layout ops when required.

**Open questions**
- None (resolved as of this pass).

---

## 11) UI and Editor Architecture

**What I see**
- The UI is a React app with a multi-panel workspace:
  - ` /Users/bmf/code/oscilla-animator-v2/src/ui/components/app/App.tsx ` uses Dockview to host multiple panels with a shared toolbar.
- The graph editor is ReactFlow-based, with an explicit push toward reuse:
  - ` /Users/bmf/code/oscilla-animator-v2/src/ui/graphEditor/GraphEditorCore.tsx ` is a reusable editor core that renders the canvas and synchronizes a store-agnostic adapter into ReactFlow nodes/edges.
  - ` /Users/bmf/code/oscilla-animator-v2/src/ui/reactFlowEditor/ReactFlowEditor.tsx ` is mostly “editor chrome” (panels, menus) around GraphEditorCore.
- The graph editor data layer uses an adapter abstraction:
  - ` /Users/bmf/code/oscilla-animator-v2/src/ui/graphEditor/types.ts ` defines `GraphDataAdapter` + minimal `BlockLike`/`EdgeLike` shapes.
  - ` /Users/bmf/code/oscilla-animator-v2/src/ui/graphEditor/PatchStoreAdapter.ts ` adapts PatchStore + LayoutStore + FrontendResultStore into the editor core.
  - A parallel adapter exists for composite editing (`CompositeStoreAdapter`).
- Nodes are rendered via a unified node component:
  - ` /Users/bmf/code/oscilla-animator-v2/src/ui/graphEditor/UnifiedNode.tsx ` is shared across editors, driven by `GraphEditorContext`.
  - Port metadata and tooltips are derived by transforming registry definitions + frontend snapshot into `UnifiedNodeData`:
    - ` /Users/bmf/code/oscilla-animator-v2/src/ui/graphEditor/nodeDataTransform.ts `.
- Editor access is mediated through a generic “current editor handle” context:
  - ` /Users/bmf/code/oscilla-animator-v2/src/ui/editorCommon/EditorContext.tsx ` provides `EditorHandle` for editor-agnostic actions (add block, auto-arrange, zoom-to-fit).
  - `BlockLibrary` explicitly describes EditorHandle as the “single authority for block creation”, routing to PatchStore vs CompositeEditorStore depending on active editor (`src/ui/components/BlockLibrary.tsx`).
- Auto-layout is implemented using ELK and integrated into the editor:
  - `src/ui/reactFlowEditor/layout.ts` uses `elkjs`, and GraphEditorCore computes initial layout before first render to reduce “flash”.
- There is a mix of UI frameworks + patterns:
  - Mantine theming is configured in App (`MantineProvider`) and some components use MUI (`@mui/material`), plus many custom CSS files.
- There are several “window global” integration points:
  - Editor: `window.__reactFlowPortContextMenu` is used by `UnifiedNode` to open port context menus (set in `ReactFlowEditor.tsx`).
  - App wiring: `window.__setStats`, `window.__renderApp`, `window.__oscilla_*` preset globals, and `window.clearStorageAndReload`.

**What looks right**
- The adapter-driven GraphEditorCore is the right architectural move:
  - It creates a structural boundary between “graph UI” and “data store”, enabling testing (adapter tests exist) and future evolution.
  - It naturally supports “multiple editors” (main patch editor vs composite editor) without copy/paste UI.
- The “unified node” approach is correct:
  - It avoids having multiple node renderers drift (a common source of UI bugs and inconsistent affordances).
- The initial-layout-before-render behavior is a real UX win:
  - It prevents the common ReactFlow flash where nodes render at (0,0) and then jump.
- The frontend snapshot → UI projection pattern is strong:
  - Editor UI can show resolved types/provenance even when compilation fails, without importing compiler internals.

**What looks wrong / risky**
- Store coupling leaks past the adapter boundary:
  - Many UI components still call `patch.*` methods directly (menus, parameter controls, hotkeys), bypassing GraphDataAdapter/EditorHandle.
  - This undermines the “single doorway” principle that V3 needs for undo/redo + collaboration (agents will reach for the nearest store method).
- The current context menu wiring uses a window global:
  - `UnifiedNode` depends on `window.__reactFlowPortContextMenu`, which is brittle (multi-editor, tests, and multi-instance will be painful).
  - This is a classic “works today, blocks V3” integration shortcut.
- GraphEditorCore’s reactivity is MobX-specific and somewhat ad-hoc:
  - It uses a MobX `reaction()` keyed by string-joined IDs and a `dataVersion` integer.
  - This is workable for V2, but it is not the kind of principled, ops-driven update model we want in V3 (and can become a perf bottleneck as graph size grows).
- Connection validation depends on the full Patch object (`patch` prop) rather than only on the adapter + frontend snapshot:
  - That increases layering/coupling and makes it harder to isolate editor logic.
- UI layer complexity is high:
  - Mixing Mantine + MUI + custom CSS can cause “two sources of truth” for styling, theming, and component behaviors.
  - Large, multi-responsibility files (e.g., `BlockInspector.tsx`) increase the risk that UI becomes the dumping ground for domain logic.

**Progress / decisions captured so far**
- V3 guardrail direction (UI side):
  - UI components must not mutate patch/layout state directly.
  - All editor mutations must route through the canonical op/command doorway (Topic 10), which is what makes undo/redo + collaboration structurally enforceable.
  - The adapter pattern is worth carrying forward, but it must become “ops-driven”, not “MobX observability driven”.
- Proposed mechanical enforcement for V3 (to keep agents aligned):
  - Lint rule: forbid imports of patch mutation APIs from UI packages; UI can only call `dispatch(transaction)` or similar.
  - Test gate: assert that every state change produces an op record (no silent mutations).
  - Eliminate window globals in favor of context-bound callbacks or explicit props (so multiple editor instances can coexist).

**Open questions**
- For V3, do you want to keep ReactFlow as the primary graph editor canvas:
  - Keep it (leverage maturity/examples), or replace with a custom canvas/editor (more control, more work)?
- For V3, should `GraphEditorCore` be:
  - A “dumb view” that renders nodes/edges from a snapshot + emits intents (recommended for ops-first), or
  - A reactive component that subscribes directly to state changes (MobX/Zustand/etc.)?
- Should V3 standardize on a single UI component library (or none):
  - If yes, which one is the intended baseline (Mantine-only, MUI-only, or “headless + custom”)?
- Should port/block context menus be:
  - Editor-owned state (no globals, context-provided callbacks), or
  - An external system with an explicit API (to support plugins/custom menus later)?
