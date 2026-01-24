---
scope: update
spec_source: design-docs/CANONICAL-oscilla-v2.5-20260109/
impl_source: src/
generated: 2026-01-24T19:00:00Z
previous_run: 2026-01-24T13:00:00Z
topics_audited: 8
totals: { trivial: 16, critical: 3, to-review: 4, unimplemented: 34, done: ~177 }
---

# Gap Analysis: Full Core Spec (Topics 01-06, 16, 17) — UPDATE

## Executive Summary

P1 critical items all resolved. P2 items C-2 (vec3), C-13 (rotation/scale2), and C-16 (runtime type dispatch) now also fixed. All layout kernels produce vec3 stride-3 output; BufferPool, Materializer, and RenderAssembler all handle vec3 correctly. All 1259 tests pass.

Remaining critical items (C-8, C-9, C-12) all have external dependencies and cannot be acted on yet. The `shape→shape2d` rename portion of C-2 is WON'T FIX (97 uses across 34 files, pure churn with no functional value).

**Next priority**: P2 critical items when their blockers resolve (C-8 needs event design, C-9 tracked as ms5 epic, C-12 needs layer system) and P3 user decisions (R-2, R-6, R-7, R-8).

## Changes Since Last Run

| Item | Was | Now | Reason |
|------|-----|-----|--------|
| C-2 vec3 additions | CRITICAL | DONE | All layout kernels produce vec3 stride-3; tests updated (commit 09e404f) |
| C-2 shape→shape2d | CRITICAL | WON'T FIX | 97 uses/34 files, pure churn, no functional value |
| kernel-signatures syntax | BROKEN | DONE | Fixed malformed makeVec2/makeVec3 entries (commit 09e404f) |
| .bak files | PRESENT | REMOVED | No longer needed (commit 46de4d5) |

### Previously Resolved (all in prior runs)
| C-7, C-14, C-15, C-17, C-18, C-20, C-21, C-22, C-23, C-1 | CRITICAL | DONE |
| C-3, C-19 | CRITICAL | N/A (no change needed) |
| BufferPool vec3, RenderAssembler stride | BUGGY | DONE |
| C-16 runtime type dispatch, C-13 rotation/scale2 | CRITICAL | DONE |

## Priority Work Queue

### P1: Critical — No Dependencies (ALL RESOLVED)

All P1 items fixed in commits 129c2e5..c3694de:
- C-7: normalizedIndex 0→0.5 ✅
- C-14: circleLayout input clamp ✅
- C-15: Nested Map cache keys ✅
- C-17: Edge role field ✅
- C-18: isStateful flag in BlockDef ✅
- C-20: Pulse fires every frame ✅
- C-21: tMs monotonicity enforced ✅
- C-22: dt output on TimeRoot ✅
- C-23: PAYLOAD_STRIDE + strideOf() ✅
- C-1: CombineMode expanded (mul/layer/or/and + category map) ✅
- C-3: Block.type is canonical (no rename needed) ✅
- C-19: tMs float is correct (sub-ms precision) ✅

### P2: Critical — Has Dependencies (resolve blockers first)
| # | Item | Topic | Blocked By | Context File |
|---|------|-------|------------|--------------|
| ~~13~~ | ~~C-2~~ | ~~01 Type~~ | ~~vec3 additions~~ ✅ | DONE (vec3 complete, shape→shape2d WON'T FIX) |
| 14 | C-8 | 05 Runtime | Design needed (EventPayload) | [critical/topic-05](./critical/topic-05-runtime.md) |
| 15 | C-9 | 06 Renderer | Migration path (ms5 epic) | [critical/topic-06](./critical/topic-06-renderer.md) |
| ~~16~~ | ~~C-10~~ | ~~17 Layout~~ | ~~Phase clamp~~ ✅ | R-5 resolved: phase01 is correct, no code change needed |
| ~~17~~ | ~~C-11~~ | ~~06 Renderer~~ | ~~PathVerb spec~~ ✅ | Code is canonical (internally consistent), spec needs update |
| 18 | C-12 | 06 Renderer | PathStyle missing blend/layer | [critical/topic-06](./critical/topic-06-renderer.md) |
| ~~19~~ | ~~C-13~~ | ~~06 Renderer~~ | ~~rotation/scale2 wired~~ ✅ | DONE (commit c7206be) |
| ~~20~~ | ~~C-16~~ | ~~05 Runtime~~ | ~~Pre-computed slot lookup~~ ✅ | DONE (commit 129ea87) |

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
| 29 | U-9 | 03 Time | ~~dt output port~~ (DONE via C-22) |
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
C-7 ✅  C-3 ✅  C-1 ✅ → unblocks U-7
C-13 ✅ (rotation/scale2 plumbed)  C-16 ✅ (slot lookup O(1))
C-2 ✅ (vec3 complete) → unblocks U-26 (vec3 positions) → unblocks U-27 (camera)

C-8 (event model) ──blocks──> U-6 (SampleAndHold)
C-9 (RenderPassIR) ──blocks──> U-21 (layers)
C-12 (PathStyle blend/layer) ──blocks──> nothing directly (cosmetic until layer system)
```

## Cross-Cutting Concerns

### Phase/Unit Representation (RESOLVED)
Spec updated: phase is float with unit:phase01. U-1 (phase arithmetic enforcement) now means unit-aware arithmetic on float(phase01). U-11 (PhaseToFloat/FloatToPhase helpers) no longer needed as separate type conversions.

### Block Role Architecture (RESOLVED)
Spec updated: BlockRole is minimum (implementations may extend). Bus/rail removed from DerivedBlockMeta. EdgeRole busTap removed.

### Render Pipeline Migration (C-9, ms5 epic)
The instances2d → DrawPathInstancesOp migration is tracked as a separate epic (oscilla-animator-v2-ms5 in beads). This is the largest structural change needed in the renderer.

### 3D World Model (U-26, U-27)
The 3D spec docs (design-docs/_new/3d/) define a comprehensive always-3D world model with orthographic default projection. Vec3 PayloadType and vec3 layouts are now complete (C-2 done). Remaining: vec3 positions in coordinate-space system (U-26), then camera/projection stage (U-27). These are now unblocked.

### Event Model Gap (C-8)
Editor-level events (EventHub) exist but runtime-level EventPayload[] does not. This blocks SampleAndHold and any data-carrying event semantics. Needs architectural design.
