---
command: /canonicalize-architecture design-docs/ design-docs/WHAT-IS-A-DOMAIN.md
files: [design-docs/WHAT-IS-A-DOMAIN.md]
indexed: true
source_files:
  - design-docs/WHAT-IS-A-DOMAIN.md
---

# Canonicalized Glossary Update

> New and conflicting terms from WHAT-IS-A-DOMAIN.md
> Date: 2026-01-18
> Status: PENDING - Requires Q1 resolution before terms can be added

---

## Conflicting Terms

### Domain

**Canonical Definition** (GLOSSARY.md):
> Compile-time declared stable index set defining element topology.
> Type: concept / compile-time resource
> Canonical Form: `Domain`, `DomainId`, `DomainDecl`
> Note: NOT a wire value. Referenced by SignalType's Cardinality axis.

**New Definition** (WHAT-IS-A-DOMAIN.md):
> A classification that defines a kind of element. It answers the question: "What type of thing are we talking about?"
> A domain specifies: (1) What kind of thing elements are, (2) What operations make sense, (3) What intrinsic properties elements have
> A domain is NOT: A count of elements, A spatial arrangement, A specific instantiation

**Resolution Required**: Q1 in QUESTIONS file

---

### DomainDecl

**Canonical Definition** (01-type-system.md):
```typescript
type DomainDecl =
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'fixed_count'; count: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'grid_2d'; width: number; height: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'voices'; maxVoices: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'mesh_vertices'; assetId: string } };
```

**New Proposal** - Replace with two separate types:
```typescript
// DomainSpec - ontological classification
interface DomainSpec {
  readonly id: DomainId;
  readonly parent: DomainId | null;
  readonly intrinsics: readonly IntrinsicSpec[];
  readonly operations: readonly OperationId[];
}

// InstanceDecl - instantiation details
interface InstanceDecl {
  readonly id: InstanceId;
  readonly domainType: DomainId;
  readonly count: number | 'dynamic';
  readonly layout: LayoutSpec;
  readonly lifecycle: 'static' | 'dynamic' | 'pooled';
}
```

**Resolution Required**: Q3 in QUESTIONS file

---

## New Terms (Proposed)

### DomainSpec

**Proposed Definition**: Compile-time type declaration specifying ontological classification of a domain type, including parent domain (for subtyping), intrinsic properties, and valid operations.

**Type**: type

**Proposed Form**: `DomainSpec`

**Source**: WHAT-IS-A-DOMAIN.md, Section 3.4

**Status**: Pending Q1 resolution

---

### InstanceDecl

**Proposed Definition**: Per-patch declaration specifying a specific instantiation of a domain, including count, layout, and lifecycle.

**Type**: type

**Proposed Form**: `InstanceDecl`

**Source**: WHAT-IS-A-DOMAIN.md, Section 3.4

**Status**: Pending Q3 resolution

---

### Primitive (Block Category)

**Proposed Definition**: A block that creates a single element of a specific domain type. Outputs `Signal<T>` where T is the domain type.

**Type**: concept (block category)

**Proposed Form**: `Primitive Block`

**Examples**: Circle, Rectangle, Polygon (output one shape element)

**Source**: WHAT-IS-A-DOMAIN.md, Section 3.6

**Status**: Pending Q2 resolution

---

### Array Block

**Proposed Definition**: A block that transforms a single element into many elements. Performs cardinality transform from `Signal<T>` to `Field<T, instance>`.

**Type**: block

**Proposed Form**: `Array`

**Source**: WHAT-IS-A-DOMAIN.md, Section 3.7

**Status**: Pending Q2 resolution

---

### Layout Block

**Proposed Definition**: A block that operates on field inputs (many elements) and outputs position fields. Determines spatial arrangement without affecting domain or count.

**Type**: concept (block category)

**Proposed Form**: `Layout Block`

**Examples**: Grid Layout, Spiral Layout, Random Scatter, Along Path

**Source**: WHAT-IS-A-DOMAIN.md, Section 3.8

**Status**: Pending Q2 resolution

---

### LayoutSpec

**Proposed Definition**: Specification of spatial arrangement, orthogonal to domain type.

**Type**: type

**Proposed Form**: `LayoutSpec`

**Values**:
```typescript
type LayoutSpec =
  | { kind: 'unordered' }
  | { kind: 'linear'; spacing: number }
  | { kind: 'grid'; rows: number; cols: number }
  | { kind: 'circular'; radius: number }
  | { kind: 'along-path'; pathRef: FieldExprId }
  | { kind: 'random'; bounds: Rect; seed: number }
  | { kind: 'custom'; positionField: FieldExprId };
```

**Source**: WHAT-IS-A-DOMAIN.md, Section 3.4

**Status**: Pending Q2 resolution

---

### Intrinsic Property

**Proposed Definition**: A property that exists by virtue of domain membership, not because of explicit assignment. May be inherent, derived, or relational.

**Type**: concept

**Proposed Form**: `Intrinsic`, `IntrinsicSpec`

**Structure**:
```typescript
interface IntrinsicSpec {
  readonly name: string;
  readonly type: PayloadType;
  readonly computation: 'inherent' | 'derived' | 'relational';
  readonly derivation?: DerivationFn;
}
```

**Examples**:
- `path` domain: `t` (inherent), `tangent` (derived), `curvature` (derived)
- `shape` domain: `position`, `bounds`, `area`, `centroid`

**Source**: WHAT-IS-A-DOMAIN.md, Section 3.11

**Status**: Pending Q5 resolution

---

### Domain Subtyping

**Proposed Definition**: Hierarchical relationship between domains where a subtype inherits all operations and intrinsics from its parent, and may add additional ones.

**Type**: concept

**Example**:
```
shape (base)
├── circle    → adds: radius, center
├── rectangle → adds: width, height
└── polygon   → adds: vertices[]
```

**Subtyping rules**:
- Operations valid for parent are valid for subtypes
- `Field<circle>` can be passed where `Field<shape>` expected (covariance)

**Source**: WHAT-IS-A-DOMAIN.md, Section 3.2

**Status**: Pending Q4 resolution

---

### Domain Catalog

**Proposed Definition**: The registry of all known domain types in the system.

**Type**: concept

**Proposed Domains for Oscilla** (from document):

**Immediate priority**:
| Domain | Elements | Intrinsics | Operations |
|--------|----------|------------|------------|
| `shape` | 2D geometric primitives | position, bounds, area, centroid | translate, rotate, scale, boolean |
| `control` | Animatable parameters | value, min, max, default | lerp, spring, ease, clamp |
| `event` | Discrete occurrences | time, payload, fired | trigger, delay, filter, gate |

**Roadmap**:
- `mesh`, `path`, `text`, `particle`, `audio`

**Source**: WHAT-IS-A-DOMAIN.md, Section 3.1

**Status**: Pending Q1 resolution

---

## Terms That May Be Deprecated

### grid_2d (as DomainDecl.shape)

**Current**: `{ kind: 'grid_2d'; width: number; height: number }` is a `DomainDecl.shape`

**Proposed**: Grid is a Layout, not a domain. Would become `LayoutSpec.grid`.

**Resolution Required**: Q1/Q2

---

## Complementary Definitions

These terms from the new document align with canonical definitions:

### Signal<T>

**Document usage**: "A SignalType where cardinality = one"
**Canonical**: Already defined as type constraint where cardinality = one, temporality = continuous
**Status**: Aligned, no change needed

### Field<T>

**Document usage**: "A SignalType where cardinality = many(domain)"
**Canonical**: Already defined as type constraint where cardinality = many(domain), temporality = continuous
**Status**: Aligned, no change needed

---

## Integration Notes

Once Q1-Q5 are resolved:

1. If **adopting** new domain definition:
   - Update Domain entry in GLOSSARY.md
   - Add DomainSpec, InstanceDecl, Intrinsic, Layout terms
   - Add Domain Catalog section
   - Deprecate current DomainDecl.shape semantics

2. If **rejecting** new domain definition:
   - No glossary changes
   - Document WHAT-IS-A-DOMAIN.md as "design exploration - not adopted"

---

*Generated by /canonicalize-architecture UPDATE run*
*Source: design-docs/WHAT-IS-A-DOMAIN.md*
