---
indexed: true
source: ./INVARIANTS.md
source_hash: 7f3e9c1a2b6d
source_mtime: 2026-01-09T00:00:00Z
original_tokens: ~750
index_tokens: ~160
compression: 79%
index_version: 1.0
---

# Index: System Invariants (INVARIANTS.md)

## Key Assertions
- Invariants are non-negotiable; violations indicate bugs [L8]
- No hidden behavior, no mode explosion, no incidental dependencies [L9]
- Time is foundation for determinism, phase, and replay [L15-50]
- Every concept has one authoritative representation [L6-8]
- Execution order, identity, and state must all be explicit [L372-378]

## Definitions
- **Invariant** (31 total): I1-I31, categorized by domain [L432-464]
- **I1**: Time is monotonic, unbounded, never wraps [L17-26]
- **I2**: Gauge Invariance: effective values continuous across discontinuities [L29-50]
- **I3**: State continuity with stable StateIds; migration rules on conflict [L54-66]
- **I4**: Deterministic event ordering across combine and scheduling [L69-78]
- **I5**: Single time authority per patch [L81-90]
- **I6**: Compiler never mutates graph [L95-104]
- **I7**: Explicit cycle semantics (detect, validate, schedule) [L107-119]
- **I8**: Slot-addressed execution (indices, no string lookups) [L122-131]
- **I9**: Schedule is data (inspectable, diffable, traceable) [L134-143]
- **I10**: Uniform transform semantics (table-driven, type-driven) [L146-159]
- **I11**: Stable element identity from domains [L164-172]
- **I12**: Lazy fields with explicit materialization [L175-185]
- **I13**: Structural sharing / hash-consing of identical expr trees [L188-197]
- **I14**: Explicit cache keys (time, domain, slots, params, state) [L200-209]
- **I15**: Renderer is sink only, zero creative logic [L214-223]
- **I16**: Real render IR (instances, geometry, materials, layering) [L226-235]
- **I17**: Planned batching (style/material keys, z/layer, blend) [L238-247]
- **I18**: Temporal stability (atomic swap, no flicker) [L250-259]
- **I19**: First-class error taxonomy (type, cycle, bus, materialization) [L264-277]
- **I20**: Traceability by stable IDs (NodeId, StepId, lens chain, BusId) [L280-289]
- **I21**: Deterministic replay (seed + inputs = identical output) [L292-301]
- **I22**: Safe modulation ranges (normalized domains, explicit units) [L306-315]
- **I23**: Separation of Patch vs Instance [L320-328]
- **I24**: Snapshot/transaction model for live edits [L332-341]
- **I25**: Asset system with stable IDs [L344-353]
- **I26**: Every input has a source (DefaultSource block) [L358-367]
- **I27**: Toy detector meta-rule (no UI order, object identity, incidental eval) [L370-378]
- **I28**: Diagnostic attribution to TargetRef [L382-391]
- **I29**: Error taxonomy by domain and severity [L394-403]
- **I30**: Continuity is deterministic (t_model_ms, seeded RNG) [L406-415]
- **I31**: Export matches playback (same schedule, continuity steps) [L418-427]

## Invariants
- **I1-I5** (Time, Continuity): Monotonic time, gauge invariance, state stability, deterministic ordering, single authority [L15-90]
- **I6-I14** (Graph, Fields): Compiler immutability, cycle semantics, slot addressing, schedule as data, explicit transforms, lazy evaluation, caching [L95-209]
- **I15-I18** (Rendering): Sink-only renderer, real IR, planned batching, atomic swap [L214-259]
- **I19-I21** (Debuggability): Error taxonomy, traceability, deterministic replay [L264-301]
- **I22-I25** (Scaling): Safe ranges, patch/instance split, transactions, assets [L306-353]
- **I26-I31** (Architecture): Input sources, toy detector, diagnostic attribution, error taxonomy, deterministic continuity, export parity [L358-427]

## Data Structures
- **Invariant** (rule + rationale + consequence + enforcement) [L6-50 pattern]
- **Invariant Table** (31 × 4 columns: ID, Category, Rule, Reference) [L432-464]

## Dependencies
- **Enforced by**: [01-type-system](./topics/01-type-system.md) (I22), [02-block-system](./topics/02-block-system.md) (I6, I26), [04-compilation](./topics/04-compilation.md) (I7-I9), [05-runtime](./topics/05-runtime.md) (I1-I5), [06-renderer](./topics/06-renderer.md) (I15-I18), [07-diagnostics-system](./topics/07-diagnostics-system.md) (I28, I29), [11-continuity-system](./topics/11-continuity-system.md) (I2, I30, I31)

## Decisions
- DECISION: 31 invariants organized by domain (Time, Graph, Render, Debug, Scale, Arch) [L15-427]
- DECISION: Gauge invariance as core principle for smooth editing/scrubbing/loops [L29-50]
- DECISION: Deterministic replay foundation for debugging/collaboration [L292-301]
- DECISION: Renderer as pure sink, all logic in patch [L214-223]
- DECISION: Export must match playback exactly (no "simplified" continuity) [L418-427]
- DECISION: Stable IDs for all entities (blocks, steps, assets, domains) [L280-289, L344-353]

## Tier Classification
- **Suggested**: T0 (Meta-tier, foundational constraint set)
- **Rationale**: Defines non-negotiable properties for the entire system; every other topic enforces subset of these invariants. Reading without this is impossible to evaluate correctness.
