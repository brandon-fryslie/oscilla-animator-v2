# Sprint: state-mapping - Implementation Context

> **Sprint**: state-mapping
> **Generated**: 2026-01-18

---

## Canonical Spec References

### Primary
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/11-continuity-system.md`
  - §3.3: MappingState types
  - §3.4: byId mapping algorithm
  - §3.5: byPosition fallback
  - §5.1: Where continuity runs
  - §6.1: Stable target keys

### Supporting
- `design-docs/CANONICAL-oscilla-v2.5-20260109/INVARIANTS.md`
  - I11: Stable element identity
  - I30: Continuity is deterministic

---

## Existing Code Locations

### Dependencies from identity-foundation
```
src/compiler/ir/types.ts          # DomainInstance, InstanceDecl
src/runtime/DomainIdentity.ts     # createStableDomainInstance()
```

### Files to Modify
```
src/runtime/RuntimeState.ts       # Add continuity field
```

### Files to Create
```
src/runtime/ContinuityState.ts
src/runtime/ContinuityMapping.ts
src/runtime/__tests__/ContinuityMapping.test.ts
```

---

## Key Design Decisions

### 1. StableTargetId Computation

**Decision**: Hash from semantic + instanceId + portName.

**Rationale** (spec §6.1):
- Must survive across recompiles
- Cannot use raw slot indices (renumber)
- Semantic role provides human-readable grouping
- InstanceId provides instance scope
- PortName provides field discrimination

### 2. MappingState as Discriminated Union

**Decision**: Three variants only (identity, byId, byPosition).

**Rationale**:
- `identity` = fast path, same elements
- `byId` = primary mapping using elementId
- `byPosition` = fallback for unstable domains
- Crossfade handled separately (not a mapping)

### 3. Int32Array for newToOld

**Decision**: Use signed Int32Array to allow -1 sentinel.

**Rationale**:
- -1 indicates unmapped (new element)
- Positive indices are valid old element indices
- Efficient typed array operations

### 4. Lazy Buffer Allocation

**Decision**: `getOrCreateTargetState()` allocates on demand.

**Rationale**:
- Not all targets need continuity
- Buffers only created when first accessed
- Reallocated when count changes

---

## Constraints

1. **No per-frame allocations** - Mapping computed only on domain change (spec §3.4)
2. **Deterministic** - Same inputs produce same mapping
3. **Bounded search** - byPosition has maxSearchRadius to prevent O(N²) blowup

---

## Out of Scope

- Schedule integration (Sprint 3)
- Slew/gauge application (Sprint 3)
- Crossfade implementation (Sprint 3)
- Performance optimization (future)
