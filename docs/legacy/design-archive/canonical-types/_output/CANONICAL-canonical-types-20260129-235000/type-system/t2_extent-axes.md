---
parent: ../INDEX.md
topic: type-system
tier: 2
---

# Type System: Extent Axes (Structural)

> **Tier 2**: Can change, but it's work. Affects many other things.

**Foundational Prerequisites**: [CanonicalType](./t1_canonical-type.md)
**Related Topics**: [Axes](../axes/)

---

## Overview

The Extent is a 5-dimensional space describing the evaluation semantics of any value. Each axis is independent and uses the `Axis<T, V>` polymorphic pattern defined in [t1_canonical-type.md](./t1_canonical-type.md).

## The Five Axes

| Axis | Value Type | Governs | Default |
|------|-----------|---------|---------|
| cardinality | `CardinalityValue` | How many lanes | `one` |
| temporality | `TemporalityValue` | Evaluation clock | `continuous` |
| binding | `BindingValue` | Identity attachment | `unbound` |
| perspective | `PerspectiveValue` | Coordinate frame | `default` |
| branch | `BranchValue` | History worldline | `default` |

## Axis Polymorphism in Practice

During type inference, axes may contain type variables:

```typescript
// During inference
{ kind: 'var', var: cardVar_42 }

// After solving
{ kind: 'inst', value: { kind: 'one' } }
```

### Default Canonicalization Rules

Constructors produce fully-instantiated axes with sensible defaults:

```typescript
function canonicalSignal(payload: PayloadType, unit: UnitType = { kind: 'scalar' }): CanonicalType {
  return {
    payload,
    unit,
    extent: {
      cardinality: { kind: 'inst', value: { kind: 'one' } },
      temporality: { kind: 'inst', value: { kind: 'continuous' } },
      binding: { kind: 'inst', value: { kind: 'unbound' } },
      perspective: { kind: 'inst', value: { kind: 'default' } },
      branch: { kind: 'inst', value: { kind: 'default' } },
    }
  };
}
```

**Note on constructor asymmetry (N4 resolved)**: `canonicalSignal` defaults `unit` to `{ kind: 'scalar' }` because signals are frequently dimensionless modulation values. `canonicalField` requires explicit `unit` because field values are domain-attached and the unit is semantically load-bearing. This asymmetry is intentional — it is a constructor convenience, NEVER an inference fallback.

## Axis Independence

Each axis varies independently. Changing cardinality does not affect temporality. Changing perspective does not affect binding. This orthogonality is what makes the 5-axis system composable.

The only constraint is the axis-shape contract enforced by the validation gate:
- Events require `temporality=discrete, payload=bool, unit=none`
- Fields require `cardinality=many(instance)`
- These are post-validation invariants, not type-construction constraints

---

## See Also

- [CanonicalType](./t1_canonical-type.md) - Foundational type definition
- [Derived Classifications](./t2_derived-classifications.md) - signal/field/event
- [Cardinality](../axes/t2_cardinality.md), [Temporality](../axes/t2_temporality.md), etc.
