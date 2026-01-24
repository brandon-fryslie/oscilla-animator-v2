---
scope: update
spec_source: design-docs/CANONICAL-oscilla-v2.5-20260109/
impl_source: src/
generated: 2026-01-24T12:00:00Z
previous_run: 2026-01-23T07:45:00Z
topics_audited: 8
totals: { trivial: 16, critical: 20, to-review: 5, unimplemented: 35, done: ~158 }
---

# Gap Analysis: Full Core Spec (Topics 01-06, 16, 17) — UPDATE

## Executive Summary

The core implementation remains substantially built (~158 DONE items) with a working pipeline. User decisions on R-1 (phase=float+unit), R-3 (remove bus/rail from spec), and R-4 (spec is minimum for BlockRole) have been resolved — spec updated accordingly. This resolved C-4, C-5, C-6, R-5, and simplified C-2. The biggest **actionable** gaps remain: (1) normalizedIndex N=1 bug (one-line fix), (2) Block.type→kind rename, (3) CombineMode structural fix, and (4) vec3 PayloadType (blocking 3D).

**Recommended starting point**: Fix C-7 (normalizedIndex, 1-line), then tackle C-3 (Block.type→kind rename), then C-1 (CombineMode).

## Changes Since Last Run

| Item | Was | Now | Reason |
|------|-----|-----|--------|
| EventHub infrastructure | UNIMPLEMENTED | DONE | Added in "Add basics of event blocks" commit — editor-level events working |
| TopologyId numeric IDs | WRONG (string registry) | DONE | Now uses numeric TopologyId throughout |
| Per-instance shape support | PARTIAL | DONE | "feat(runtime): Add per-instance shape support in RenderAssembler" |
| Render pipeline structure | Organization unclear | CRITICAL | Classified as C-9 — instances2d vs DrawPathInstancesOp |

## Priority Work Queue

### P1: Critical — No Dependencies (start immediately)
| # | Item | Topic | Description | Context File |
|---|------|-------|-------------|--------------|
| 1 | C-7 | 03 Time | normalizedIndex returns 0 for N=1, should be 0.5 | [context-17](./critical/context-17-layout-system.md) |
| 2 | C-14 | 17 Layout | circleLayout missing input clamp | [critical/topic-17](./critical/topic-17-layout-system.md) |
| 3 | C-15 | 05 Runtime | Materializer string cache keys (I8 violation) | [critical/topic-05](./critical/topic-05-runtime.md) |
| 4 | C-17 | 02 Block | Edge has no role field | [critical/topic-02](./critical/topic-02-block-system.md) |
| 5 | C-18 | 02 Block | SCC check uses string heuristic | [critical/topic-02](./critical/topic-02-block-system.md) |
| 6 | C-19 | 03 Time | tMs type is float, spec says int | [critical/topic-03](./critical/topic-03-time-system.md) |
| 7 | C-20 | 03 Time | Pulse fires on wrap only, not every frame | [critical/topic-03](./critical/topic-03-time-system.md) |
| 8 | C-21 | 03 Time | tMs monotonicity not enforced (I1) | [critical/topic-03](./critical/topic-03-time-system.md) |
| 9 | C-22 | 03 Time | dt output missing from TimeRoot | [critical/topic-03](./critical/topic-03-time-system.md) |
| 10 | C-23 | 01 Type | No stride table in type system | [critical/topic-01](./critical/topic-01-type-system.md) |
| 11 | C-3 | 02 Block | Block.type → Block.kind rename | [context-02](./critical/context-02-block-system.md) |
| 12 | C-1 | 01 Type | CombineMode discriminated union | [context-01](./critical/context-01-type-system.md) |

### P2: Critical — Has Dependencies (resolve blockers first)
| # | Item | Topic | Blocked By | Context File |
|---|------|-------|------------|--------------|
| 13 | C-2 | 01 Type | vec3/shape2d additions | [context-01](./critical/context-01-type-system.md) |
| 14 | C-8 | 05 Runtime | Design needed (EventPayload) | [critical/topic-05](./critical/topic-05-runtime.md) |
| 15 | C-9 | 06 Renderer | Migration path (ms5 epic) | [critical/topic-06](./critical/topic-06-renderer.md) |
| 16 | C-10 | 17 Layout | Phase clamp semantics | [context-17](./critical/context-17-layout-system.md) |
| 17 | C-11 | 06 Renderer | PathVerb spec reconciliation | [critical/topic-06](./critical/topic-06-renderer.md) |
| 18 | C-12 | 06 Renderer | PathStyle missing blend/layer | [critical/topic-06](./critical/topic-06-renderer.md) |
| 19 | C-13 | 06 Renderer | rotation/scale2 not wired through v2 | [critical/topic-06](./critical/topic-06-renderer.md) |
| 20 | C-16 | 05 Runtime | Runtime type dispatch per step | [critical/topic-05](./critical/topic-05-runtime.md) |

### P3: To-Review — User Must Decide
| # | Item | Topic | Question | File |
|---|------|-------|----------|------|
| 21 | R-2 | 01 Type | Keep Unit type system or revert to payload-only? | [to-review/topic-01](./to-review/topic-01-type-system.md) |
| 22 | R-6 | 05 Runtime | Float64 vs Float32 for scalars? | [to-review/topic-05](./to-review/topic-05-runtime.md) |
| 23 | R-7 | 05 Runtime | Stamp-based vs CacheKey caching? | [to-review/topic-05](./to-review/topic-05-runtime.md) |
| 24 | R-8 | 04 Compilation | Expression trees vs op-level IR? | [to-review/topic-04](./to-review/topic-04-compilation.md) |

### Resolved Reviews (spec updated)
- **R-1**: Phase is float+unit:phase01 (spec updated)
- **R-3**: Bus/rail removed from DerivedBlockMeta (spec updated)
- **R-4**: BlockRole spec is minimum, implementations may extend (spec updated)
- **R-5**: Phase is [0,1] via unit:phase01 (follows R-1)
- **C-4**: BlockRole extra variants — now valid per spec
- **C-5**: DerivedBlockMeta bus/rail — removed from spec
- **C-6**: EdgeRole busTap — removed from spec

### P4: Unimplemented — Blocks Higher Priority
| # | Item | Topic | Unblocks | Context File |
|---|------|-------|----------|--------------|
| 19 | U-19 | 04 Compilation | Stride-aware buffers (blocks C-2) | [unimplemented/topic-04](./unimplemented/topic-04-compilation.md) |
| 20 | U-26 | 16 Coords | vec3 positions (blocks camera system) | [unimplemented/topic-16](./unimplemented/topic-16-coordinate-spaces.md) |

### P5: Unimplemented — Standalone (after P1-P4 resolved)
| # | Item | Topic | Description |
|---|------|-------|-------------|
| 21 | U-1 | 01 Type | Phase arithmetic enforcement |
| 22 | U-2 | 01 Type | InstanceDecl in core |
| 23 | U-3 | 01 Type | DefaultSemantics<T> |
| 24 | U-4 | 02 Block | Lag stateful primitive |
| 25 | U-5 | 02 Block | Phasor stateful primitive |
| 26 | U-6 | 02 Block | SampleAndHold (needs C-8 event model) |
| 27 | U-7 | 02 Block | PortBinding with CombineMode |
| 28 | U-8 | 02 Block | Noise, Length, Normalize blocks |
| 29 | U-9 | 03 Time | dt output port |
| 30 | U-10 | 03 Time | Rails as derived blocks |
| 31 | U-11 | 03 Time | PhaseToFloat/FloatToPhase helpers |
| 32 | U-12 | 05 Runtime | Deterministic replay (I21) |
| 33 | U-13 | 05 Runtime | Atomic hot-swap |
| 34 | U-14 | 05 Runtime | Value traceability (I20) |
| 35 | U-15 | 05 Runtime | RuntimeError type |
| 36 | U-16 | 05 Runtime | External input sampling |
| 37 | U-17 | 04 Compilation | Hash-consing (I13) |
| 38 | U-18 | 04 Compilation | ReduceOp |
| 39 | U-20 | 04 Compilation | Structured compilation errors |
| 40 | U-21 | 06 Renderer | Layer system |
| 41 | U-22 | 06 Renderer | Culling |
| 42 | U-23 | 06 Renderer | RenderDiagnostics |
| 43 | U-24 | 06 Renderer | RenderError + fallback |
| 44 | U-25 | 06 Renderer | RenderBackend interface |
| 45 | U-27 | 16 Coords | Camera/projection system |
| 46 | U-28 | 06 Renderer | FillSpec/StrokeSpec discriminated unions |
| 47 | U-29 | 06 Renderer | Temporal stability mechanism (I18) |
| 48 | U-30 | 17 Layout | Spiral layout kernel |
| 49 | U-31 | 17 Layout | Random layout kernel |
| 50 | U-32 | 04 Compilation | DomainDecl in NormalizedGraph |
| 51 | U-33 | 04 Compilation | Explicit ScalarSlotDecl/FieldSlotDecl |
| 52 | U-34 | 04 Compilation | wireState/bus anchor IDs |
| 53 | U-35 | 05 Runtime | State migration compatible-layout transform |
| 54 | U-36 | 05 Runtime | Dense pre-allocated field storage |

### Trivial (cosmetic, no action unless cleanup pass)
- 2 items in trivial/topic-01-type-system.md (shape→shape2d rename, DEFAULTS_V0 structure)
- 5 items in trivial/topic-04-compilation.md (NormalizedGraph naming, step kinds, anchor format)
- 2 items in trivial/topic-05-runtime.md (Float64 vs Float32, flat state array)
- 6 items in trivial/topic-06-renderer.md (naming differences in future-types.ts)

## Dependency Graph

```
C-7 (P1, no deps) → standalone fix
C-3 (P1, no deps) → standalone rename
C-1 (P1, no deps) → blocks U-7

C-2 (vec3/shape2d) ──blocks──> U-26 (vec3) ──blocks──> U-27 (camera)
C-8 (event model) ──blocks──> U-6 (SampleAndHold)
C-9 (RenderPassIR) ──blocks──> U-21 (layers)
```

## Cross-Cutting Concerns

### Phase/Unit Representation (RESOLVED)
Spec updated: phase is float with unit:phase01. U-1 (phase arithmetic enforcement) now means unit-aware arithmetic on float(phase01). U-11 (PhaseToFloat/FloatToPhase helpers) no longer needed as separate type conversions.

### Block Role Architecture (RESOLVED)
Spec updated: BlockRole is minimum (implementations may extend). Bus/rail removed from DerivedBlockMeta. EdgeRole busTap removed.

### Render Pipeline Migration (C-9, ms5 epic)
The instances2d → DrawPathInstancesOp migration is tracked as a separate epic (oscilla-animator-v2-ms5 in beads). This is the largest structural change needed in the renderer.

### 3D World Model (U-26, U-27)
The 3D spec docs (design-docs/_new/3d/) define a comprehensive always-3D world model with orthographic default projection. This requires vec3 PayloadType first, then vec3 layouts, then camera/projection stage. Major effort but well-defined.

### Event Model Gap (C-8)
Editor-level events (EventHub) exist but runtime-level EventPayload[] does not. This blocks SampleAndHold and any data-carrying event semantics. Needs architectural design.
