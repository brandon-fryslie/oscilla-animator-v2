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
- Invariant framing: keep performance mechanics (e.g., structural sharing / hash-consing, explicit cache keys) as tools/solutions, not as first-class goals competing with product features.
- “Toolbox” doc pattern (proposed for V3): keep correctness/semantics in core invariants/contract docs; keep performance techniques in a separate “implementation toolbox” with explicit triggers (“only required when X budget is exceeded”).
- Transactions: `I24 Snapshot/Transaction Model` is affirmed; intended meaning for V3 is command transactions (atomic command batches) as the foundation for trustworthy undo/redo + multi-client sync.
- Patch validity: `I26 Every Input Has a Source` is intended to be enforced such that users never experience an “invalid patch”; patch is normalized and recompiled on every edit, and any user-reachable broken state is a product bug.
- Toy detector: `I27 Toy Detector` should not be treated as an invariant; preference is to drop it.
- Docs taxonomy: split fundamental conceptual contracts (core engine/protocol invariants) from product design / UI docs (mutable, deletable without changing core contracts).
- Testing: for V3, reliable/deterministic/realistic testing should be a first-class design constraint; testing difficulty in V2 contributed to unnecessary complexity.

**Open questions**
- Do you want to classify or tag any subset of tests as “must preserve” vs “allowed to change,” or is that a V3-only concern?
- Are there any guardrails for scope or timeline that should be captured (beyond “robust and stable implementation of the canonical spec”)?

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

**Open questions**
- Do you want to formalize module boundaries in tooling (eslint import rules, TS project references, or package-level splits)?
- What is the intended role of `docs/` vs `design-docs/`? Which one should be authoritative for V2?
- Is `web/WEB-INF` in active use, or can it be removed/archived?
- Are `dist/` and `test-results/` expected to live in the repo, or should they be treated as build artifacts only?

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
- Type/ID system: `BlockId` existed early; edges were originally implicit and later became explicit. For V3, edge IDs should be first-class persistent objects from the start.
- Endpoint vs port: “Endpoint” is likely just “Port” in disguise; the model should converge on a single, unambiguous concept and naming.
- Canonical addressing: strongly preferred for V3 from the beginning; it is critical for human-debuggable errors and for keeping tests/fixtures compact.
- Patch DSL alignment: canonical address system and the HCL patch DSL should be intentionally aligned so tests and examples don’t depend on ad-hoc object construction.
- Lenses: intended to apply to both inputs and outputs; each port can own a `lensStack` (expanded deterministically by normalization).
- Layout (node positions): must be persistent for UX, and should participate in undo/redo and collaboration.
- “Patch validity”: users should never reach a broken/invalid patch state; if they can, it’s a bug (normalization + fast recompilation is expected to guarantee this).
- Patch persistence today: the live patch is the canonical state; the HCL patch DSL is generated from the live patch (two-way sync/translation exists).
- Canonical addresses and rename semantics: canonical addresses are intentionally not stable across renames (rename changes address); this is a feature (Terraform-style).
- Optional naming: consider an optional `label` field for user-facing renames that should not affect canonical addressing.
- Rename propagation: renaming a block instance must deterministically propagate through the patch; no cross-patch references are expected to block this.

**Open questions**
- For layout persistence, what is the preferred “standard” in this codebase’s ecosystem: a single persisted document (patch+layout) or a two-document model (patch + layout) keyed by stable IDs?
- Does V3 want canonical addresses to be the primary identity in commands/errors, with a separate stable ID for continuity/runtime state, or should canonical addresses also be the stable identity?

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
- Normalization placement: moving normalization under compiler frontend is contextually understandable; not a strong preference, but there’s suspicion the “normalization is part of compiler” gravity will recur.
- Diagnostic flag system: considered ad-hoc/weak; V3 should redesign from first principles. Reuse parts if helpful, but treat none of it as authoritative.
- Legacy `passes-v2`: not a V3 design concern. V3 won’t spec or port a “migration harness” for a new app; V2 keeps its own history.
- Events/diagnostics emission: event system is currently ad-hoc and lightly used; V3 likely needs a full redesign (keep whatever is useful).

**Open questions**
- Define reachability semantics:
- What counts as a “sink” (render blocks only, debug sinks, export sinks, etc.)?
- Is reachability applied per-output (multiple sinks) or via a single canonical sink?
- Define frontend vs backend behavior for unreachable blocks:
- Should frontend still normalize + type-check unreachable blocks for UI (recommended), while backend tree-shakes them out of lowering/scheduling?
- Do we want to preserve any unreachable-block diagnostics as non-blocking warnings (for discoverability) even if we don’t compile them?

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
- None recorded yet for runtime-specific V2/V3 intent (beyond the canonical spec baseline).

**Open questions**
- What is the authoritative runtime contract for determinism and replay in V2 today?
- Is “multiple program instances at once” (e.g., multiple patches running) a non-goal, or should we keep it open?
- For V3: should the session/program split remain the primary lifecycle boundary, or should it be replaced by a clearer “engine instance” object that owns all caches/pools?
- For continuity/state:
- Are stable `StateId`s conceptually separate from canonical addresses (recommended if addresses change on rename), and if so, what is the stable ID’s derivation rule?
