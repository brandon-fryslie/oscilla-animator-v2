# Sprint: identity-foundation - Implementation Context

> **Sprint**: identity-foundation
> **Generated**: 2026-01-18

---

## Canonical Spec References

### Primary
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/11-continuity-system.md`
  - §3.1: DomainInstance type
  - §3.2: ElementId semantics
  - §2.4: GaugeSpec types
  - §2.2: ContinuityPolicy types

### Supporting
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/01-type-system.md`
  - Domain vs Instance distinction
  - InstanceRef in Cardinality

- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/02-block-system.md`
  - Three-Stage Architecture (Primitive → Array → Layout)
  - Array block as cardinality transform

- `design-docs/CANONICAL-oscilla-v2.5-20260109/INVARIANTS.md`
  - I11: Stable element identity
  - I30: Continuity is deterministic

---

## Existing Code Locations

### Types to Modify
```
src/compiler/ir/types.ts:317-323  # InstanceDecl - add identityMode
src/compiler/ir/types.ts:304-311  # LayoutSpec - reference only (no change)
```

### IRBuilder
```
src/compiler/ir/IRBuilder.ts      # Add identityMode to createInstance()
src/compiler/ir/IRBuilderImpl.ts  # Implementation if separate
```

### Array Block
```
src/blocks/                       # Find array block implementation
```

### Test Directory
```
src/runtime/__tests__/            # Add DomainIdentity.test.ts
```

---

## Key Design Decisions

### 1. ElementId as Uint32Array

**Decision**: Use `Uint32Array` for element IDs.

**Rationale**:
- Supports up to ~4 billion elements (2^32)
- Efficient for mapping algorithms (hash maps)
- SIMD-friendly for future optimization
- Matches spec §3.1

### 2. Identity Mode as 'stable' | 'none'

**Decision**: Two modes only, no intermediate states.

**Rationale**:
- Simple binary choice
- `stable` = use elementId for mapping
- `none` = fall back to crossfade
- Per spec §3.1: "If identityMode='none', the system must not attempt per-element projection"

### 3. Default to 'stable'

**Decision**: `identityMode` defaults to `'stable'`.

**Rationale**:
- Most instances should have stable identity for smooth transitions
- Opt-out (`'none'`) only for special cases
- Backward compatible with existing code

### 4. Seed Parameter for Determinism

**Decision**: Optional `seed` parameter for ID generation.

**Rationale**:
- Enables deterministic ID generation (I30)
- Different instances can have non-overlapping ID ranges
- Default seed=0 is fine for most cases

---

## Constraints

1. **No runtime allocations** - generateElementIds() allocates once, reused thereafter
2. **Deterministic** - Same inputs always produce same IDs
3. **No external dependencies** - Pure TypeScript, no libraries

---

## Out of Scope

- Mapping algorithms (Sprint 2)
- Continuity state storage (Sprint 2)
- Schedule integration (Sprint 3)
- Slew/gauge implementation (Sprint 3)
