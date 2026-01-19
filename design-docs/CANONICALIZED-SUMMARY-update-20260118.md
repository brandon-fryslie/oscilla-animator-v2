---
command: /canonicalize-architecture design-docs/ design-docs/WHAT-IS-A-DOMAIN.md
files: [design-docs/WHAT-IS-A-DOMAIN.md]
indexed: true
source_files:
  - design-docs/WHAT-IS-A-DOMAIN.md
topics:
  - type-system
  - block-system
  - domain-system (proposed new)
---

# Canonicalized Summary: Update Integration

> Summary of WHAT-IS-A-DOMAIN.md integration analysis
> Date: 2026-01-18

---

## Executive Summary

The document `WHAT-IS-A-DOMAIN.md` proposes a **significant reconceptualization** of what "Domain" means in Oscilla. This is not a simple addition - it challenges and potentially replaces the canonical definition.

### Key Tension

| Aspect | Canonical Spec | New Document |
|--------|----------------|--------------|
| **What "Domain" means** | Index topology (how many, what layout) | Ontological category (what kind of thing) |
| **Domain examples** | `fixed_count`, `grid_2d`, `voices` | `shape`, `particle`, `audio`, `control` |
| **Architecture** | DomainN creates N elements directly | Primitive → Array → Layout (3 stages) |
| **Hierarchy** | Flat domains | Subtype hierarchy (shape → circle, etc.) |
| **Intrinsics** | No automatic properties | Domain grants intrinsic properties |

### Classification

| Category | Count |
|----------|-------|
| Structural contradictions (T2) | 3 |
| New topics proposed | 1 |
| Overlaps (complementary) | 2 |
| Ambiguities requiring decision | 1 |
| Implementation gaps | 1 |

---

## Source Document Analysis

### Document Structure

`WHAT-IS-A-DOMAIN.md` is organized in three parts:

1. **Part 1: Abstract Concept** (Lines 1-146)
   - Defines "domain" as ontological classification
   - Distinguishes domain from instantiation
   - Three aspects: what elements are, valid operations, intrinsic properties

2. **Part 2A: Animation System (Conceptual)** (Lines 149-338)
   - Applies concept to generative animation
   - Proposes domain catalog (shape, path, text, particle, mesh, audio, etc.)
   - Discusses domain relationships (conversion, derivation, mapping)

3. **Part 2B: Animation System (Technical)** (Lines 342-687)
   - Type system integration
   - Domain registry
   - Compilation considerations
   - Memory layout implications

4. **Part 3: Oscilla-Specific** (Lines 690-1647)
   - Domain catalog for Oscilla (immediate vs roadmap)
   - Three-stage architecture proposal
   - Detailed block specifications
   - Steel thread example

### Document Quality

- **Comprehensive**: 1647 lines of detailed specification
- **Well-structured**: Clear separation of concerns
- **Internally consistent**: Follows its own conceptual model
- **Implementation-aware**: Includes concrete code examples

---

## Affected Existing Topics

### Topic 01: Type System

**Impact**: HIGH

The document affects:
- Definition of `Domain` (fundamental change)
- `DomainDecl` structure (split into DomainSpec + InstanceDecl)
- Cardinality axis semantics (domain reference meaning)
- Potential new `SignalType` variant for single-element primitive

**Specific conflicts:**
- Canonical: `DomainDecl.shape = grid_2d` (layout is part of domain)
- New: grid is NOT a domain, it's a layout (separate concerns)

### Topic 02: Block System

**Impact**: HIGH

The document proposes new block categories:
- **Primitive blocks**: Circle, Rectangle, Polygon (output: Signal<T>)
- **Array block**: Cardinality transform (Signal → Field)
- **Layout blocks**: Grid, Spiral, AlongPath (position assignment)

**Specific conflicts:**
- Canonical Basic 12 includes `DomainN` (creates N elements directly)
- New: `DomainN` conflates concerns, should be Primitive + Array

### Topic 04: Compilation

**Impact**: MEDIUM

The document proposes new compilation phases:
- Domain inference pass
- Domain validation pass
- Instance resolution pass

### Topic 06: Renderer

**Impact**: LOW

No direct conflict. The document's render model aligns with canonical "renderer is sink."

---

## Proposed New Topics

### Domain System (NEW)

If the expanded domain concept is adopted, a new topic would cover:
- Domain catalog and hierarchy
- DomainSpec structure (ontological classification)
- InstanceDecl structure (instantiation)
- Intrinsic property system
- Domain operations registry
- Subtyping rules

**Recommended tier**: T2 (Structural) - Can change but affects many things

---

## Overlap Analysis

### Complementary Alignments

1. **Compile-time erasure**: Both agree domains become loop bounds at runtime
2. **Cardinality semantics**: Signal<T> (one) vs Field<T> (many) maps to canonical Cardinality
3. **Type safety**: Both emphasize compile-time type checking
4. **Pool-based allocation**: Both support fixed-pool with active mask

### No Direct Conflicts

The new document doesn't contradict invariants. It proposes expanding concepts while respecting:
- I11: Stable element identity (enhanced by domain system)
- I8: Slot-addressed execution (maintained)
- I9: Schedule is data (maintained)

---

## Gap Analysis

### Implementation Requirements (if adopted)

The new architecture requires:

1. **Block Library Additions**
   - Primitive blocks: Circle, Rectangle, Polygon, etc.
   - Array block (cardinality transform)
   - Layout blocks: Grid, Spiral, Random, AlongPath

2. **Type System Extensions**
   - DomainSpec type with intrinsics and operations
   - InstanceDecl type with count, layout, lifecycle
   - Domain subtyping relationships

3. **Compiler Extensions**
   - Domain inference pass
   - Domain constraint validation
   - Instance resolution and pool allocation

4. **UI Extensions**
   - Domain-colored wires
   - Context-aware block palette
   - Conversion suggestions

### Documentation Gaps

The new document references but doesn't fully specify:
- Complete intrinsic property catalog per domain
- Operation validity rules per domain
- Conversion matrix between domains

---

## Key Decisions Required

### Decision 1: Domain Definition

**Question**: What does "Domain" mean canonically?

**Stakes**: This affects nearly everything - type system, block system, compilation, UI.

**Options**:
| Option | Description | Impact |
|--------|-------------|--------|
| A | Adopt new ontological definition | Major restructuring |
| B | Keep canonical topological definition | Reject document's core premise |
| C | Two-level system (kind + shape) | Compromise, added complexity |

### Decision 2: Architecture Pattern

**Question**: Should the three-stage architecture (Primitive → Array → Layout) be adopted?

**Stakes**: Fundamental block library design.

**Options**:
| Option | Description | Impact |
|--------|-------------|--------|
| A | Adopt three-stage | New block categories, DomainN deprecated |
| B | Keep current | Document architecture rejected |
| C | Incremental | Both patterns during transition |

### Decision 3: Timeline

**Question**: When should this be implemented?

**Options**:
| Option | Description |
|--------|-------------|
| A | Now - part of current architecture | Block all else until resolved |
| B | Next sprint | Document as planned, implement soon |
| C | Post-MVP | Document as future direction |

---

## Recommendation

### For Resolution

1. **Start with Q1** (Domain definition) - everything else depends on this
2. **If adopting new definition**: Proceed with Q2 (architecture) and Q3 (type split)
3. **Q4 (subtyping) and Q5 (intrinsics)**: Can be deferred to post-MVP

### Integration Path (if adopting)

1. Add new topic: `XX-domain-system.md` (T2)
2. Update Topic 01 (type-system): DomainDecl → InstanceDecl, add DomainSpec
3. Update Topic 02 (block-system): New block categories
4. Update GLOSSARY: Domain, Instance, Primitive, Array, Layout, Intrinsic
5. Update INVARIANTS: Possibly add domain-related invariants

### If Deferring

1. Document WHAT-IS-A-DOMAIN.md as "design exploration"
2. Note key concepts in RESOLUTION-LOG as "considered, deferred"
3. Keep canonical spec unchanged
4. Revisit post-MVP

---

## Files Created

| File | Purpose |
|------|---------|
| `CANONICALIZED-QUESTIONS-update-20260118.md` | All issues requiring resolution |
| `CANONICALIZED-SUMMARY-update-20260118.md` | This summary document |
| `CANONICALIZED-GLOSSARY-update-20260118.md` | New/conflicting terms (to be created) |

---

*Generated by /canonicalize-architecture UPDATE run*
*Source: design-docs/WHAT-IS-A-DOMAIN.md*
