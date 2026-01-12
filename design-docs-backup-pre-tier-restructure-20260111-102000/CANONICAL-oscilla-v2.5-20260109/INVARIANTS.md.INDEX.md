---
indexed: true
source: design-docs/CANONICAL-oscilla-v2.5-20260109/INVARIANTS.md
source_hash: 0880523bca2b
source_mtime: 2026-01-11T10:54:50Z
original_tokens: ~2461
index_tokens: ~625
compression: 25.4%
index_version: 1.0
---

# Index: INVARIANTS.md

## Key Assertions

- MUST: Time (`tMs`) never wraps, resets, or clamps—always increasing [L19]
- MUST: Effective values are continuous across discontinuities unless explicitly reset by user [L31]
- MUST: Cycles cross a memory boundary (stateful block) [L110-111]
- MUST: Names are for UI; runtime uses indices only [L124]
- MUST: Schedule is inspectable, diffable, traceable data [L136]
- MUST: Domains provide stable element IDs, not "array indices we hope stay stable" [L166]
- MUST: Renderer accepts render commands only—zero creative logic [L216]
- MUST: Export uses exact same schedule and continuity steps as live playback [L420]
- SHALL: All continuity operations use `t_model_ms` and deterministic algorithms [L408]
- REQUIRED: State migration with stable StateIds for all stateful blocks [L56-59]
- REQUIRED: Transform table-driven with type rules (scalar→scalar, signal→signal, field→field) [L148-152]
- REQUIRED: Every cache depends on: (time, domain, upstream slots, params, state version) [L202]
- REQUIRED: Identical FieldExpr/SignalExpr subtrees share an ExprId [L190]
- REQUIRED: Every input has DefaultSource connected during GraphNormalization [L360]
- REQUIRED: Every diagnostic must be attributable to graph element via TargetRef [L384]

## Definitions

- **TimeRoot** [L25]
- **Gauge layers** [L31]
- **NormalizedGraph** [L99]
- **StateId** [L56]
- **CompiledProgramIR** [L130]
- **Schedule IR** [L142]
- **Domain** [L172]
- **FieldExpr** / **SignalExpr** [L190]
- **ExprId** [L190]
- **Render IR** [L228]
- **TargetRef** [L384]
- **DiagnosticCode** [L402]
- **StepContinuityApply** [L426]
- **PatchRevision** [L294]

## Invariants (All 31 Rules)

### Category A: Time, Continuity, Edit-Safety

- **I1 - Time is Monotonic and Unbounded**: `tMs` never wraps, resets, or clamps. Time always increasing. Required for deterministic phase calculations and replay. Violation causes phase discontinuities and non-deterministic behavior. Enforced by runtime assertion and TimeRoot implementation. [L17-25]

- **I2 - Gauge Invariance (Transport Continuity)**: Effective values (phase, parameters, fields) continuous across discontinuities unless explicitly reset. For all observables `x_eff(t)`: continuity preserved even when `x_base(t)` jumps due to scrubbing, looping, hot-swap, topology changes. Without this: scrubbing breaks animation, loops pop, edits jarring, export diverges, system feels mechanical. Enforced by Continuity System (topic 11), phase offset in timeDerive, value reconciliation and field projection at hot-swap. [L29-50]

- **I3 - State Continuity with Stable IDs**: Stateful blocks have stable StateIds. Migration: Same StateId + same type/layout → copy; Same StateId + compatible layout → transform; Else → reset + diagnostic. Without this: no determinism, debugging, or Rust port. Enforced by state migration system. [L54-65]

- **I4 - Deterministic Event Ordering**: Events need stable ordering across combine and within-frame scheduling. "Sometimes it triggers, sometimes not" kills performance contexts. Enforced by explicit ordering in scheduler; writer order is stable. [L69-77]

- **I5 - Single Time Authority**: One authority produces time; everything else derives. Without this: "player loops" compete with patch loops, unexplained jumps on bar boundaries. Enforced by single TimeRoot per patch. [L81-89]

### Category B: Graph Semantics

- **I6 - Compiler Never Mutates the Graph**: No blocks or edges inserted during compilation. Compiler consumes fully explicit NormalizedGraph immutably. Violation hides behavior, makes debugging impossible. Enforced by type signature. [L95-103]

- **I7 - Explicit Cycle Semantics**: Cycles must be detected structurally (Tarjan's SCC), validated (crosses stateful boundary), scheduled deterministically. Otherwise any "cool" patch becomes random bug generator. Non-deterministic feedback behavior results from violation. Enforced by cycle validation in compiler. [L107-118]

- **I8 - Slot-Addressed Execution**: Names are for UI; runtime uses indices. No string lookups, closures, or object graphs in hot loops. Required for performance targets and Rust port. Violation means missing perf targets and Rust misery. Enforced by CompiledProgramIR using slot indices only. [L122-130]

- **I9 - Schedule is Data**: No hidden evaluation. Schedule is inspectable, diffable, traceable data. If runtime behavior lives in incidental traversal order, debugging impossible. Non-reproducible behavior from violation. Enforced by explicit Schedule IR data structure. [L134-142]

- **I10 - Uniform Transform Semantics**: Transforms are table-driven and type-driven: Scalar transforms → scalars; Signal transforms → signal plans; Field transforms → field expr nodes; Reductions (field→signal) explicit and diagnosable. If transforms are "whatever each block does," can't reason about patches. Unpredictable type behavior from violation. Enforced by Transform registry with type rules. [L146-158]

### Category C: Fields, Identity, Performance

- **I11 - Stable Element Identity**: Domains provide stable element IDs, not "array indices we hope stay stable." Required for temporal effects, physics, per-element state, selection UI, caches. Can't do trails, history, physics, or coherent UI without this. Enforced by domain as first-class identity handle. [L164-172]

- **I12 - Lazy Fields with Explicit Materialization**: Materialization must be scheduled, cached, and attributable. If every field becomes array "because it's easiest," hit a wall. Memory and performance explosion from violation. Enforced by explicit materialization points and field expr DAGs. [L176-184]

- **I13 - Structural Sharing / Hash-Consing**: Identical FieldExpr/SignalExpr subtrees share an ExprId. Without canonicalization, compilation and runtime explode. Duplicate computation and memory bloat from violation. Enforced by hash-consing in expr construction. [L188-196]

- **I14 - Explicit Cache Keys**: Every cache depends on: (time, domain, upstream slots, params, state version). Without explicit keys, oscillate between "slow" and "wrong." Stale caches or cache misses everywhere from violation. Enforced by cache key model in compilation. [L200-208]

### Category D: Rendering

- **I15 - Renderer is a Sink, Not an Engine**: Renderer accepts render commands/instances, batches, sorts, culls, rasterizes. Zero "creative logic." All motion/layout/color comes from patch. Violation turns renderer into second patch system. Enforced by Render IR and no "radius/wobble/spiral mode" in renderer. [L214-222]

- **I16 - Real Render IR**: Generic render intermediate with instances, geometry assets, materials, layering. Otherwise every new visual idea requires new renderer code. Renderer becomes feature bottleneck from violation. Enforced by Render IR specification. [L226-234]

- **I17 - Planned Batching**: Render output contains enough info to batch deterministically. Canvas/WebGL performance requires minimizing state changes and draw calls. CPU-bound rendering from violation. Enforced by style/material keys, z/layer, blend in render commands. [L238-246]

- **I18 - Temporal Stability in Rendering**: Old program renders until new program ready. Swap atomic. No flicker. Otherwise live editing feels like "glitching a web demo." Enforced by atomic swap and render continuity. [L250-258]

### Category E: Debuggability

- **I19 - First-Class Error Taxonomy**: Errors include type mismatch (from/to, suggested adapters), cycle illegal (show loop and missing memory edge), bus conflict (publishers + combine semantics), forced materialization (culprit sink and expr chain). Vague errors mean only programmers can use it. Enforced by error types in compiler output. [L264-276]

- **I20 - Traceability by Stable IDs**: Every value attributable: produced by NodeId/StepId, transformed by lens chain, combined on BusId, materialized due to SinkId. Must answer "why is this 0?" quickly. Without this: feels like a toy. Enforced by structural instrumentation with stable IDs. [L280-288]

- **I21 - Deterministic Replay**: Given PatchRevision + Seed + inputs, output identical. Foundation for bug reports, performance tuning, collaboration, server authority. Can't reproduce issues from violation. Enforced by no Math.random(); seeded randomness only. [L292-300]

### Category F: Live Performance

- **I22 - Safe Modulation Ranges**: Normalized domains (0..1, phase 0..1, timeMs), explicit unit tags where critical. Otherwise patches become fragile "magic numbers." Patches can't be reused from violation. Enforced by unit discipline in type system. [L306-314]

### Category G: Scaling

- **I23 - Separation of Patch vs Instance**: Patch is a spec. Runtime instance has: time state, state cells, caches, inputs, render target. Can't scale beyond single browser tab from violation. Enforced by Patch/Instance separation in architecture. [L320-328]

- **I24 - Snapshot/Transaction Model**: Live edits are transactional. Required for multi-client sync and trustworthy undo/redo. Desync and broken undo from violation. Enforced by transaction-based edit model. [L332-340]

- **I25 - Asset System with Stable IDs**: Assets (geometry, fonts, SVGs) have stable IDs. Required for collaboration and deployment. "Whatever the client has loaded" breaks collaboration from violation. Enforced by asset registry with IDs. [L344-352]

### Category H: Architecture Laws

- **I26 - Every Input Has a Source**: DefaultSource block ALWAYS connected during GraphNormalization. Combine modes require exactly one aggregated value per frame. Undefined input behavior from violation. Enforced by GraphNormalization invariant. [L358-366]

- **I27 - The Toy Detector Meta-Rule**: If behavior depends on UI order, object identity, or incidental evaluation order—it's a toy. Execution order, identity, state, transforms, time topology must all be explicit. Non-deterministic, non-portable system from violation. Enforced by entire invariant set. [L370-378]

- **I28 - Diagnostic Attribution**: Every diagnostic must be attributable to specific graph element via TargetRef. Diagnostics must be navigable and fixable. Users cannot locate/fix problem from violation. Enforced by TargetRef in Diagnostic type and compiler validation. [L382-390]

- **I29 - Error Taxonomy**: Errors categorized by domain (compile/runtime/authoring/perf) and severity (fatal/error/warn/info/hint). Different error streams require different UI treatment and urgency. UI cannot prioritize, users miss critical issues from violation. Enforced by DiagnosticCode enumeration and severity assignment. [L394-402]

- **I30 - Continuity is Deterministic**: All continuity operations (phase offset, value reconciliation, field projection, slew) use `t_model_ms` and deterministic algorithms. Given same inputs, continuity produces identical outputs. Export drifts from playback, debugging impossible, profiling meaningless from violation. Enforced by Continuity System using only `t_model_ms`, seeded RNGs, deterministic mapping. [L406-414]

- **I31 - Export Matches Playback (Continuity Parity)**: Export uses exact same schedule, continuity steps, and policies as live playback. No "simplified" or "optimized" continuity for export. "It looks different when I export"—deal-breaker from violation. Enforced by Export loop executing same `StepContinuityApply` steps as live runtime. [L418-426]

## Data Structures

- **NormalizedGraph** (immutable input to compiler) [L99]
- **CompiledProgramIR** (slot-indexed execution) [L130]
- **Schedule IR** (explicit data, no hidden evaluation) [L142]
- **Transform Registry** (table-driven type rules) [L158]
- **FieldExpr** / **SignalExpr** (with structural sharing via ExprId) [L190]
- **Render IR** (instances, geometry, materials, layering) [L228]
- **Diagnostic** (with TargetRef, DiagnosticCode, severity) [L384, L402]
- **StepContinuityApply** (deterministic continuity operations) [L426]
- **Patch** / **Instance** (separated spec from runtime state) [L322]
- **Asset Registry** (stable IDs for geometry, fonts, SVGs) [L352]

## Dependencies

- **Depends on**: [11-continuity-system](./topics/11-continuity-system.md) for I2; [01-type-system](./topics/01-type-system.md) for I22; [02-block-system](./topics/02-block-system.md) for I6, I26; [04-compilation](./topics/04-compilation.md) for I7-I9; [05-runtime](./topics/05-runtime.md) for I1-I5; [06-renderer](./topics/06-renderer.md) for I15-I18

- **Referenced by**: All implementation topics must conform to these 31 rules

## Decisions

- DECISION: Time is represented as `tMs` (milliseconds), never wrapping [L19]
- DECISION: Gauge layer enforces continuity across discontinuities [L31]
- DECISION: Cycles require crossing a stateful boundary (Tarjan's SCC validation) [L110]
- DECISION: Runtime uses slot indices, not name-based lookups [L124]
- DECISION: Schedule is data, not incidental traversal order [L136]
- DECISION: Export must use identical continuity as live playback [L420]

## Tier Classification

- **Suggested**: T1 (Foundational)
- **Rationale**: These 31 invariants form the non-negotiable foundation of the system. Every other specification, architectural decision, and implementation must conform to these rules. Violations are categorized as bugs, not edge cases. Invariants span time semantics, graph structure, rendering, debugging, scaling, and performance—the core constraints that make the system deterministic, debuggable, and professional-grade.
