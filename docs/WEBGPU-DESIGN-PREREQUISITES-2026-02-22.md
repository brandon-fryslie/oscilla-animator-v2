# Oscilla WebGPU Design Prerequisites (Design-Readiness Gate)

Status: Draft  
Date: February 22, 2026  
Audience: Architecture, Compiler, Runtime, Renderer maintainers

## 1. Purpose

This document defines the required technical work that must be completed before architecture design begins for the next `arenaLayout`/GPU-native runtime interface.

This is a readiness specification, not an interface proposal.

// [LAW:verifiable-goals] Design-readiness requires machine-checkable completion gates, not subjective "mostly done" status.
// [LAW:one-source-of-truth] This document is the single checklist for design readiness across compiler/runtime/renderer.

## 2. Design-Readiness Definition

Architecture design can begin only when all prerequisite workstreams in this document are complete and all required proof artifacts exist.

At readiness, architects receive:
- One canonical runtime data model (no hybrid slot/object compatibility seams in hot path).
- One canonical addressing model for numeric data.
- One canonical memory packing policy for GPU-targeted payloads (SoA).
- One canonical execution model for scalar/field/state/gauge flow.
- Measured Chrome/Chromium behavior and performance baselines under those canonical models.

## 3. Mandatory Source Inputs Incorporated

This prerequisite spec incorporates required work from:
- `/Users/bmf/.codex/worktrees/804c/oscilla-animator-v2/design-docs/_new/renderer/12-webgpu-v3-migration.md`
- `/Users/bmf/.codex/worktrees/49f4/oscilla-animator-v2/docs/COMPILED-IR-HYBRID-MIGRATION-AUDIT-2026-02-22.md`

and additional mandatory items discovered in active code paths:
- `/Users/bmf/.codex/worktrees/804c/oscilla-animator-v2/src/compiler`
- `/Users/bmf/.codex/worktrees/804c/oscilla-animator-v2/src/runtime`
- `/Users/bmf/.codex/worktrees/804c/oscilla-animator-v2/src/render`

## 3.1 Hybrid Audit Coverage Map

All findings in `/Users/bmf/.codex/worktrees/49f4/oscilla-animator-v2/docs/COMPILED-IR-HYBRID-MIGRATION-AUDIT-2026-02-22.md` are covered by prerequisite workstreams here.

| Audit finding | Covered by |
| --- | --- |
| C1 (`slotMeta` runtime dependency) | W2, W12 |
| C2 (scalar/event shadow mode) | W6 |
| C3 (effects-as-data partial) | W5 |
| C4 (deprecated `IRBuilder` public surface) | W11 |
| C5 (renderer compatibility + TODO migration debt) | W9, W10 |
| B1 (`effects` optional in block contracts) | W5 |
| B2 (legacy `closed` coercion normalization) | W5, W11 |
| B3 (render-coupled output compatibility shim) | W9, W10 |
| B4 (`exposedAsPort` backward-compat defaults) | W11 |
| I1 (render output fake `slotMeta` entry) | W2 |
| I2 (`slotMeta` mutation escape hatch) | W2, W5 |
| I3 (deprecated outputs-array guards) | W11 |
| I4 (legacy bridge layer + deferred shape handling) | W8, W11 |
| I5 (frontend legacy compatibility type map) | W11 |
| I6 (IR type/index compatibility shims) | W11 |
| I7 (`allocSlot` unfinished stride metadata path) | W1, W5 |
| S1 (mixed scalar execution path: `evalOne` + scalar `materialize`) | W6, W13 |
| S2 (runtime state write fallback initialization paths) | W4, W6 |
| S3 (runtime compatibility flattening and legacy params) | W4, W11 |
| R1 (render assembler v1 compatibility markers) | W9 |
| R2 (zero-allocation migration incomplete) | W9 |
| R3 (arena API compatibility alias retained) | W9, W11 |
| Medium cleanup artifacts | W11, W12 |

## 4. Prerequisite Workstreams

## W1. Canonical Numeric Memory Model (f32 Ping-Pong Arena + SoA)

Required technical outcomes:
- Runtime canonical numeric store is full-arena ping-pong (`ArenaRead`, `ArenaWrite`, both `f32`).
- GPU-targeted payload packing is SoA for all field/vector payloads.
- AoS indexing formulas are eliminated from canonical numeric hot paths.
- Indirect draw command buffer remains AoS by API requirement only.

Closure surfaces:
- `src/runtime/ArenaValueStore.ts`
- `src/compiler/ir/storage-class.ts`
- `src/compiler/compile.ts`
- `src/runtime/ValueExprMaterializer.ts`
- `src/runtime/ContinuityApply.ts`
- `src/runtime/ScheduleExecutor.ts`

Completion proof:
- Static scan shows no hot-path use of `lane * stride + component` for GPU-targeted vector fields.
- Corpus execution parity on CPU path after SoA conversion.
- Benchmarks for large many-cardinality workloads with SoA layout.

// [LAW:dataflow-not-control-flow] Same frame pipeline must execute regardless of layout details; only address data changes.

## W2. Remove Runtime-Operational `slotMeta` Dependency

Required technical outcomes:
- Runtime execution no longer depends on `program.slotMeta` for operational reads/writes.
- `slotMeta` (if retained) is metadata-only and not a hot-path addressing dependency.
- Render output is no longer represented via temporary fake slot entry patterns.

Closure surfaces:
- `src/runtime/ExprAddressTable.ts`
- `src/runtime/ScheduleExecutor.ts`
- `src/runtime/executeFrameStepped.ts`
- `src/compiler/compile.ts`

Completion proof:
- CI static ban for `program.slotMeta` use in execution modules.
- Addressing is sourced from one canonical runtime address table only.
- Contract tests pass for scalar, field, continuity, render extraction.

// [LAW:single-enforcer] Address resolution must have one owning runtime boundary.

## W3. Remove Hot-Path Object References (`values.objects`) And Move To Numeric Handles

Required technical outcomes:
- `values.objects` is not used for compute/render hot-path data flow.
- Cross-stage references are numeric handles (`u32`) into arena/shape/topology banks.
- Shape and render references are represented by numeric handle banks, not JS object graphs.

Closure surfaces:
- `src/runtime/RenderAssembler.ts`
- `src/runtime/RuntimeState.ts`
- `src/runtime/ValueInspector.ts`
- `src/render/types.ts`

Completion proof:
- Static scan shows no render hot-path reads from `state.values.objects`.
- Render contract tests pass using numeric handle-backed data only.
- Debug/inspection path reads canonical banks or snapshot interfaces only.

// [LAW:one-source-of-truth] Runtime crossing data must have one representation: numeric handles.

## W4. Stateful Runtime f64 Eradication + Bounded Phase Time Semantics

Required technical outcomes:
- Stateful primitive runtime storage is no longer `Float64Array` in hot path.
- Unbounded time accumulation is removed from stateful oscillators/phasors.
- Bounded phase integration semantics are canonical (`phase = fract(phase + freq * dt)` family).

Closure surfaces:
- `src/runtime/RuntimeState.ts`
- `src/runtime/StateMigration.ts`
- stateful block lowering and execution paths (`phasor`, `lag`, `unit-delay`, related state write steps)

Completion proof:
- No `Float64Array` state path in production runtime for stateful primitives.
- Long-run stability tests (hours-scale equivalent simulation) show no phase jitter regressions.
- Hot-swap state migration tests pass with new state store representation.

## W5. Effects-As-Data Enforcement (No Fallback Binder Paths)

Required technical outcomes:
- Block lowering requires declarative effects for state/slot/step requirements.
- Binder fallback allocation/lookup paths are removed.
- Optional effects as migration mode is removed.

Closure surfaces:
- `src/blocks/registry.ts`
- `src/compiler/backend/binding-pass.ts`
- `src/compiler/ir/IRBuilderImpl.ts`

Completion proof:
- Compile fails with explicit diagnostics when required effects are absent.
- Static ban for fallback phrases/branches and fallback slot/state discovery paths.
- Deterministic compile hash for slot/state/effect plans over corpus.

// [LAW:dataflow-not-control-flow] Binding flow must not branch on "effects present vs fallback allocation."

## W6. Evaluator Unification (End Shadow-Mode Scalar/Event Paths)

Required technical outcomes:
- Exactly one scalar evaluator family in production execution.
- Exactly one event evaluator family in production execution.
- Duplicate legacy parity state surfaces removed.

Closure surfaces:
- `src/runtime/ValueExprScalarEvaluator.ts`
- `src/runtime/ValueExprEventEvaluator.ts`
- `src/runtime/RuntimeState.ts` (duplicate predicate buffers)

Completion proof:
- Runtime telemetry/trace shows one evaluator path only.
- Static ban for shadow-mode markers and duplicate parity buffers.
- Event/scalar contract suites pass across representative graph corpus.

## W7. Storage-Class Vocabulary And ABI Cleanup

Required technical outcomes:
- Legacy storage naming that implies `f64` operational semantics is retired from runtime hot path contracts.
- Canonical numeric ABI labels match actual runtime semantics.
- Helper assertions expecting `f64` storage in hot paths are replaced by canonical numeric ABI checks.

Closure surfaces:
- `src/runtime/ExprAddressTable.ts` (`assertF64Stride`)
- `src/runtime/ScheduleExecutor.ts`
- `src/runtime/executeFrameStepped.ts`
- `src/compiler/ir/storage-class.ts`

Completion proof:
- No hot-path assertion/function names tied to obsolete `f64` semantics.
- ABI tests validate canonical numeric class handling.

## W8. Shape Bank And Topology Bank Canonicalization (`u32`)

Required technical outcomes:
- Shape records are managed as canonical `u32` bank data with explicit ownership.
- Shape bank sizing/allocation is deterministic and compile-driven.
- Shape grouping/render prep no longer depends on compatibility object paths.

Closure surfaces:
- `src/runtime/RuntimeState.ts` (shape bank allocation wiring)
- `src/runtime/RenderAssembler.ts` (shape grouping and reads)
- shape-related compile/lowering paths

Completion proof:
- Shape bank size matches compiled shape slot requirements for all programs.
- Render assembly tests pass for per-instance and uniform shape flows.
- No missing/implicit shape bank allocation behavior at compile swap boundary.

## W9. Renderer Sink Finalization (No v1 Compatibility + Zero-Alloc Hot Path)

Required technical outcomes:
- v1 compatibility scaffolding removed from render assembly path.
- Per-frame render assembly allocation budget is explicit and enforced.
- Render pipeline consumes canonical runtime data model without bridge shims.

Closure surfaces:
- `src/runtime/RenderAssembler.ts`
- `src/render/RenderBufferArena.ts`
- `src/render/types.ts`

Completion proof:
- Static ban for v1 compatibility markers in render hot path modules.
- Allocation telemetry gate passes on stress demos.
- Render regression suite (geometry/topology/style/projection/depth ordering) passes.

## W10. WebGPU Execution Contract Pre-Design Baseline

Required technical outcomes:
- Runtime data contracts define three canonical GPU-facing categories:
  - Unified `f32` ping-pong arena
  - `u32` shape/topology handle bank
  - `u32` indirect draw command buffer
- CPU render submission path is documented as transitional until indirect path is canonical.
- No non-WebGPU fallback behavior exists.

Closure surfaces:
- `src/render/webgpu/WebGPURenderer.ts`
- `src/render/webgpu/shaders.ts`
- runtime-to-render boundary contracts

Completion proof:
- WebGPU-only startup checks enforced for Chrome/Chromium.
- Draw submission path acceptance tests for canonical buffers and command flow.
- Fallback renderer paths statically absent.

## W11. Public API Surface Cleanup (Deprecated Builder/Bridge Exports)

Required technical outcomes:
- Deprecated `IRBuilder` exports are removed from public entrypoints.
- Legacy bridge aliases and compatibility-only type exports are removed or quarantined.
- Compiler public API surface exposes only canonical builder contracts.

Closure surfaces:
- `src/compiler/ir/index.ts`
- `src/compiler/index.ts`
- `src/compiler/ir/bridges.ts`

Completion proof:
- API extraction test shows no deprecated builder symbols.
- Static import scan proves no production usage of deprecated symbols.

## W12. Direct-Index Bypass Removal (Addressing Must Go Through One Boundary)

Required technical outcomes:
- Runtime consumers do not directly index `program.arenaLayout` where canonical address table exists.
- Camera/debug/runtime consumers use one address abstraction.

Closure surfaces:
- `src/runtime/CameraResolver.ts`
- `src/services/DebugService.ts`
- any remaining direct `program.arenaLayout[...]` callsites

Completion proof:
- Static ban for direct arenaLayout indexing in runtime/service hot paths.
- Integration tests pass for camera resolution and debug querying through canonical addressing.

## W13. External Inputs, State, Gauge, And Continuity Segment Semantics

Required technical outcomes:
- External input injection semantics are fixed and deterministic under ping-pong arena model.
- State/gauge segment ownership and update order are fixed in one frame graph.
- Continuity mapping/apply semantics are validated against segment-based arena model.

Closure surfaces:
- `src/runtime/ScheduleExecutor.ts`
- `src/runtime/ContinuityApply.ts`
- `src/runtime/ContinuityMapping.ts`
- compile schedule construction paths

Completion proof:
- Deterministic replay tests for domain changes and continuity policies.
- Cross-frame consistency tests for external input + state/gauge writes.
- No topology-dependent branching in pass ordering.

## W14. CPU-First SoA Migration Completion Before GPU Interface Design

Required technical outcomes:
- Compiler emits SoA-ready numeric layout for GPU-targeted multi-component payloads.
- Runtime/materializer/continuity/renderer read-write logic is fully SoA-aligned on CPU path.
- Behavior parity is validated before WGSL kernel design begins.

Closure surfaces:
- compile layout emission, address tables, materializer, render assembly, continuity

Completion proof:
- Golden demo screenshot parity on CPU-executed path after SoA transition.
- Targeted tests for vec2/vec3/vec4/color field math under SoA.
- Benchmarks confirming no correctness regressions under dynamic instance counts.

## W15. Browser Matrix, Performance, And Proof Artifact Pipeline

Required technical outcomes:
- Chrome/Chromium latest conformance is validated for canonical pre-design runtime.
- CI publishes machine-readable proof artifacts for each prerequisite workstream.
- Design phase consumes proof artifacts, not narrative status.

Completion proof artifacts (required):
- `migration-proof/w1-memory-model.json`
- `migration-proof/w2-slotmeta-runtime-removal.json`
- `migration-proof/w3-handle-hotpath.json`
- `migration-proof/w4-state-f32-phase.json`
- `migration-proof/w5-effects-as-data.json`
- `migration-proof/w6-evaluator-unification.json`
- `migration-proof/w7-storage-abi-cleanup.json`
- `migration-proof/w8-shape-bank.json`
- `migration-proof/w9-renderer-sink.json`
- `migration-proof/w10-webgpu-contract.json`
- `migration-proof/w11-api-surface.json`
- `migration-proof/w12-address-bypass-ban.json`
- `migration-proof/w13-continuity-segments.json`
- `migration-proof/w14-cpu-soa-parity.json`
- `migration-proof/w15-browser-matrix-perf.json`
- `artifacts/webgpu-readiness.json` (computed canonical G1..G5 gate verdict)

// [LAW:verifiable-goals] All workstreams must emit mechanical evidence artifacts before design kickoff.

## 5. Cross-Workstream Sequencing Constraints

1. W5 and W6 must complete before W1/W14 finalization, to avoid reintroducing dual execution paths.
2. W2 and W7 must complete before any arena interface design review, to remove hybrid addressing semantics.
3. W3 and W8 must complete before renderer contract design, to eliminate object graph assumptions.
4. W4 and W13 must complete before state/gauge interface design, to lock bounded-time semantics.
5. W9 and W10 must complete before indirect draw interface design, to ensure renderer sink boundary is canonical.
6. W11 and W12 must complete before final architecture RFC drafting, to remove stale public/bypass surfaces.

## 6. Design Kickoff Input Package (What Architects Receive)

Architectural design starts only when the following inputs exist and are current:
- Canonical runtime data model spec (post-W1/W2/W3/W7/W8).
- Canonical execution graph spec (post-W5/W6/W13).
- Canonical state/continuity semantics spec with bounded-phase guarantees (post-W4/W13).
- Renderer sink and command submission contract spec (post-W9/W10).
- API surface map and ownership boundaries (post-W11/W12).
- Chrome/Chromium behavior/perf baseline bundle and proof artifacts (post-W15).

## 7. Completion Rule

This prerequisite program is complete only when every workstream has:
- Implemented technical outcomes.
- Passing gates in CI.
- Published proof artifact.
- Passing canonical readiness verdict (`pnpm run -s check:webgpu-readiness` => `overall: ready`).

At that point, the project is ready to begin interface design.
