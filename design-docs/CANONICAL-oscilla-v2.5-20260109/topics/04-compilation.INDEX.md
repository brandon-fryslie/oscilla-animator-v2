---
source_file: topics/04-compilation.md
source_hash: 1c774de2a943
tier: T1
date_generated: 2026-01-12
compression: 24%
---

# Index: Compilation Pipeline (04-compilation)

**Dense reference for contradictions, dependencies, decisions, and invariants.**

## Invariants & Constraints [L12-13]

| ID | Rule | Where |
|----|------|-------|
| **I6** | Compiler never mutates the graph | Immutable input contract |
| **I7** | Explicit cycle semantics | Tarjan SCC + validation |
| **I8** | Slot-addressed execution | Runtime indices, not names |
| **I9** | Schedule is data | Explicit Step[] structure |
| **I13** | Hash-consing identical subtrees | ExprId deduplication |
| **I14** | Cache keys explicit | CacheKey record for all caches |

## Pipeline Overview [L17-29]

```
RawGraph → GraphNormalization → NormalizedGraph → Compilation → CompiledProgramIR
```

**Core principles**: Immutable graph (I6), explicit structure post-normalization, runtime type erasure, schedule-as-data (I9).

## Representations [L65-163]

**RawGraph** [L69-76]: User-edited, may have unconnected inputs, implicit buses. **Authoritative user intent.**

**NormalizedGraph** [L78-96]: Fully explicit—all defaults/buses/wire-state become blocks+edges. **Compile input.**

**Anchor-Based IDs** [L104-119]: Structural artifacts keyed by attachment (e.g., `defaultSource:<blockId>:<portName>:<in|out>`) survive user edits.

**Port Structure** [L140-151]: `{ id, dir: PortDirection, type: SignalType, combine: CombineMode }`
**Combine on input port, not edge** [L163].

## Domain Declarations [L167-179]

Four shapes: `fixed_count(number)`, `grid_2d(width, height)`, `voices(maxVoices)`, `mesh_vertices(assetId)`.
Each compiles to dense lanes 0..N-1.

## Type System [L183-235]

**Five-axis**: GraphNorm assigns initial (mostly default); Compilation unifies, resolves, specializes, allocates, **erases from IR**.

**Unification** [L202-212]:
```
default + default → default
default + X → X
X + X → X
X + Y (X≠Y) → ERROR
```
Unification points: edges, multi-input ops, combine points.

**Resolution** [L219-234]: After unification, resolve AxisTag.default using DEFAULTS_V0, FRAME_V0.

## Cycle Detection & Validation [L238-261]

**Algorithm**: Tarjan's SCC.
**Requirement**: Every SCC must contain ≥1 stateful (UnitDelay, Lag, Phasor, SampleAndHold).
**Error**: `{ kind: 'invalid_cycle', cycle: NodeId[], suggestion }`

## Scheduling [L265-299]

**I9: Schedule is Data** [L267-278]. Explicit structure: `{ steps: Step[], stateSlots, fieldSlots, scalarSlots }`.

**7 Step Types** [L282-291]: eval_scalar, eval_field, eval_event, state_read, state_write, combine, render.

**Order** [L293-299]: read inputs → update time → topological eval → events → render.

## Slot Allocation [L303-329]

**I8: Slot-Addressed Execution** [L305]. Runtime uses indices.

**By Cardinality** [L316-323]:
- `zero` → inlined constant
- `one` → ScalarSlot
- `many(domain)` → FieldSlot

**State**: card=one → 1 cell; many(domain) → N(domain) cells.

## CompiledProgramIR [L332-397]

**Storage** [L336-343]: ScalarSlot, FieldSlot, EventSlot, StateSlot (numeric ids).

**Ops** [L347-377]:
- Scalar/field unary/binary (sin, cos, abs, clamp, negate; add, sub, mul, div, min, max)
- Broadcast/reduce (ReduceOp: min, max, sum, avg)
- State read/write, event read/write, render sink write

**Loop Lowering** [L379-397]: Field ops inside domain loops; bounds compile-time constants.

## Runtime Erasure [L401-414]

MVP constraints (5-10ms budget):
- ✗ Axis tags, referent ids, domain objects, perspective/branch
- ✓ Scalars, dense arrays, event buffers, compiled schedules

## Structural Sharing & Caching [L418-450]

**I13: Hash-Consing** [L420-431]: Identical FieldExpr/SignalExpr subtrees share ExprId → increased cache hits.

**I14: Cache Keys** [L439-450]: Explicit `{ time, domain, upstreamSlots, params, stateVersion }` expresses "stable vs dynamic."

## Error Handling [L459-484]

**Type Errors** [L461-469]: axis_mismatch, domain_mismatch, invalid_phase_op, unresolved_type.
**Graph Errors** [L471-478]: invalid_cycle, missing_input, invalid_edge.
**All include**: location (node/port/edge) + suggested fix.

## Polymorphism & Monomorphization [L488-522]

**Generic Blocks** [L490-513]: Generic over (World, Domain) with constraints (Typeclass, SameDomain, Promote).
**Monomorphization** [L516-521]: Each instance → concrete IR ops; type vars resolved at compile time; lowering by `(world, domain)`.

## Dependencies

- [01-type-system.md](./01-type-system.md) — Type definitions
- [02-block-system.md](./02-block-system.md) — Block structure
- [05-runtime.md](./05-runtime.md) — IR execution

## Key Decisions

1. **Immutable normalization**: Pure function, never mutated by compiler
2. **Explicit schedule**: First-class Step[] data structure
3. **Early type erasure**: Pre-runtime for 5-10ms budget
4. **Slot addressing**: Indexed, not named
5. **Monomorphic**: All specialization at compile time
6. **Anchor-stable IDs**: Survive user edits without thrashing
