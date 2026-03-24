---
parent: ../INDEX.md
topic: type-system
tier: 1
---

# Type System: CanonicalType (Foundational)

> **Tier 1**: Cannot change. Would make this a different application.

**Related Topics**: [Principles](../principles/), [Axes](../axes/), [Validation](../validation/)
**Key Terms**: [CanonicalType](../GLOSSARY.md#canonicaltype), [PayloadType](../GLOSSARY.md#payloadtype), [UnitType](../GLOSSARY.md#unittype), [Extent](../GLOSSARY.md#extent)

---

## The Type

```typescript
type CanonicalType = {
  readonly payload: PayloadType;
  readonly unit: UnitType;
  readonly extent: Extent;
};
```

This is the single type authority for all values. Every value-producing expression, every port, every slot carries exactly one `CanonicalType`.

## PayloadType (Closed Set)

```typescript
type PayloadType =
  | { kind: 'float' }
  | { kind: 'int' }
  | { kind: 'bool' }
  | { kind: 'vec2' }
  | { kind: 'vec3' }
  | { kind: 'color' }
  | { kind: 'cameraProjection' };
```

**Properties**:
- Closed set — adding a new payload kind is a foundational change
- Each kind implies a stride: `payloadStride(payload)` returns the number of scalar lanes (float=1, vec2=2, vec3=3, color=4, etc.)
- Stride is ALWAYS derived from payload, never stored separately

## UnitType (8 Structured Kinds)

**Resolution C2**: Structured nesting with 8 top-level kinds. No `{ kind: 'var' }` in canonical type.

```typescript
type UnitType =
  | { kind: 'none' }
  | { kind: 'scalar' }
  | { kind: 'norm01' }
  | { kind: 'count' }
  | { kind: 'angle'; unit: 'radians' | 'degrees' | 'phase01' }
  | { kind: 'time'; unit: 'ms' | 'seconds' }
  | { kind: 'space'; space: 'ndc' | 'world' | 'view'; dims: 2 | 3 }
  | { kind: 'color'; space: 'rgba01' };
```

**Hard constraints**:
- No `{ kind: 'var' }` inside `UnitType` — unit variables exist only in inference-only wrappers during type solving
- Unit semantics are only changed by explicit ops (adapter blocks, unit-converting kernels)
- `defaultUnitForPayload()` is NOT used by type checking; it is allowed only for UI display defaults or explicit authoring helpers

## Extent (5 Axes)

```typescript
type Extent = {
  readonly cardinality: CardinalityAxis;
  readonly temporality: TemporalityAxis;
  readonly binding: BindingAxis;
  readonly perspective: PerspectiveAxis;
  readonly branch: BranchAxis;
};
```

Each axis uses the polymorphic axis pattern (see below).

## Axis Polymorphism Pattern

**Resolution C1**: The canonical axis representation.

```typescript
type Axis<T, V> =
  | { kind: 'var'; var: V }    // Type variable (inference only)
  | { kind: 'inst'; value: T }  // Instantiated value
```

**Hard constraints**:
- `AxisTag<T>` (`default`/`instantiated`) is deprecated and MUST NOT be used
- `var` branches MUST NOT escape the frontend boundary into backend/runtime/renderer
- After type solving, all axes are `{ kind: 'inst'; value: ... }`
- Default values are expressed by constructors producing `inst` values, never by a third axis variant
- `var` is NOT "default" — it is an inference variable carrying a typed ID

## Axis Type Specializations

```typescript
type CardinalityAxis = Axis<CardinalityValue, CardinalityVar>;
type TemporalityAxis = Axis<TemporalityValue, TemporalityVar>;
type BindingAxis     = Axis<BindingValue, BindingVar>;
type PerspectiveAxis = Axis<PerspectiveValue, PerspectiveVar>;
type BranchAxis      = Axis<BranchValue, BranchVar>;
```

See [Axes](../axes/) topic for detailed axis value types and semantics.

## Foundational Rules

1. **Every value has a type**: No value-producing node/expr/slot exists without `type: CanonicalType`
2. **Type is sufficient**: No additional "kind" or "family" field is needed — derive from axes
3. **Payload determines stride**: `payloadStride(type.payload)` is the only source of stride information
4. **Unit is semantic**: Unit describes what the numbers mean, not how they're stored
5. **Extent is orthogonal**: The 5 axes are independent dimensions; each can vary independently

---

## See Also

- [Single Authority Principle](../principles/t1_single-authority.md) - Why there's only one type
- [Extent Axes](./t2_extent-axes.md) - Detailed axis structure and defaults
- [Derived Classifications](./t2_derived-classifications.md) - signal/field/event derivation
- [Inference Types](./t2_inference-types.md) - Inference-only wrappers (InferencePayloadType, InferenceCanonicalType)
- [Glossary](../GLOSSARY.md) - Term definitions
