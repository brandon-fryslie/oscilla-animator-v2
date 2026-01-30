---
parent: ../INDEX.md
topic: type-system
tier: 2
---

# Type System: Derived Classifications (Structural)

> **Tier 2**: Can change, but it's work. Affects many other things.

**Foundational Prerequisites**: [CanonicalType](./t1_canonical-type.md)
**Related Topics**: [Axes](../axes/), [Validation](../validation/)

---

## Overview

Signal, field, and event are **derived classifications** — computed from CanonicalType axes, never stored as authoritative data. This section defines the derivation rules and the helper functions that operate on them.

## deriveKind()

```typescript
function deriveKind(type: CanonicalType): 'signal' | 'field' | 'event' {
  const card = getInstValue(type.extent.cardinality);
  const temp = getInstValue(type.extent.temporality);

  // Priority: event > field > signal
  if (temp.kind === 'discrete') return 'event';
  if (card.kind === 'many') return 'field';
  return 'signal';
}
```

**Properties**:
- Total over fully instantiated types: handles all possible CanonicalType inputs where all axes are `{ kind: 'inst' }`
- Deterministic: same input always produces same output
- Priority-ordered: discrete temporality takes precedence (event), then many cardinality (field), then default (signal)
- Throws if axes contain `{ kind: 'var' }` — use `tryDeriveKind` for inference paths

**Note on const/zero**: `cardinality=zero` derives as 'signal' (compile-time scalar). The `const` classification is not part of `deriveKind` — it's determined by checking `cardinality === zero` separately.

## tryDeriveKind() (Resolution Q3)

```typescript
function tryDeriveKind(t: CanonicalType | InferenceCanonicalType): DerivedKind | null;
// Returns null when cardinality or temporality axes are { kind: 'var' }.
// Returns 'signal' | 'field' | 'event' when both are instantiated.
// Never throws.
```

**Usage rules**:
- **UI/inference paths** MUST use `tryDeriveKind` (axes may be unresolved)
- **Backend/lowered paths** MUST use strict `deriveKind` (all axes guaranteed instantiated)

See [Inference Types](./t2_inference-types.md) for the inference-only type wrappers.

## Boolean Check Helpers

```typescript
function isSignalType(t: CanonicalType): boolean;  // cardinality=one, temporality=continuous
function isFieldType(t: CanonicalType): boolean;    // cardinality=many(instance)
function isEventType(t: CanonicalType): boolean;    // temporality=discrete
```

These never throw. Use for conditional branching when the caller can handle any classification.

## Assertion Helpers

```typescript
function requireSignalType(t: CanonicalType): void;           // throws if not signal
function requireFieldType(t: CanonicalType): InstanceRef;      // throws if not field, returns InstanceRef
function requireEventType(t: CanonicalType): void;              // throws if not event
```

Use in backend code, lowering, and validation where a specific classification is required.

## Instance Extraction (Resolution C3)

**Resolution**: `getManyInstance` is replaced by two explicit helpers.

```typescript
function tryGetManyInstance(t: CanonicalType): InstanceRef | null;
// Returns InstanceRef if cardinality=many(instance), null otherwise.
// Never throws. Use in UI, diagnostics, when handling incomplete types.

function requireManyInstance(t: CanonicalType): InstanceRef;
// Returns InstanceRef. Throws crisp error if not many-instanced.
// Use in compiler backend, lowering, field-expected paths.
```

**Deprecated**: `getManyInstance` — do not use. The ambiguity of "returns null OR should I crash?" is resolved by splitting into try/require.

## Stride Helper

```typescript
function payloadStride(payload: PayloadType): number;
// float=1, int=1, bool=1, vec2=2, vec3=3, color=4, cameraProjection=16
```

Stride is ALWAYS derived from payload. Never stored as a separate field. Never used as a parallel type system.

## Constructor Contracts

### canonicalSignal(payload, unit?)
- Creates: cardinality=one, temporality=continuous
- Default unit: `{ kind: 'scalar' }` (convenience only, never inference fallback)
- All other axes: default instantiated values

### Builder Enforcement: eventRead (Resolution Q10)

The IR builder MUST NOT accept a caller-provided type for `eventRead` operations. The builder sets the type internally:

```typescript
// Builder enforces: eventRead always produces this type
canonicalSignal({ kind: 'float' }, { kind: 'scalar' })
```

This prevents callers from accidentally creating non-signal eventRead outputs. The axis validator additionally checks that eventRead results are continuous signals.

### canonicalField(payload, unit, instance)
- Creates: cardinality=many(instance), temporality=continuous
- Unit: REQUIRED (no default — field values are domain-attached)
- `instance` is an `InstanceRef` containing instanceId and domainTypeId

### canonicalConst(payload, unit)
- Creates: cardinality=zero, temporality=continuous
- Zero means compile-time-only — no runtime lanes, no per-frame storage
- Must be explicitly lifted to `one` or `many` via broadcast ops

### canonicalEventOne()
- Creates: payload=bool, unit=none, cardinality=one, temporality=discrete
- Hard invariant: event ⇒ bool + none + discrete

### canonicalEventField(instance)
- Creates: payload=bool, unit=none, cardinality=many(instance), temporality=discrete

---

## See Also

- [CanonicalType](./t1_canonical-type.md) - Core type shape
- [Cardinality](../axes/t2_cardinality.md) - zero/one/many semantics
- [Axis Validation](../validation/t2_axis-validate.md) - Where classifications are enforced
