---
indexed: true
source: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/01-type-system.md
source_hash: f5ea1ecb0492
source_mtime: 2026-01-09T06:20:26Z
original_tokens: ~2257
index_tokens: ~876
compression: 38.8%
index_version: 1.0
---

# Index: 01-type-system.md

## Key Assertions

- **MUST NOT** include `'event'` or `'domain'` in PayloadType [L52]
- **MUST** use AxisTag discriminated union (no optional fields) [L83-99]
- **MUST** distinguish PayloadType (domain model) from TypeScript `number` (implementation detail) [L50-51]
- **Domain is NOT a wire value** - compile-time resource only, erased at runtime [L123-139]
- **Discrete never implicitly fills time** - requires explicit stateful operator [L158-160]
- **No implicit merges, no best effort** on axis unification [L276]
- **v0 canonical defaults**: cardinality=one, temporality=continuous, binding=unbound, perspective=global, branch=main [L248-256]
- **Binding is independent of domain** - same domain can host unbound vs bound values [L186-188]
- **Domain alignment (v0)**: same domain iff same DomainId [L320]

## Definitions

- **PayloadType** [L33] - Base data type (float, int, vec2, vec3, color, bool, unit, shape2d). Phase is float with unit:phase01.
- **Extent** [L62-68] - Five-axis coordinate (cardinality, temporality, binding, perspective, branch)
- **AxisTag** [L88-91] - Discriminated union for "default unless instantiated"
- **Cardinality** [L109-113] - How many lanes (zero, one, many with domain)
- **DomainId** [L106] - String identifier for domain resource
- **DomainRef** [L107] - Reference to domain via id
- **Temporality** [L146-149] - When value exists (continuous, discrete)
- **ReferentId** [L167] - String identifier for referent
- **ReferentRef** [L168] - Reference to referent via id
- **Binding** [L170-175] - Aboutness/purpose (unbound, weak, strong, identity)
- **PerspectiveId** [L197] - View perspective identifier
- **BranchId** [L198] - Timeline branch identifier
- **CanonicalType** [L214-217] - Complete contract (PayloadType + Extent)
- **DomainDecl** [L304-309] - Domain declaration with shape (fixed_count, grid_2d, voices, mesh_vertices)
- **EvalFrame** [L256] - Runtime evaluation context (perspective, branch)

## Invariants

- **I1**: PayloadType ∈ {'float', 'int', 'vec2', 'vec3', 'color', 'bool', 'unit', 'shape2d'} [L33]
- **I2**: Every AxisTag is discriminated union, never optional [L83-99]
- **I3**: Default + default → default; default + instantiated(X) → instantiated(X); instantiated(X) + instantiated(X) → instantiated(X); instantiated(X) + instantiated(Y), X≠Y → TYPE ERROR [L269-274]
- **I4**: Domain referenced only via Cardinality.many, not as wire value [L123-139]
- **I5**: Discrete temporality never implicitly becomes continuous [L158-160]
- **I6**: v0 defaults are: cardinality=one, temporality=continuous, binding=unbound [L248-254]
- **I7**: Every domain compiles to dense lanes 0..N-1 [L316]
- **I8**: Phase arithmetic: float(phase01)+float→float(phase01), float(phase01)*float→float(phase01), float(phase01)+float(phase01)→TYPE ERROR

## Data Structures

- **PayloadType** [L33] - 7 options (no fields, enum-like)
- **Extent** [L62-68] - 5 fields (all AxisTag)
- **AxisTag<T>** [L88-91] - 2-variant union (kind, optional value)
- **Cardinality** [L109-113] - 3-variant union (zero, one, many)
- **Binding** [L170-175] - 4-variant union (unbound, weak, strong, identity)
- **Temporality** [L146-149] - 2-variant union (continuous, discrete)
- **CanonicalType** [L214-217] - 2 fields (payload: PayloadType, extent: Extent)
- **DomainDecl** [L304-309] - 4-variant union with shape substructure
- **DEFAULTS_V0** [L248-254] - 5 fields (all canonically bound)

## Dependencies

**Depends on:**
- [02-block-system.md](./02-block-system.md) - How blocks use CanonicalType [L11, L402]
- [04-compilation.md](./04-compilation.md) - Type unification and resolution [L11, L403]
- [GLOSSARY.md](../GLOSSARY.md#payloadtype) - PayloadType definition [L12]
- [GLOSSARY.md](../GLOSSARY.md#extent) - Extent definition [L12]
- [GLOSSARY.md](../GLOSSARY.md#canonicalType) - CanonicalType definition [L12]
- [INVARIANTS.md](../INVARIANTS.md#i22-safe-modulation-ranges) - I22 Safe Modulation Ranges [L13]

**Referenced by:**
- Type unification rules (all five axes) [L265-283]
- Block interface definitions via CanonicalType [L220-241]

## Decisions

- **DECISION: AxisTag pattern eliminates optional fields** [L83-99] - Explicit discriminated union over optional syntax
- **DECISION: Five independent axes over flattened World enum** [L19, L286-295] - Enables future extensibility (binding, multi-view, branching)
- **DECISION: Domain as compile-time resource, not runtime wire value** [L123-139] - Erased to loop bounds at codegen
- **DECISION: Strict axis unification (no implicit merges)** [L265-276] - Compile-time only, no best-effort heuristics
- **DECISION: Canonical defaults in v0 with inherit semantics in v1+** [L248-261] - Future-proof extensibility
- **DECISION: Phase is float with unit:phase01, has special arithmetic (non-associative)** - Maintains cyclic semantics
- **DECISION: Discrete temporality never implicitly becomes continuous** [L158-160] - Explicit causality via SampleAndHold operator

## Tier Classification

**T1 (Core, foundational)** - Type system is the foundation for all compile-time guarantees and block interfaces. All other systems (blocks, compilation, binding) depend critically on type contracts. Five-axis model replaces v2 World enum entirely.

