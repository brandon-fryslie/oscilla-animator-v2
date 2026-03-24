# Oscilla v3 Migration Onboarding: Multipass Generic Renderer

## 0. Purpose

This document onboards AI coding agents to one specific migration increment: removing legacy, domain-specific rendering seams and establishing a stable, generic multipass renderer contract.

This is intentionally:

- **Migration-specific** (not a timeless architecture bible)
- **Directionally strict** (clear end-state constraints)
- **Implementation-flexible** (not tightly coupled to current file layouts)

`// [LAW:verifiable-goals] This doc defines machine-checkable completion criteria for the increment.`

---

## 1. True North (For This Migration)

Oscilla executes a JS-authored dataflow graph on a Rust WebGPU runtime.

- JS compiler owns scene semantics and layout planning.
- Rust runtime owns validated execution of the compiled plan.
- Runtime behavior is driven by data artifacts (manifest + pass roster), not hardcoded scene concepts.

`// [LAW:dataflow-not-control-flow] Variability is represented in compiled data, not ad hoc runtime branching by feature/domain type.`
`// [LAW:one-source-of-truth] Compiler artifacts are authoritative for layout and dispatch intent.`

---

## 2. Locked Architectural Decisions (Migration Baseline)

The following are considered fixed for this increment:

1. **Manifest-driven memory**
- Runtime allocates and binds buffers/textures from compiler-provided manifest and resource specs.
- Domain limits (`max_particles`, `max_shapes`) are migration seams, not architectural inputs for this path.
- Replacement authority is compiler-authored `MemoryManifestIR.resources[]` (including `cardinality`, `packing`, `resourceKind`, `textureWidth`, `textureHeight`, `textureFormat`).
- No runtime-only parallel descriptor system for the same allocations.

2. **Multipass execution roster**
- Program execution is an ordered list of compute passes with explicit resource usage.
- Compiler artifacts may request intermediate GPU resources used across pass chains (including ping-pong buffers/textures) and runtime must allocate/bind them from manifest data.
- Single monolithic "one compute_main for everything" is not the target.

3. **Domain-agnostic runtime**
- Runtime does not encode visual-domain assumptions ("particles", "shapes", etc.) to execute.
- Domain meaning is externalized to compiler outputs and shader logic.

4. **Integer routing at execution boundary**
- String-based sink routing is retired from hot execution paths.
- Runtime receives already-resolved integer routing maps.

`// [LAW:one-source-of-truth] No duplicate layout/routing truth in Rust and JS.`
`// [LAW:one-type-per-behavior] One generic execution model, configured by artifacts, not per-domain engine paths.`

---

## 3. Increment Contract (M1)

### 3.1 Objective

Deliver a **generic, manifest-driven multipass runtime path** that can execute current graph outputs without domain-specific allocation limits or string-based routing in the runtime hot path.

### 3.2 In Scope

1. Remove/retire domain-specific allocation ceilings in runtime memory planning (for this path), replacing them with byte/resource-exact requests derived from compiler-owned `MemoryManifestIR.resources[]`.
2. Route runtime pipeline/resource rebuild through manifest + pass roster path.
3. Replace runtime string routing in hot execution boundary with compiler-resolved integer routing payloads delivered through existing runtime ABI transports (shared sink table plane and/or typed rebuild payload fields), not new ad hoc JSON contracts.
4. Eliminate CPU-side derivations that duplicate compile-time-known values in this path.
5. Preserve existing behavior for supported graph fixtures via compatibility shims only at explicit boundary adapters.

`// [LAW:single-enforcer] Invariants are enforced at one runtime boundary, not repeated across callsites.`

### 3.3 Explicit Non-Goals (For M1)

1. Full renderer rewrite.
2. New visual features or new primitive families.
3. Redesign of node authoring UX.
4. Perfect elimination of all legacy codepaths in one PR.
5. Performance heroics beyond stated verification gates.

`// [LAW:locality-or-seam] Scope is bounded to seam removal needed for the new contract, not unrelated refactors.`

### 3.4 Required End-State Invariants

1. Runtime allocation/dispatch for this path is derived from manifest/pass artifacts.
2. Runtime does not require domain-specific max counters to execute this path.
3. Runtime hot path does not depend on string hashing for sink routing.
4. Rust CPU executes compiler-provided dispatch counts/offsets/slot mappings for this path and does not scan ShapeBank/sink-table payloads to discover those values.

### 3.5 Machine-Verifiable Done Criteria

M1 is complete when all conditions below pass in CI or deterministic local scripts:

1. **Contract tests pass** for manifest ingestion and pass-roster execution ordering.
2. **No runtime references in active path** to legacy domain caps (`max_particles`, `max_shapes`, or equivalents).
3. **No string routing in active path** at execution boundary (`SET_SINK_POINTER_MAP`/`HashMap<..., String>`-style lookup not required by hot frame execution path).
4. **Artifact-only dispatch values** are used for instance/offset/count inputs in active path (no CPU discovery loops over ShapeBank/sink descriptor payloads for these values).
5. **Frame execution smoke tests pass** for canonical fixtures with no validation errors.

`// [LAW:verifiable-goals] Completion is testable without asking humans to infer success manually.`

---

## 4. ABI Boundary and Validation Model

### 4.1 Ownership

- Compiler owns artifact correctness and semantic layout planning.
- Runtime owns artifact validation and safe execution.

### 4.2 Single Validation Boundary

Runtime performs a single ingress validation step per rebuilt program:

1. Buffer/texture ranges are in-bounds and non-overlapping where required.
2. Pass resource bindings match declared manifest resources.
3. Dispatch arguments are internally consistent with provided spans/strides.
4. ABI version/tag compatibility is accepted or rejected explicitly.
5. Any compatibility adapter (e.g., legacy sink routing transport) is applied only at this boundary, never inside per-frame hot loops.

After validation passes, runtime executes the roster without re-deriving semantic meaning.

`// [LAW:single-enforcer] Validate once at boundary; do not duplicate checks throughout execution.`
`// [LAW:one-way-deps] Runtime consumes compiler artifacts; it does not call back "up" for semantic interpretation.`

### 4.3 Failure Contract

- Invalid artifact -> deterministic rebuild/validation error with structured context.
- Runtime execution errors -> structured error path with pass index/resource identifiers.
- No silent fallback to legacy behavior in this path.

`// [LAW:errors] Explicit failure is required; no silent compatibility fallbacks.`

---

## 5. Legacy Seam Retirement Table

| Legacy Seam | Replacement in M1 | Removal Condition | Verification Signal |
|---|---|---|---|
| Domain caps (`max_particles`, `max_shapes`) in runtime allocation planning | Compiler `MemoryManifestIR.resources[]` drives byte/resource allocation | Active path no longer reads domain caps for allocation/dispatch | Static grep + contract tests |
| Hardcoded runtime visual descriptor offsets | Compiler-provided routing/layout tables | Runtime offset assumptions removed from active draw/dispatch prep | ABI tests over fixture artifacts |
| String-based sink routing at runtime boundary | Compiler-resolved integer routing words/arrays delivered via existing ABI transports (`sharedSinkTable` plane and/or typed rebuild payload fields) | Hot path has no string hash/routing lookup | Profiling + code scan |
| Legacy single-pass rebuild entrypoints | Multipass manifest-driven rebuild path | Active program rebuild flows through multipass API | Integration tests |
| CPU-side recomputation of compile-time-known counts/slots | Compiler-provided counts/offsets in artifact args | Runtime no longer parses ShapeBank/sink payloads to discover those values | Unit tests + fixture parity |

`// [LAW:one-source-of-truth] Each seam retirement removes duplicate representations of the same concept.`

---

## 6. Agent Operating Protocol (Required)

When implementing migration PRs, agents must follow these rules:

1. Do not introduce new domain-specific runtime limits/counters for execution planning.
2. Do not introduce new string-based routing in runtime hot paths.
3. Prefer adding fields to compiler artifacts over adding runtime-side derivation logic.
4. If a compatibility adapter is necessary, isolate it at one boundary and mark it for deletion.
5. Keep changes monotonic toward manifest-driven multipass execution; avoid partial side-systems.
6. Every migration PR must include/update tests proving behavior, not implementation detail.

`// [LAW:behavior-not-structure] Tests assert contract-level behavior.`
`// [LAW:no-mode-explosion] Avoid adding long-lived feature flags to support parallel architectures.`

---

## 7. Execution Sequence (Conceptual, Stable Across Refactors)

1. Graph compile produces program artifact.
2. Runtime validates artifact at ingress boundary.
3. Runtime allocates/reuses resources from manifest.
4. Runtime executes compute pass roster in order.
5. Runtime performs draw phase using prepared routing payloads.
6. Runtime surfaces structured diagnostics/errors.

This sequence is the stable migration contract; module/file names may evolve.

`// [LAW:dataflow-not-control-flow] The same stage order executes every frame/program invocation; variation is data values and pass content.`

---

## 8. Definition of "Workable Stable End Goal" for M1

M1 end goal is achieved when:

1. A single generic runtime path can execute existing canonical fixtures via manifest + multipass roster.
2. The major legacy seams listed in Section 5 are removed from active path.
3. The architecture can be extended by adding compiler artifacts/passes rather than runtime domain branches.

This is intentionally not "final architecture." It is the first stable plateau from which future improvements can proceed without reintroducing retired seams.

---

## 9. Reality Anchors (Current Path vs M1 Target)

These anchors keep migration work grounded in the current implementation while preserving abstraction over file churn.

1. **Current compile/runtime artifacts**
- Compiler emits `CompiledProgramIR` with canonical `memoryManifest`.
- Worker installs multipass pipelines through `REBUILD_GPU_PIPELINES`.
- Shared planes (`sharedInput`, `sharedShapeBank`, `sharedSinkTable`) are active runtime transports.

2. **Current known seams**
- Bootstrap/runtime still carries legacy `maxParticles`/`maxShapes` config.
- Sink descriptor routing still depends on `SET_SINK_POINTER_MAP` string payloads at install boundary.
- Runtime still derives some dispatch-related values by reading sink/shape payload planes.

3. **M1 target delta (strict)**
- Active path allocation/dispatch decisions come from compiler artifacts (manifest + pass payloads), not domain caps.
- Active hot path does not require string sink-pointer maps.
- Active path does not parse ShapeBank/sink payloads to discover compile-time-known counts/offsets.

`// [LAW:locality-or-seam] This section documents migration deltas without hard-coding specific module names as architecture requirements.`
