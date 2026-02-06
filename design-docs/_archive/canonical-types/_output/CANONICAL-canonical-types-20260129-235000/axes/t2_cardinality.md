---
parent: ../INDEX.md
topic: axes
tier: 2
---

# Axes: Cardinality (Structural)

> **Tier 2**: Can change, but it's work. Affects many other things.

**Foundational Prerequisites**: [Axis Invariants](./t1_axis-invariants.md)
**Related Topics**: [Type System](../type-system/), [Validation](../validation/)

---

## Overview

Cardinality describes how many lanes/elements a value represents at runtime. It is the axis that distinguishes signals (one value per frame) from fields (one value per instance per frame) and constants (compile-time only).

## CardinalityValue

```typescript
type CardinalityValue =
  | { kind: 'zero' }
  | { kind: 'one' }
  | { kind: 'many'; instance: InstanceRef };

type InstanceRef = {
  readonly instanceId: InstanceId;   // branded
  readonly domainTypeId: DomainTypeId; // branded
};
```

### zero (Q1 Resolved: compile-time-only)

`zero` means **compile-time-only**. The value exists at compile time, produces no runtime lanes, and occupies no per-frame/per-instance storage.

**Semantics**:
- Const blocks emit `cardinality=zero` always
- `zero` is NOT "scalar" — scalar is `cardinality=one + temporality=continuous`
- `zero` may be referenced by runtime expressions only by being lifted into `one` or `many` via explicit ops

**Hard invariant**: No implicit coercion from zero into runtime cardinalities. Only these explicit lift ops:
- `broadcastConstToSignal(const)`: zero → one (pure, stable)
- `broadcastConstToField(const, instance)`: zero → many(instance) (pure, stable)

**Allowed for**: const, compile-time table lookups, folded pure kernels whose args are all zero
**Forbidden for**: anything that reads time, state, events, instance intrinsics, or depends on runtime inputs

### one

`one` means one scalar value per frame. This is the signal cardinality.

### many(instance)

`many(instance)` means one value per lane per frame, where lanes are defined by the InstanceRef. This is the field cardinality.

**Instance identity**: The `InstanceRef` inside `many` is the ONLY place instance identity lives. Per invariant I1, there must be no separate `instanceId` field on expressions that carry `type: CanonicalType`.

**InstanceRef structure**: Contains branded `InstanceId` and `DomainTypeId`. No `kind` field — it is a data record, not a discriminated union.

## Extraction Helpers

```typescript
tryGetManyInstance(t: CanonicalType): InstanceRef | null;  // null if not many
requireManyInstance(t: CanonicalType): InstanceRef;          // throws if not many
```

See [Derived Classifications](../type-system/t2_derived-classifications.md) for full API.

## Cardinality Transforms

Only explicit operations change cardinality:

| Operation | From | To | Notes |
|-----------|------|----|-------|
| Broadcast (const→signal) | zero | one | Explicit lift |
| Broadcast (const→field) | zero | many(instance) | Explicit lift |
| Broadcast (signal→field) | one | many(instance) | Requires explicit adapter |
| Reduce (field→signal) | many(instance) | one | Requires explicit reducer |

---

## See Also

- [Axis Invariants](./t1_axis-invariants.md) - I1 (instance identity), I2 (explicit ops)
- [Derived Classifications](../type-system/t2_derived-classifications.md) - How cardinality affects classification
- [Temporality](./t2_temporality.md) - The other primary classification axis
