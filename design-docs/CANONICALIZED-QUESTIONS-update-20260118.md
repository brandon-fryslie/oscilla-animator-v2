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

# Canonicalized Questions: Update Integration

> Update integration analysis for WHAT-IS-A-DOMAIN.md
> Date: 2026-01-18
> Status: RESOLVED - All critical items resolved, ready for integration

---

## Summary

| Category | Count | Critical? |
|----------|-------|-----------|
| CONTRADICTION-T2 (Structural) | 3 | HIGH |
| NEW-TOPIC | 1 | STRUCTURAL |
| OVERLAP/COMPLEMENT | 2 | INFORMATIONAL |
| AMBIGUITY | 1 | HIGH |
| GAP | 1 | NOTABLE |

**Total items requiring resolution before integration: 5**

---

## Q1: Fundamental Definition of "Domain"

**Status**: RESOLVED

**Tag**: CONTRADICTION-T2 + AMBIGUITY

**Severity**: HIGH

### The Conflict

**Canonical spec (01-type-system.md) says:**
> Domain: Compile-time declared stable index set defining element topology.

Domain in the canonical spec is purely about **cardinality and topology** - how many lanes exist and their layout structure. `DomainDecl` has shapes like `fixed_count`, `grid_2d`, `voices`, `mesh_vertices`.

**New document says:**
> A domain is a classification that defines a kind of element. It answers the question: "What type of thing are we talking about?"

Domain in the new document is about **ontological classification** - what kind of thing elements are (shape vs particle vs audio), what operations are valid, what intrinsic properties exist.

ANSWER: this is the new definition of the word Domain.

### Critical Quotes

From new document:
- "Domain specifies: (1) What kind of thing elements are, (2) What operations make sense, (3) What intrinsic properties elements have"
- "Domain is NOT: A count of elements, A spatial arrangement or layout, A specific instantiation"

From canonical spec:
- "Domain: Compile-time declared stable index set"
- `DomainDecl` includes `{ kind: 'grid_2d'; width: number; height: number }`

### The Problem

These are fundamentally different concepts using the same word:
1. **Canonical "Domain"** = index topology (cardinality shape)
2. **New "Domain"** = ontological category (what kind of thing)

The new document explicitly states that `grid` is NOT a domain - it's a layout. But canonical spec has `grid_2d` as a `DomainDecl.shape`.

### Options for Resolution

**Option A: Adopt New Definition, Rename Canonical Concept**
- "Domain" means ontological classification (new definition)
- Rename canonical `DomainDecl.shape` to something else (e.g., `InstanceLayout`, `TopologyShape`)
- Add new `DomainSpec` for ontological classification

ANSWER: Option A

In fact, DomainDecl has already been removed.

### Impact

- **Type system** (Topic 01): Major restructuring of Domain concept
- **Block system** (Topic 02): Blocks would need domain classification
- **Compilation** (Topic 04): Domain inference and validation
- **Glossary**: Domain definition must be updated

### Required Decision

Which definition of "Domain" should be canonical?

A **domain** is a classification that defines a kind of element. It answers the question: "What *type of thing* are we talking about?"

---

## Q2: Three-Stage Architecture (Primitive → Array → Layout)

**Status**: RESOLVED

**Tag**: CONTRADICTION-T2

**Severity**: HIGH

### The Conflict

**Canonical spec has:**
- Blocks like `DomainN` that directly create N-element domains
- No concept of "primitive" blocks creating single elements
- No "Array" block as a cardinality transform

**New document proposes:**
1. **Primitive blocks** create ONE element: `Signal<circle>`, `Signal<rectangle>`
2. **Array block** transforms one → many: `Signal<T>` → `Field<T, instance>`
3. **Layout blocks** operate on fields, output positions

### Architecture Comparison

**Current (implied by canonical spec):**
```
[DomainN(100)] → Field<shape> with implicit positions
```

**Proposed (new document):**
```
[Circle] → Signal<circle> (ONE)
    ↓
[Array] → Field<circle, inst> (MANY)
    ↓
[Grid Layout] → Field<vec2, inst> (positions)
```

### Critical Quote from New Document

> "The correct architecture separates three orthogonal concerns:
> 1. Primitive — What kind of thing (domain classification)
> 2. Array — How many instances (cardinality transform: one → many)
> 3. Layout — Where they are (spatial arrangement)"

### The Problem

This is a significant architectural change. The new document states:
> "The current `DomainDef`, `DomainId`, and related code embody multiple incorrect conflations. A scorched-earth migration is necessary — no bridging, no dual code paths."

### Options for Resolution

**Option A: Adopt Three-Stage Architecture**
- Add Primitive blocks, Array block, Layout blocks
- `DomainN` becomes deprecated or sugar for Primitive + Array
- Major Block System restructuring

ANSWER OPTION A HAS ALREADY BEEN ADOPTED

### Impact

- **Block system** (Topic 02): Major new block categories
- **Basic 12 Blocks**: Array would be a fundamental block
- **Renderer**: Would receive position separately from domain

### Required Decision

Should the three-stage architecture be adopted as canonical?

Answer YES

---

## Q3: DomainDecl vs DomainSpec + InstanceDecl Split

**Status**: RESOLVED

**Tag**: CONTRADICTION-T2

**Severity**: HIGH

### The Conflict

**Canonical spec (01-type-system.md):**
```typescript
type DomainDecl =
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'fixed_count'; count: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'grid_2d'; width: number; height: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'voices'; maxVoices: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'mesh_vertices'; assetId: string } };
```

**New document proposes splitting into two:**
```typescript
// Ontological classification (compile-time, from registry)
interface DomainSpec {
  readonly id: DomainId;
  readonly parent: DomainId | null;           // For subtyping
  readonly intrinsics: readonly IntrinsicSpec[];
  readonly operations: readonly OperationId[];
}

// Instantiation (per-patch, in the graph)
interface InstanceDecl {
  readonly id: InstanceId;
  readonly domainType: DomainId;
  readonly count: number | 'dynamic';
  readonly layout: LayoutSpec;
  readonly lifecycle: 'static' | 'dynamic' | 'pooled';
}
```

### The Problem

The new document argues these are "orthogonal concerns":
- **Domain** (what kind of thing): shape, particle, audio, etc.
- **Instance** (how many, where): count, layout, lifecycle

The canonical `DomainDecl` conflates these - `shape.grid_2d` mixes "what" with "layout".

### Options for Resolution

**Option A: Adopt Split Model**
- `DomainSpec` for ontological classification
- `InstanceDecl` for instantiation details
- `DomainDecl` becomes `InstanceDecl`

ANSWER: Option A

### Impact

- **Type system** (Topic 01): DomainDecl restructuring
- **Compilation** (Topic 04): New instance resolution pass
- **NormalizedGraph**: Structure change

### Required Decision

Should Domain and Instance be separated into distinct types?

YES

---

## Q4: Domain Subtyping Hierarchy

**Status**: RESOLVED (ADOPTED)

**Tag**: NEW-TOPIC

**Severity**: STRUCTURAL

### The Proposal

New document proposes domain subtyping (Section 3.2):

```
shape (base domain)
├── circle    → intrinsics: radius, center
├── rectangle → intrinsics: width, height, corner-radius
├── polygon   → intrinsics: vertices[], vertex-count
├── ellipse   → intrinsics: rx, ry, center
└── line      → intrinsics: start, end, length
```

Subtyping rules:
- Operations valid for `shape` are valid for subtypes
- Subtypes may have additional intrinsics
- `Field<circle>` can be passed where `Field<shape>` expected (covariance)

### Canonical Spec Position

No mention of domain subtyping. Domains are flat with no hierarchy.

### Options for Resolution

**Option A: Adopt Domain Subtyping**
- Add `parent: DomainId | null` to DomainSpec
- Implement covariance rules for type checking
- Adds complexity but enables generic operations

Answer: Option A

### Impact

- **Type system** (Topic 01): Covariance rules
- **Compilation** (Topic 04): Subtype checking
- **Complexity**: Significant increase

### Required Decision

Should domain subtyping be part of the canonical spec?

RESPONSE: In what way does this increase complexity?

NOTE: This has already been adopted

---

## Q5: Intrinsic Properties as Automatic Sources

**Status**: RESOLVED (DEFERRED)

**Tag**: AMBIGUITY

**Severity**: HIGH

### The Proposal

New document proposes that domains provide "intrinsic properties" automatically available:

> "When you're working with elements in the `path` domain, you don't need to manually compute or wire up:
> - `t` — the parametric position
> - `tangent` — the direction of travel
> - `curvature` — how sharply the path bends"

Section 3.11 proposes multiple design options for accessing intrinsics.

### Canonical Spec Position

No concept of domain-provided intrinsic properties. Values come from explicit block outputs.

### The Ambiguity

How do users access intrinsic properties?
1. **Option I1**: Outputs on Array block (explicit wiring)
2. **Option I2**: "Get Property" blocks (context-aware)
3. **Option I3**: Inline expression syntax (`=position * 0.1`)
4. **Option I4**: Hybrid

New document recommends Option I1 with Array block outputs.

ANSWER TBD

### Options for Resolution

**Option C: Defer Decision**
- Document as design consideration
- Decide during implementation

ANSWER: DEFER CANONICAL DECISION.  They will not be explicit block outputs, but more likely
intrinsic values that can be referenced from within any block of that domain type.  There is no 
need to 'wire' an intrinsic value as they are intrinsic.  ie, rendering a Circle does not need a wire
to transmit the value of radius from the circle block - the circle has an intrinsic radius already

### Impact

- **Block system** (Topic 02): Array block outputs
- **UX**: Discoverability vs explicitness

### Required Decision

Should domain intrinsics exist, and if so, how are they accessed?

DEFERRED

---

## Overlaps (Informational)

### O1: Cardinality Alignment

**Tag**: OVERLAP

The new document's `Signal<T>` (one) vs `Field<T>` (many) aligns with canonical Cardinality axis:
- `Signal<T>` = `{ kind: 'one' }`
- `Field<T>` = `{ kind: 'many'; domain: DomainRef }`

**Action**: Note as supporting evidence. No conflict.

### O2: Compile-Time Domain Erasure

**Tag**: OVERLAP

Both agree domains are mostly erased at runtime:
- Canonical: "At runtime, domain becomes loop bounds + layout constants (erased as object)"
- New: "Domains are primarily compile-time constructs. At runtime, we just have arrays and loop bounds."

**Action**: Note as alignment. No conflict.

---

## Gaps

### G1: Missing Implementation Details

**Tag**: GAP

The new document identifies what would need to exist for the proposed architecture:
- Primitive blocks per domain type
- Array block (cardinality transform)
- Layout blocks as operations
- Domain constraint specifications for block ports
- Instance resolution (pool allocation)

**Action**: If architecture is adopted, these become implementation requirements.

TRUTH

---

## Resolution Priority

1. **Q1** (Domain definition) - ADOPT AND INTEGRATE NEW DOMAIN DEFINITION ([WHAT-IS-A-DOMAIN-PART-4-REFACTOR.md](WHAT-IS-A-DOMAIN-PART-4-REFACTOR.md))
2. **Q3** (DomainDecl split) - ADOPT AND INTEGRATE NEW DOMAIN DEFINITION ([WHAT-IS-A-DOMAIN-PART-4-REFACTOR.md](WHAT-IS-A-DOMAIN-PART-4-REFACTOR.md))
3. **Q2** (Three-stage architecture) - ([WHAT-IS-A-DOMAIN-PART-4-REFACTOR.md](WHAT-IS-A-DOMAIN-PART-4-REFACTOR.md))
4. **Q4** (Subtyping) - Can be deferred (DEFER CANONICAL ANSWER)
5. **Q5** (Intrinsics) - Can be deferred (DEFER CANONICAL ANSWER)

---

## Next Steps

1. Resolve Q1 to establish canonical Domain definition
2. Based on Q1, resolve Q2 and Q3
3. Q4 and Q5 can be marked "defer to post-MVP" if needed
4. Update affected topics: 01-type-system, 02-block-system, GLOSSARY

---

*Generated by /canonicalize-architecture UPDATE run*
*Source: design-docs/WHAT-IS-A-DOMAIN.md*
