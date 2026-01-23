---
scope: full
spec_source: design-docs/CANONICAL-oscilla-v2.5-20260109/
impl_source: src/
generated: 2026-01-23T07:45:00Z
topics_audited: 8
topics_with_gaps: 8
totals: { done: 133, partial: 45, wrong: 15, missing: 38, na: 22 }
---

# Gap Analysis: Full Core Spec (Topics 01-06, 16, 17)

## Executive Summary

The core implementation is **substantially built** (133 DONE items) with a working compilation pipeline, three-layer runtime execution, and rendering. The biggest gaps are: (1) structural naming/typing divergences from spec terminology (Block.type vs .kind, flat CombineMode, extra BlockRole variants), (2) missing stateful primitives and MVP blocks (Lag, Phasor, SampleAndHold, Noise, Length, Normalize), and (3) runtime infrastructure gaps (event model, deterministic replay, structured errors). The renderer and coordinate spaces are well-aligned but missing the z-dimension, layer system, and topology numeric IDs.

**Recommended starting point**: Fix the quick correctness wins in Topic 17 (normalizedIndex N=1 bug, circleLayout clamp) and Topic 06 (topology registry to numeric IDs), then tackle the Block.type→kind rename and CombineMode structural fix as foundational cleanup.

## Work Queue

Topologically sorted at topic level, with work items listed per topic. A planner picks a specific work item and reads its section in the context file.

| Order | Topic | Work Items | Blocked By | Context File |
|-------|-------|------------|------------|--------------|
| 1 | 01 — Type System | WI-1: CombineMode discriminated union, WI-2: shape→shape2d rename, WI-3: Phase arithmetic enforcement, WI-4: isField/isSignal/isTrigger predicates, WI-5: InstanceRef branded types, WI-6: InstanceDecl in core, WI-7: DefaultSemantics<T>, WI-8: vec3/unit PayloadType | — | [context-01-type-system.md](./context-01-type-system.md) |
| 2 | 02 — Block System | WI-1: Block.type→kind rename, WI-2: BlockRole simplify, WI-3: DerivedBlockMeta fix, WI-4: Edge.role field, WI-5: PortBinding+CombineMode, WI-6: Lag, WI-7: Phasor, WI-8: SampleAndHold, WI-9: Noise, WI-10: Length/Normalize, WI-11: validateRoleInvariants, WI-12: Palette rail | Topic 01 (WI-1 CombineMode) | [context-02-block-system.md](./context-02-block-system.md) |
| 3 | 03 — Time System | WI-1: tMs monotonic enforcement, WI-2: Pulse fires every frame, WI-3: Phase continuity on speed change, WI-4: dt output port, WI-5: Phase type as distinct payload, WI-6: tMs type int vs float, WI-7: Rails as derived blocks, WI-8: PhaseToFloat/FloatToPhase, WI-9: Math.random lint rule | Topic 01 (phase type) | [context-03-time-system.md](./context-03-time-system.md) |
| 4 | 04 — Compilation | WI-1: DomainDecl in NormalizedPatch, WI-2: Anchor-based stable IDs, WI-3: Type propagation pass, WI-4: ReduceOp, WI-5: Hash-consing (I13), WI-6: Op-level IR (spec divergence), WI-7: Stride-aware buffers, WI-8: unit PayloadType, WI-9: Structured errors, WI-10: CacheKey, WI-11: Payload-specialized opcodes | Topic 01 (types), Topic 02 (blocks) | [context-04-compilation.md](./context-04-compilation.md) |
| 5 | 17 — Layout System | WI-1: normalizedIndex N=1 fix, WI-2: circleLayout phase radians, WI-3: circleLayout clamp | — | [context-17-layout-system.md](./context-17-layout-system.md) |
| 6 | 16 — Coordinate Spaces | WI-1: z coordinate (3D extension), WI-2: scale2 combination verification | Topic 06 (DrawPathInstancesOp) | [context-16-coordinate-spaces.md](./context-16-coordinate-spaces.md) |
| 7 | 05 — Runtime | WI-1: External input sampling, WI-2: Event system model, WI-3: RenderAssembler completeness, WI-4: Atomic hot-swap, WI-5: Deterministic replay, WI-6: Value traceability, WI-7: RuntimeError, WI-8: Cache invalidation, WI-9: Trace buffer, WI-10: Event ordering | Topic 04 (compilation) | [context-05-runtime.md](./context-05-runtime.md) |
| 8 | 06 — Renderer | WI-1: Topology numeric IDs, WI-2: DrawPathInstancesOp unification, WI-3: Layer system, WI-4: Culling, WI-5: Render diagnostics, WI-6: RenderError + fallback, WI-7: RenderBackend interface | Topic 05 (runtime) | [context-06-renderer.md](./context-06-renderer.md) |

Parallelizable (no cross-topic dependencies):

| Topic | Work Items | Context File |
|-------|------------|--------------|
| 17 — Layout System | WI-1: normalizedIndex fix, WI-3: circleLayout clamp | [context-17-layout-system.md](./context-17-layout-system.md) |
| 02 — Block System | WI-6-10: Stateful primitives + MVP blocks (additive) | [context-02-block-system.md](./context-02-block-system.md) |
| 06 — Renderer | WI-1: Topology numeric IDs (isolated refactor) | [context-06-renderer.md](./context-06-renderer.md) |

## Per-Topic Breakdown

### Topic 01: Type System
| DONE | PARTIAL | WRONG | MISSING | N/A |
|------|---------|-------|---------|-----|
| 18 | 5 | 3 | 4 | 3 |

**Key WRONG**: CombineMode flat string instead of discriminated union; `shape` vs `shape2d`; DEFAULTS_V0 structure.
**Key MISSING**: Phase arithmetic enforcement; isField/isSignal predicates; InstanceDecl in core.

### Topic 02: Block System
| DONE | PARTIAL | WRONG | MISSING | N/A |
|------|---------|-------|---------|-----|
| 22 | 7 | 3 | 8 | 3 |

**Key WRONG**: Block.type vs .kind; BlockRole extra variants; DerivedBlockMeta missing bus/rail.
**Key MISSING**: 3 stateful primitives (Lag, Phasor, SampleAndHold); 3 MVP blocks (Noise, Length, Normalize); Edge.role; PortBinding+CombineMode.

### Topic 03: Time System
| DONE | PARTIAL | WRONG | MISSING | N/A |
|------|---------|-------|---------|-----|
| 14 | 5 | 2 | 4 | 2 |

**Key WRONG**: Phase modeled as float+unit not distinct PayloadType; dt output missing.
**Key MISSING**: Rails as derived blocks; Phase arithmetic rules; PhaseToFloat helpers.

### Topic 04: Compilation
| DONE | PARTIAL | WRONG | MISSING | N/A |
|------|---------|-------|---------|-----|
| 22 | 8 | 3 | 6 | 3 |

**Key WRONG**: Expression trees vs Op-level IR (valid alternative but divergent); stride not in field allocation; unified ValueSlot lacks semantic labeling.
**Key MISSING**: Hash-consing (I13); ReduceOp; CacheKey; Loop lowering; unit PayloadType.

### Topic 05: Runtime
| DONE | PARTIAL | WRONG | MISSING | N/A |
|------|---------|-------|---------|-----|
| 22 | 8 | 2 | 7 | 3 |

**Key WRONG**: Float64Array vs Float32Array; event model (boolean flags vs EventPayload[]).
**Key MISSING**: Deterministic replay; Value traceability; RuntimeError; Atomic hot-swap; Trace buffer.

### Topic 06: Renderer
| DONE | PARTIAL | WRONG | MISSING | N/A |
|------|---------|-------|---------|-----|
| 12 | 7 | 2 | 7 | 5 |

**Key WRONG**: Topology registry uses Map<string> not array<number>; PathGeometryTemplate divergence.
**Key MISSING**: Layer system; Culling; Batching/sorting; RenderDiagnostics; RenderError; RenderBackend interface.

### Topic 16: Coordinate Spaces
| DONE | PARTIAL | WRONG | MISSING | N/A |
|------|---------|-------|---------|-----|
| 9 | 2 | 0 | 2 | 3 |

**Key MISSING**: z coordinate (3D world space); Camera projection.

### Topic 17: Layout System
| DONE | PARTIAL | WRONG | MISSING | N/A |
|------|---------|-------|---------|-----|
| 14 | 3 | 2 | 1 | 0 |

**Key WRONG**: normalizedIndex returns 0 for N=1 (should be 0.5); circleLayout phase treated as [0,1] not radians.
**Key MISSING**: circleLayout input clamping.

## Cross-Cutting Concerns

### Naming/Terminology
Many divergences are naming-only: Block.type→kind, shape→shape2d, DomainN→Primitive+Array. A coordinated rename pass would fix multiple WRONG items across topics 01-04.

### Phase Type Identity
The decision to model phase as `float + unit:phase01` rather than a distinct PayloadType propagates across Topics 01, 03, and 04. This is a coherent design choice but prevents mechanical enforcement of phase arithmetic rules (I22). Fixing this requires either: (a) adding `phase` to PayloadType and updating all phase-related code, or (b) documenting why the current approach is preferred and updating the spec.

### Event System
The boolean-flag event model (Topics 03, 05) is simpler than spec's EventPayload[] but prevents SampleAndHold (Topic 02) from working correctly. This is a systemic gap affecting multiple topics.

### Stride Awareness
Field buffer allocation (Topics 04, 05) doesn't account for multi-component PayloadTypes (vec2=2, color=4). State slots correctly handle stride, but value slots and field materialization don't. This causes the objects Map to be used for vec2/color instead of strided Float32Arrays.

### Spec vs Implementation Architecture Choices
Several WRONG items are valid architectural alternatives:
- Expression trees vs Op-level IR (Topic 04, WI-6) — expression trees are more flexible
- Float64 vs Float32 (Topic 05) — higher precision, no truncation bugs
- Stamp-based cache vs CacheKey (Topics 04, 05) — simpler, correct (just over-invalidates)

These should be evaluated for spec update rather than code change.
