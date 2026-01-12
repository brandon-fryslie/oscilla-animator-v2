---
title: INVARIANTS Index
source: INVARIANTS.md
source_hash: 0880523bca2b
tier: T1
type: specification
category: foundational
generated: 2026-01-12
---

# INVARIANTS.md Index

## Overview

This document indexes the foundational system invariants that govern all Oscilla v2.5 design and implementation. These are non-negotiable rules whose violation indicates a bug, not an edge case.

**Source:** `INVARIANTS.md`
**Tier:** T1 (Foundational)
**Status:** Active
**Last Updated:** 2026-01-12

---

## Key Assertions

1. **Invariants are not suggestions** - They are structural rules enforced through type system, compiler, and runtime checks.

2. **31 invariants span 8 domains** - Time/Continuity, Graph Semantics, Fields/Identity/Performance, Rendering, Debuggability, Live Performance, Scaling, and Architecture Laws.

3. **Violation indicates bug, not edge case** - If behavior depends on order, identity, or incidental traversal, the system is a toy (I27).

4. **Every observable has traceability** - Values must be attributable to source blocks via stable IDs (I20, I28).

5. **Continuity is deterministic** - Export must match playback exactly; non-deterministic continuity breaks debugging (I30, I31).

6. **Single authorities throughout** - One TimeRoot, one compiler, one scheduler, one error taxonomy; no competing implementations.

---

## Definitions

### Core Concepts

- **Gauge Invariance**: Effective values remain continuous across discontinuities (scrubbing, looping, edits) via phase offsets and value reconciliation (I2)

- **StateId**: Stable identifier for stateful blocks enabling deterministic state migration (I3)

- **NormalizedGraph**: Fully explicit, immutable graph representation consumed by compiler; never mutated during compilation (I6)

- **Slot-Addressed Execution**: Runtime uses indices not names; no string lookups or object graph traversals in hot loops (I8)

- **ExprId**: Canonicalized identifier for identical FieldExpr/SignalExpr subtrees enabling structural sharing (I13)

- **Render IR**: Generic intermediate representation with instances, geometry, materials, layering - zero creative logic in renderer (I15, I16)

- **TargetRef**: Attribution mechanism linking every diagnostic to a specific graph element (I28)

- **Cache Key**: (time, domain, upstream slots, params, state version) tuple determining cache validity (I14)

### Temporal Concepts

- **tMs**: Monotonic time in milliseconds; never wraps, resets, or clamps (I1)

- **t_model_ms**: The deterministic time used in all continuity operations and export (I30, I31)

- **Phase Offset**: Gauge layer absorbing time discontinuities to preserve continuity (I2)

- **TimeRoot**: Single authority producing time; all others derive (I5)

---

## Invariants by Domain

### A. Time, Continuity, and Edit-Safety (I1–I5)

| ID | Rule | Mechanism |
|----|------|-----------|
| **I1** | Time is monotonic and unbounded | Runtime assertion in TimeRoot |
| **I2** | Gauge invariance: effective values continuous across discontinuities | Continuity System: phase offset, value reconciliation, field projection |
| **I3** | Stable StateIds with deterministic migration | State migration with diagnostics |
| **I4** | Deterministic event ordering | Explicit scheduler ordering; writer order stable |
| **I5** | Single time authority | One TimeRoot per patch |

**Critical**: These ensure replay, determinism, and live editing usability.

### B. Graph Semantics (I6–I10)

| ID | Rule | Mechanism |
|----|------|-----------|
| **I6** | Compiler never mutates graph | Type signature; NormalizedGraph is immutable |
| **I7** | Cycles validated at memory boundaries | Tarjan SCC detection + scheduler validation |
| **I8** | Slot-addressed execution | CompiledProgramIR uses indices only |
| **I9** | Schedule is data | Explicit Schedule IR structure |
| **I10** | Uniform transform semantics | Table-driven, type-driven transforms |

**Critical**: These enable compilation safety, performance targets, and Rust portability.

### C. Fields, Identity, and Performance (I11–I14)

| ID | Rule | Mechanism |
|----|------|-----------|
| **I11** | Stable element identity | Domain provides IDs, not array indices |
| **I12** | Lazy fields with explicit materialization | Scheduled, cached, attributable materialization points |
| **I13** | Structural sharing / hash-consing | ExprId canonicalization during expr construction |
| **I14** | Explicit cache keys | (time, domain, slots, params, state_version) tuple |

**Critical**: These prevent memory/performance cliffs and enable per-element effects.

### D. Rendering (I15–I18)

| ID | Rule | Mechanism |
|----|------|-----------|
| **I15** | Renderer is sink, not engine | Render IR; zero creative logic in renderer |
| **I16** | Real render IR | Generic with instances, geometry, materials, layering |
| **I17** | Planned batching | Style/material keys, z/layer, blend in render commands |
| **I18** | Temporal stability (atomic swap) | Old program renders until new ready; atomic swap; no flicker |

**Critical**: These decouple motion/layout from rendering and enable live editing.

### E. Debuggability (I19–I21)

| ID | Rule | Mechanism |
|----|------|-----------|
| **I19** | First-class error taxonomy | Type mismatch, cycle illegal, bus conflict, forced materialization |
| **I20** | Traceability by stable IDs | Every value attributable via NodeId/StepId/BusId/SinkId |
| **I21** | Deterministic replay | No Math.random(); seeded randomness only |

**Critical**: These make the system usable for non-programmers and enable bug reproduction.

### F. Live Performance (I22)

| ID | Rule | Mechanism |
|----|------|-----------|
| **I22** | Safe modulation ranges | Normalized domains (0..1, phase 0..1); explicit unit tags |

**Critical**: Enables reusable patches without magic numbers.

### G. Scaling (I23–I25)

| ID | Rule | Mechanism |
|----|------|-----------|
| **I23** | Patch vs instance separation | Patch is spec; instance has time state, cells, caches, inputs, target |
| **I24** | Snapshot/transaction model | Transactional live edits |
| **I25** | Asset system with stable IDs | Asset registry with IDs |

**Critical**: These enable multi-client sync and server-authoritative architectures.

### H. Architecture Laws (I26–I31)

| ID | Rule | Mechanism |
|----|------|-----------|
| **I26** | Every input has a source | DefaultSource always connected during normalization |
| **I27** | Toy detector meta-rule | Execution order, identity, state, transforms, time topology all explicit |
| **I28** | Diagnostic attribution | Every diagnostic has TargetRef to graph element |
| **I29** | Error taxonomy | Errors categorized by domain (compile/runtime/authoring/perf) and severity |
| **I30** | Continuity is deterministic | All continuity uses t_model_ms and deterministic algorithms |
| **I31** | Export matches playback | Export uses same schedule and continuity steps as live playback |

**Critical**: These are the meta-rules preventing the system from becoming unmaintainable.

---

## Data Structures

### Primary Structures

| Structure | Purpose | Enforces | Location |
|-----------|---------|----------|----------|
| **NormalizedGraph** | Explicit, immutable input to compiler | I6 (no mutation) | 02-block-system.md |
| **CompiledProgramIR** | Slot-indexed execution representation | I8 (no string lookups) | 04-compilation.md |
| **Schedule** | Inspectable, diffable execution plan | I9 (schedule is data) | 04-compilation.md |
| **ExprId** | Canonicalized field/signal expr identity | I13 (structural sharing) | 03-signals-fields.md |
| **RenderIR** | Generic render commands with batching info | I15-I17 (renderer as sink) | 06-renderer.md |
| **TargetRef** | Attribution of diagnostic to graph element | I28 (diagnostic attribution) | 08-diagnostics.md |
| **Diagnostic** | Domain/severity categorized error | I19, I29 (error taxonomy) | 08-diagnostics.md |
| **StateId** | Stable block state identifier | I3 (state continuity) | 05-runtime.md |
| **CacheKey** | (time, domain, slots, params, version) | I14 (explicit cache keys) | 05-runtime.md |

### Time Structures

| Structure | Purpose | Enforces | Location |
|-----------|---------|----------|----------|
| **TimeRoot** | Single monotonic time authority | I1, I5 | 05-runtime.md |
| **Continuity System** | Phase offset, reconciliation, field projection | I2, I30, I31 | 11-continuity-system.md |

---

## Dependencies

### Documents That Enforce These Invariants

| Topic | Enforces | Purpose |
|-------|----------|---------|
| **01-type-system.md** | I22 | Unit discipline prevents unsafe modulation |
| **02-block-system.md** | I6, I26 | NormalizedGraph immutability and input handling |
| **03-signals-fields.md** | I10-I14 | Transform uniformity, field lazy eval, expr canonicalization |
| **04-compilation.md** | I7-I9 | Cycle detection, schedule generation, slot addressing |
| **05-runtime.md** | I1-I5 | Time authority, state migration, deterministic ordering |
| **06-renderer.md** | I15-I18 | Render IR, batching, atomic swap, temporal stability |
| **08-diagnostics.md** | I19-I21, I28-I29 | Error taxonomy, attribution, traceability |
| **11-continuity-system.md** | I2, I30, I31 | Gauge invariance, deterministic continuity, export parity |

### Cross-References

- **Invariants ↔ Type System**: I22 (unit discipline) requires type-level enforcement (01-type-system.md)
- **Invariants ↔ Compilation**: I6-I10 require compiler design (04-compilation.md)
- **Invariants ↔ Runtime**: I1-I5, I30-I31 require runtime mechanisms (05-runtime.md, 11-continuity-system.md)
- **Invariants ↔ Debuggability**: I19-I21, I28-I29 require diagnostic infrastructure (08-diagnostics.md)

---

## Decisions

### Design Decisions Encoded by Invariants

1. **Single TimeRoot (I5)** - Eliminates competing time sources that cause unexplained jumps. Decision: one authority per patch.

2. **Gauge Invariance (I2)** - Scrubbing/looping must not pop animations. Decision: discontinuities absorbed by gauge layers (phase offset, reconciliation, field projection).

3. **Immutable NormalizedGraph (I6)** - Compiler cannot add/remove blocks. Decision: all transformations explicit before compilation.

4. **Slot-Addressed Execution (I8)** - No string lookups or object graphs in hot loops. Decision: IndexedSchedule + CompiledProgramIR.

5. **Schedule as Data (I9)** - Execution is inspectable. Decision: explicit Schedule structure, not incidental traversal order.

6. **Stable Element Identity (I11)** - Elements have IDs, not array indices. Decision: Domain as identity handle.

7. **Explicit Materialization (I12)** - Fields are lazy until needed. Decision: Scheduled materialization points with caching.

8. **Structural Sharing (I13)** - Identical subtrees share ExprId. Decision: Hash-consing during expr construction.

9. **Renderer as Sink (I15)** - All motion comes from patch. Decision: Render IR with zero creative logic.

10. **First-Class Error Taxonomy (I19)** - Errors are typed. Decision: DiagnosticCode enumeration by domain/severity.

11. **Deterministic Replay (I21)** - No Math.random(). Decision: Seeded randomness only.

12. **Export = Playback (I31)** - No "simplified" continuity for export. Decision: Export loop reuses same Schedule and Continuity steps.

13. **Toy Detector (I27)** - Meta-rule: if it depends on order/identity, it's broken. Decision: all execution explicit.

---

## Tier Classification

### Tier: T1 - Foundational (Non-Negotiable)

**All invariants in this document are T1.**

Rationale:
- Violation of ANY invariant indicates a system bug, not an edge case
- These rules constrain all downstream design decisions
- They cannot be selectively disabled or "waived away"
- Enforcement mechanisms are hardcoded into architecture, types, and compiler

### Severity Levels

- **CRITICAL (15 invariants)**: System collapses if violated
  - I1, I2, I3, I5, I6, I7, I8, I9, I15, I20, I23, I26, I27, I30, I31

- **HIGH (13 invariants)**: Major correctness/usability loss
  - I4, I10, I11, I12, I13, I14, I16, I17, I18, I19, I21, I24, I25

- **STRUCTURAL (3 invariants)**: Architecture integrity
  - I22, I28, I29

### Verification Strategy

1. **Type System**: I1, I5, I22 enforced at compile-time via types
2. **Compiler**: I6-I10, I26 enforced during graph compilation
3. **Runtime**: I2-I4, I20-I21, I30-I31 enforced at runtime with assertions
4. **Architecture**: I11-I18, I23-I25, I28-I29 enforced by design patterns and structure

---

## Quick Navigation

### By Use Case

**"I'm implementing a block type"** → Read I6, I8, I10, I26

**"I'm working on time/scheduling"** → Read I1-I5, I4, I9, I21, I30-I31

**"I'm implementing fields/signals"** → Read I11-I14

**"I'm adding a new visual feature"** → Read I15-I18

**"I'm debugging an issue"** → Read I19-I21, I28-I29

**"I'm scaling to multi-client"** → Read I23-I25

**"I need the meta-rule"** → Read I27 (toy detector)

### Related Documents

- Enforcement details: `design-docs/spec/topics/` directory
- Canonical index: `design-docs/spec/INDEX.md`
- Type system rules: `design-docs/spec/topics/01-type-system.md`
- State machine rules: `design-docs/spec/topics/05-runtime.md`
- Continuity specification: `design-docs/spec/topics/11-continuity-system.md`

---

## Version History

| Date | Version | Change |
|------|---------|--------|
| 2026-01-12 | 1.0 | Comprehensive index creation from INVARIANTS.md v0880523bca2b |

---

**Generated:** 2026-01-12
**Source:** INVARIANTS.md (hash: 0880523bca2b)
**Tier:** T1 - Foundational
**Status:** Active
