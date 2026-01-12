---
source_file: topics/04-compilation.md
source_hash: d4d8661fd16b
tier: T1
date_generated: 2026-01-12
---

# Index: Compilation Pipeline (04-compilation)

## 1. Quick Reference

**Topic**: Compilation Pipeline
**Tier**: T1 (Foundational)
**Status**: Complete specification
**Key Focus**: How patches transform from user-authored graphs to runtime-executable IR

**Time Budget**: 15-20 minutes to read
**Prerequisites**: 01-type-system, 02-block-system

---

## 2. Core Concepts Map

| Concept | Definition | Key Property |
|---------|-----------|--------------|
| **RawGraph** | User-authored patch | May have unconnected inputs, implicit buses |
| **NormalizedGraph** | Canonical compile-time representation | Explicitly closed, fully connected, typed ports |
| **CompiledProgramIR** | Runtime-executable form | No type info, slot-addressed, schedule-driven |
| **GraphNormalization** | Stage 1→2 transformation | Materializes derived blocks, assigns initial types |
| **Compilation** | Stage 2→3 transformation | Type unification, cycle detection, scheduling, slot allocation |

---

## 3. Invariants & Constraints

| ID | Rule | Enforcement |
|----|------|------------|
| **I6** | Compiler never mutates the graph | Immutable input contract |
| **I7** | Explicit cycle semantics | Tarjan SCC + validation |
| **I8** | Slot-addressed execution | Runtime uses indices, not names |
| **I9** | Schedule is data | Explicit Step[] structure |
| **I13** | Hash-consing for identical subtrees | ExprId deduplication |
| **I14** | Cache keys explicit | CacheKey record for all caches |

---

## 4. Architecture Decisions

### Pipeline Structure
```
RawGraph → GraphNormalization → NormalizedGraph → Compilation → CompiledProgramIR
```

**Key Decision**: Three-stage pipeline with immutable intermediate representations at each boundary.

### Type Erasure Strategy
- **Compile-time**: Full 5-axis SignalType coordinates
- **Runtime**: Type info completely erased
- **Rationale**: 5-10ms performance budget requires zero-overhead IR

### Cycle Handling
- **Detection**: Tarjan's strongly connected components algorithm
- **Validation**: Every cycle must contain ≥1 stateful primitive (UnitDelay, Lag, Phasor, SampleAndHold)
- **Error**: CycleError with suggestion to add UnitDelay

### Slot Allocation by Cardinality
| Cardinality | Slot Type | Example |
|-------------|-----------|---------|
| `zero` | Inlined constant (no slot) | Literal 42 |
| `one` | ScalarSlot | Single float value |
| `many(domain)` | FieldSlot | Array per domain element |

---

## 5. Section-by-Section Breakdown

### Overview (Lines 17-30)
**Purpose**: High-level pipeline definition
**Key**: Introduces the 5-stage transformation and four core principles
**Actions**: Read first to understand flow

### Pipeline Stages (Lines 33-61)
**Purpose**: Describes each transformation stage
**Key Stages**:
- Stage 1: RawGraph (user input)
- Stage 2: GraphNormalization (materializes structure)
- Stage 3: Compilation (generates IR)
**Actions**: Reference when implementing stage-specific logic

### NormalizedGraph (Lines 65-119)
**Purpose**: Specifies the canonical compile-time representation
**Key Properties**:
- Explicitly closed (all derived blocks materialized)
- Fully connected (every input has exactly one source)
- Typed ports (SignalType 5-axis coordinates)
- **Critical**: Node/Port/Edge ID types and PortDirection structure
**Actions**: Use as reference for normalization output contract

### Domain Declarations (Lines 123-136)
**Purpose**: Resource declaration model for domains
**Key**: Four domain shape types (FixedCount, Grid2D, Voices, MeshVertices)
**v0 Invariant**: Every domain compiles to dense lanes 0..N-1
**Actions**: Reference when implementing domain lowering

### Type System in Compilation (Lines 139-191)
**Purpose**: How 5-axis model flows through compilation
**Two-Pass Process**:
1. Propagation: Infer missing structure
2. Unification + Resolution: Ensure agreement, resolve defaults
**Key Rules**: Default unification rules, axis resolution using DEFAULTS_V0 and FRAME_V0
**Critical Decision**: Type erasure happens after resolution
**Actions**: Use for type propagation and default resolution logic

### Cycle Detection and Validation (Lines 194-217)
**Purpose**: Ensure feedback loops are well-formed
**Algorithm**: Tarjan's SCC
**Validation Rule**: Every SCC must contain ≥1 stateful primitive
**Error Type**: CycleError with clear suggestion
**Actions**: Implement Tarjan's algorithm and validation check

### Scheduling (Lines 221-256)
**Purpose**: Define execution order
**Key Invariant**: I9 - Schedule is Data
**Seven Step Types**: eval_scalar, eval_field, eval_event, state_read, state_write, combine, render
**Ordering Guarantees**: Read inputs → Update time → Eval topological → Events → Render
**Actions**: Use Step[] as IR execution unit

### Slot Allocation (Lines 259-285)
**Purpose**: Map values to runtime storage
**Key Invariant**: I8 - Slot-Addressed Execution
**Three Slot Types**: ScalarSlot, FieldSlot, EventSlot, StateSlot
**Cardinality Mapping**: zero→inline, one→scalar, many(domain)→field
**State Allocation**: Replicated N times for many(domain)
**Actions**: Implement slot allocation based on type resolution

### CompiledProgramIR (Lines 288-354)
**Purpose**: Final runtime-executable form
**Key Properties**:
- No type info, no binding/perspective/branch
- Slot-based access only
- Lowered operations (scalar/field unary/binary, broadcast/reduce)
- Loop lowering for field operations with compile-time bounds
**Actions**: Use as target for all lowering passes

### Runtime Erasure (Lines 357-371)
**Purpose**: Hard constraints for performance
**Erased Elements**: Axis tags, referent IDs, domain objects, perspective/branch
**Remaining**: Scalars, dense arrays, event buffers, compiled schedules
**Rationale**: 5-10ms performance budget
**Actions**: Verify all type-system metadata removed before execution

### Structural Sharing (Lines 374-392)
**Purpose**: Optimization via hash-consing
**Key Invariant**: I13
**Mechanism**: Identical FieldExpr/SignalExpr subtrees share ExprId
**Benefit**: Increased cache hit rate, safe recompile
**Actions**: Implement deduplicated expression store

### Cache Keys (Lines 395-413)
**Purpose**: Explicit cache invalidation
**Key Invariant**: I14
**CacheKey Fields**: time, domain, upstreamSlots, params, stateVersion
**Expresses**: "Stable across frames" vs "changes each frame"
**Actions**: Every cache must declare explicit key dependency

### Error Handling (Lines 415-440)
**Purpose**: User-facing diagnostics
**Error Categories**:
- TypeError (axis/domain/phase mismatches)
- GraphError (cycles, missing inputs, invalid edges)
**Key Property**: Every error includes location info for UI display + suggested fix
**Actions**: Structure all compiler errors with location + suggestion

### Polymorphism (Lines 444-478)
**Purpose**: Generic block specialization
**Key Model**: Blocks are generic over (World, Domain) with compile-time constraints
**Monomorphization**: One Add block generates concrete ops for any SignalType combination
**No Runtime Polymorphism**: All specialization happens at compile time
**Actions**: Implement type-constraint system and monomorphization

### See Also (Lines 481-488)
**Cross-References**:
- 01-type-system (type definitions)
- 02-block-system (block structure)
- 05-runtime (IR execution)
- Glossary: NormalizedGraph
- Invariant: I6

---

## 6. Reading Path

**Goal: Understand overall compilation flow**
1. Overview (30 sec)
2. Pipeline Stages (2 min)
3. NormalizedGraph (3 min)
4. CompiledProgramIR (3 min)
5. Scheduling (3 min)

**Goal: Implement type system**
1. Type System in Compilation (5 min)
2. Cross-reference: 01-type-system
3. Unification Rules + Default Resolution (2 min)
4. Polymorphism section (3 min)

**Goal: Implement cycle detection**
1. Cycle Detection and Validation (3 min)
2. Implement Tarjan's SCC
3. Validation check for stateful primitives

**Goal: Implement scheduler**
1. Scheduling (5 min)
2. Slot Allocation (3 min)
3. Runtime Erasure (2 min)
4. Study Step[] types and ordering

**Goal: Understand runtime IR**
1. CompiledProgramIR (5 min)
2. Loop Lowering (2 min)
3. Slot Allocation (3 min)
4. Runtime Erasure (2 min)

---

## 7. Verification Checklist

### Specification Completeness
- [ ] All 5 pipeline stages documented with input/output types
- [ ] NormalizedGraph structure fully specified (nodes, edges, domains)
- [ ] Cycle detection algorithm named (Tarjan's SCC)
- [ ] Cycle validation rule explicit (stateful primitive requirement)
- [ ] Schedule explicitly structured (Step[] with 7 types)
- [ ] Slot allocation deterministic (cardinality-based mapping)
- [ ] Type erasure complete (no runtime type info)
- [ ] Error types include location + suggestion
- [ ] All invariants referenced (I6, I7, I8, I9, I13, I14)

### Implementation Readiness
- [ ] NormalizedGraph types can be directly translated to TypeScript
- [ ] Step[] types have clear semantics for interpreter
- [ ] Slot types have deterministic memory layout
- [ ] Unification rules are mechanically applicable
- [ ] Default resolution rules are deterministic
- [ ] Cardinality → SlotType mapping has no ambiguity
- [ ] Error handling can emit diagnostic messages with locations

### Gaps & Risks
- **Q1**: How are ExprIds generated in hash-consing? (Deferred to implementation)
- **Q2**: What does DEFAULTS_V0 and FRAME_V0 contain? (Cross-ref: 01-type-system)
- **Q3**: How are StepIds assigned for hot-swap reuse? (Deferred to implementation)
- **Risk**: Loop lowering assumes compile-time domain bounds; must verify domains are fully resolved
