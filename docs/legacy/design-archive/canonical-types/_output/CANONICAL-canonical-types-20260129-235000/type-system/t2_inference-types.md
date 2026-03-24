---
parent: ../INDEX.md
topic: type-system
tier: 2
---

# Type System: Inference Types (Structural)

> **Tier 2**: Can change, but it's work. Affects many other things.

**Foundational Prerequisites**: [CanonicalType](./t1_canonical-type.md)
**Related Topics**: [Derived Classifications](./t2_derived-classifications.md), [Validation](../validation/)

---

## Overview

The type solver and frontend inference machinery require type variables in payload and unit positions. These inference-only wrappers extend `PayloadType` and `UnitType` with var branches. They MUST NOT escape the frontend boundary.

**Resolution Q2**: Split inference types from canonical types.

## InferencePayloadType

```typescript
type InferencePayloadType =
  | PayloadType                          // All concrete payload kinds
  | { kind: 'var'; var: PayloadVarId };  // Inference variable
```

**PayloadVarId** is a branded identifier for payload type variables. The solver assigns and resolves these during constraint solving.

## InferenceUnitType

```typescript
type InferenceUnitType =
  | UnitType                          // All 8 structured unit kinds
  | { kind: 'var'; var: UnitVarId };  // Inference variable
```

**UnitVarId** is a branded identifier for unit type variables. The solver tracks these separately from axis variables.

## InferenceCanonicalType

```typescript
type InferenceCanonicalType = {
  readonly payload: InferencePayloadType;
  readonly unit: InferenceUnitType;
  readonly extent: Extent;  // Extent already has var support via Axis<T, V>
};
```

This is the type used during inference. After solving, all var branches are resolved and the result is a concrete `CanonicalType`.

## Boundary Rule

**These types exist ONLY in:**
- Type solver internals (constraint gathering, unification)
- Frontend type inference passes
- UI type display helpers (via `tryDeriveKind`)

**These types MUST NOT appear in:**
- Backend IR (`ValueExpr.type` is always `CanonicalType`)
- Runtime state
- Renderer
- Any persisted or serialized structure
- Any structure that crosses the frontend→backend boundary

## Relationship to Axis\<T, V\>

The `Extent` already supports type variables through the `Axis<T, V>` polymorphic pattern (where `V` is the variable type for each axis). `InferencePayloadType` and `InferenceUnitType` extend the same concept to the other two components of the type triple:

| Component | Canonical (backend) | Inference (frontend) |
|-----------|-------------------|---------------------|
| Payload | `PayloadType` (concrete only) | `InferencePayloadType` (+ var) |
| Unit | `UnitType` (concrete only) | `InferenceUnitType` (+ var) |
| Extent axes | `Axis<T, never>` (inst only) | `Axis<T, V>` (inst + var) |

## tryDeriveKind Helper

Because inference types may contain unresolved variables, `deriveKind()` (which requires instantiated axes) cannot be used. Instead:

```typescript
function tryDeriveKind(t: CanonicalType | InferenceCanonicalType): DerivedKind | null;
// Returns null when cardinality or temporality axes are var.
// Returns 'signal' | 'field' | 'event' when both are instantiated.
```

See [Derived Classifications](./t2_derived-classifications.md) for full API.

---

## See Also

- [CanonicalType](./t1_canonical-type.md) — The concrete type (no variables)
- [Derived Classifications](./t2_derived-classifications.md) — deriveKind and tryDeriveKind
- [Axis Invariants](../axes/t1_axis-invariants.md) — No var escape to backend
