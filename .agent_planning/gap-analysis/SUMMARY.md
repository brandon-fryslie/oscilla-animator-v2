---
scope: update
spec_source: design-docs/CANONICAL-oscilla-v2.5-20260109/
impl_source: src/
generated: 2026-01-24T21:30:00Z
previous_run: 2026-01-27T22:00:00Z
topics_audited: 19
totals: { trivial: 16, critical: 3, to-review: 23, unimplemented: 111, done: ~251 }
---

# Gap Analysis: Full Spec (All 19 Topics) — UPDATE

## Executive Summary

**First full-spectrum audit across all 19 spec topics.** Previous runs covered topics 01-06, 16-17 only.

Core pipeline (compilation, runtime, blocks, rendering) is mature with all prior P1/P2 resolved. The new findings are:

1. **3 new CRITICAL items** in Topic 18 (Camera/Projection): depth sort inverted, per-frame allocations, missing fast-path check — all in `RenderAssembler.ts`.
2. **Large unimplemented surface** in Topics 07-10 (Diagnostics/Observation/Debug UI) — expected, as these are T2/T3 UI features.
3. **Topic 11 (Continuity)** substantially implemented but architecturally different from spec (field-centric vs phase-centric).
4. **Topics 14-15 (UI specs)** largely unimplemented — current UI takes different approaches (ReactFlow graph, block-level matrix).
5. **Topics 18-19 (Camera/2.5D)** partially scaffolded (IR types exist) but kernel-level work needed.

## Changes Since Last Run

| Item | Was | Now | Reason |
|------|-----|-----|--------|
| Topics 07-15 | NOT AUDITED | AUDITED | First full-spectrum analysis |
| Topics 18-19 | NOT AUDITED | AUDITED | New spec topics |
| C-24 (depth sort) | CRITICAL | DONE | Fixed: comparator db-da (far-to-near), commit f8b0569 |
| C-25 (per-frame alloc) | CRITICAL | DEFERRED | Tracked as bead oscilla-animator-v2-la0 (P3) |
| C-26 (no fast-path) | CRITICAL | DONE | Added monotone check before sort, commit 988f967 |
| CameraDeclIR | N/A | DONE (type only) | commit d7d6119 |
| cameraProjection PayloadType | N/A | TO-REVIEW | Spec says Signal<int>, impl uses dedicated type |
| R-8 (expr trees vs op-IR) | TO-REVIEW | RESOLVED (spec update needed) | Code's DAG+schedule architecture aligns with deeper invariants; spec Scheduling subsection needs two-layer rewrite |

### Previously Resolved (unchanged from last run)
All C-1 through C-23 remain DONE. All U-4/U-5/U-6/U-8 remain DONE. C-12 remains deferred (blocked by U-21).

## Priority Work Queue

### P1: Critical — No Dependencies (start immediately)
| # | Item | Topic | Description | Context File |
|---|------|-------|-------------|--------------|
| 1 | C-24 | 18 Camera | Depth sort direction inverted (far-to-near required, near-to-far implemented) | [critical/topic-18](./critical/topic-18-camera-projection.md) |
| 2 | C-25 | 18 Camera | Per-frame Float32Array allocations in hot render loop | [critical/topic-18](./critical/topic-18-camera-projection.md) |
| 3 | C-26 | 18 Camera | Missing fast-path monotone check (sort always runs) | [critical/topic-18](./critical/topic-18-camera-projection.md) |

### P2: Critical — Has Dependencies (resolve blockers first)
| # | Item | Topic | Blocked By | Context File |
|---|------|-------|------------|--------------|
| 18 | C-12 | 06 Renderer | PathStyle missing blend/layer (needs U-21 layer system) | [critical/topic-06](./critical/topic-06-renderer.md) |

### P3: To-Review — User Must Decide
| # | Item | Topic | Question | File |
|---|------|-------|----------|------|
| 21 | R-2 | 01 Type | Keep Unit type system or revert to payload-only? | [to-review/topic-01](./to-review/topic-01-type-system.md) |
| 22 | R-6 | 05 Runtime | Float64 vs Float32 for scalars? | [to-review/topic-05](./to-review/topic-05-runtime.md) |
| 23 | R-7 | 05 Runtime | Stamp-based vs CacheKey caching? | [to-review/topic-05](./to-review/topic-05-runtime.md) |

| 25 | R-9 | 18 Camera | ProjectionOutputs has extra screenRadius field | [to-review/topic-18](./to-review/topic-18-camera-projection.md) |
| 26 | R-10 | 18 Camera | Ortho near default: spec=0.01, impl=-100.0 | [to-review/topic-18](./to-review/topic-18-camera-projection.md) |
| 27 | R-11 | 18 Camera | CameraDeclIR splits center vec2 into centerX/centerY scalars | [to-review/topic-18](./to-review/topic-18-camera-projection.md) |
| 28 | R-12 | 11 Continuity | Phase continuity architecture differs (field-centric vs phase-centric) | [to-review/topic-11](./to-review/topic-11-continuity-system.md) |
| 29 | R-13 | 12 Event Hub | 7 event types vs spec's 20+ (GraphCommitted aggregates) | [to-review/topic-12](./to-review/topic-12-event-hub.md) |
| 30 | R-14 | 14 Mod Table | Block-level matrix vs port-level modulation table | [to-review/topic-14](./to-review/topic-14-modulation-table-ui.md) |
| 31 | R-15 | 14 Mod Table | TableView is block list, not port-connection table | [to-review/topic-14](./to-review/topic-14-modulation-table-ui.md) |
| 32 | R-16 | 15 Graph UI | ELK layout vs selection-aware linear layout (T3) | [to-review/topic-15](./to-review/topic-15-graph-editor-ui.md) |

### P4: Unimplemented — Blocks Higher Priority
| # | Item | Topic | Unblocks | Context File |
|---|------|-------|----------|--------------|
| 19 | U-19 | 04 Compilation | Stride-aware buffers (blocks C-2) | [unimplemented/topic-04](./unimplemented/topic-04-compilation.md) |
| 20 | U-26 | 16 Coords | vec3 positions (blocks camera system) | [unimplemented/topic-16](./unimplemented/topic-16-coordinate-spaces.md) |

### P5: Unimplemented — Standalone (after P1-P4 resolved)

#### Topics 01-06, 16-17 (previously tracked — unchanged)
| # | Item | Topic | Description |
|---|------|-------|-------------|
| 21 | U-1 | 01 Type | Phase arithmetic enforcement |
| 22 | U-2 | 01 Type | InstanceDecl in core |
| 27 | U-7 | 02 Block | PortBinding with CombineMode |
| 30 | U-10 | 03 Time | Rails as derived blocks |
| 31 | U-11 | 03 Time | PhaseToFloat/FloatToPhase helpers |
| 32-54 | U-12..U-36 | Various | See previous SUMMARY for full list |

#### Topic 07: Diagnostics System (14 items)
| # | Item | Description |
|---|------|-------------|
| 55 | U-37 | DiagnosticCode enum with domain/severity taxonomy |
| 56 | U-38 | Diagnostic actions (insertBlock, addAdapter, etc.) |
| 57 | U-39 | Diagnostic payloads (signal values, NaN details) |
| 58 | U-40 | DiagnosticHub.mute() / isMuted() |
| | ... | 10 more items — see topic file |

#### Topic 08: Observation System (16 items)
All unimplemented — DebugGraph, DebugSnapshot, DebugTap, DebugService bus-centric observation model.

#### Topic 08b: Diagnostic Rules Engine (12 items)
All unimplemented — Rules A-H (NaN, silent bus, unbound port, last-write conflict, flatline, jitter, clipping, heavy materialization).

#### Topic 09: Debug UI (10 items)
All unimplemented — Probe mode, probe card, trace view, sparklines, one-click fixes.

#### Topic 10: Power-User Debugging (8 items)
All unimplemented — T3 post-MVP (TraceEvent, TraceRecorder, dependency graph, before/after diff).

#### Topic 13: Event-Diagnostics Integration (7 items)
Runtime diagnostic aggregation, expiry, structured snapshots, muting, authoring validators.

#### Topic 14: Modulation Table UI (10 items)
Port-level table, transform chains, cell states, edge creation, grouping, filtering, rails section.

#### Topic 15: Graph Editor UI (12 items — all T3)
Chain computation, pivot blocks, dimming, auto-layout, keyboard nav, visual states.

#### Topic 18: Camera & Projection (5 items)
Camera block definition, compiler enforcement, RenderAssembler camera resolution, positionXY/Z split, ortho params.

#### Topic 19: 2.5D Profile (7 items — all T3)
PatchProfile, patch metadata, constraints, compiler diagnostics, editor filtering, upgrade path.

### Trivial (cosmetic, no action unless cleanup pass)
- 16 items across topics 01-06 (unchanged from previous run)
- 1 item in topic 12 (CompileBegin/CompileEnd naming)

## Dependency Graph

```
C-24/25/26 (depth ordering) → no blockers, fix immediately
C-12 (PathStyle blend) → blocked by U-21 (layer system)

Topic 18 camera chain:
  C-24/25/26 (fix depth ordering) → standalone, immediate
  U-37 (positionXY/Z split) → enables Topic 19 (2.5D)
  U-38 (Camera block) → requires block lowering pass
  U-39 (ortho params) → extends ortho kernel

Topic 07-09 diagnostic chain:
  DiagnosticCode enum (U-37) → enables Rules Engine (Topic 08b) → enables Debug UI (Topic 09)
```

## Cross-Cutting Concerns

### Depth Ordering (NEW — P1 Critical)
The RenderAssembler sorts instances near-to-far (ascending depth). The spec requires far-to-near (descending depth, painter's algorithm). The Level 7 tests assert the wrong direction, meaning this is "tested in." Fixing requires updating sort comparator AND tests.

### Observation Architecture Divergence (Topic 08 — TO-REVIEW)
The spec describes a bus-centric observation model (DebugGraph with busNow/bindingNow). The implementation uses an edge/slot-based model (DebugService maps edges to runtime slots). This may be the correct approach given the actual wire-based (non-bus) architecture, but creates a fundamental spec divergence that should be explicitly resolved.

### Camera Infrastructure (Topics 18/19 — Partially Scaffolded)
CameraDeclIR type exists. renderGlobals field exists. cameraProjection PayloadType exists. But: no Camera block definition, no block lowering for camera, no compiler enforcement of 0-or-1 camera rule. The projection kernels (ortho, perspective) work correctly (32 tests pass).

### UI vs Spec (Topics 09, 14, 15 — Different Approaches)
The UI implementation takes pragmatic approaches different from spec:
- ReactFlow graph editor instead of linear auto-layout (Topic 15, T3)
- Block-level adjacency matrix instead of port-level modulation table (Topic 14)
- Edge-value tooltips instead of full probe mode (Topic 09)
These may be intentional UX decisions rather than gaps.

### Continuity System (Topic 11 — Substantially Done, Architecturally Different)
10 items DONE (gauge, slew, crossfade, policies, stable IDs, mapping). 6 items TO-REVIEW (phase gauge architecture differs from spec). 4 items UNIMPLEMENTED (wrapEvent, SIMD layouts, export, trace events).

### Event Hub (Topic 12 — Core Done, Scope Reduced)
Core mechanics work. 7 event types vs spec's 20+ — most granular events aggregated into GraphCommitted. This is likely a deliberate simplification.
