# Sprint: core-types - Implementation Context

**Sprint**: core-types
**Generated**: 2026-01-29T01:20:28Z

---

## Reference Code (Copy From Spec)

### Axis Type (00-exhaustive-type-system.md lines 65-67)

```typescript
export type Axis<T, V> =
    | { readonly kind: 'var'; readonly var: V }
    | { readonly kind: 'inst'; readonly value: T };
```

### Axis Type Aliases (00-exhaustive-type-system.md lines 69-73)

```typescript
export type CardinalityAxis   = Axis<CardinalityValue, CardinalityVarId>;
export type TemporalityAxis   = Axis<TemporalityValue, TemporalityVarId>;
export type BindingAxis       = Axis<BindingValue, BindingVarId>;
export type PerspectiveAxis   = Axis<PerspectiveValue, PerspectiveVarId>;
export type BranchAxis        = Axis<BranchValue, BranchVarId>;
```

### InstanceRef (00-exhaustive-type-system.md lines 79-82)

```typescript
export interface InstanceRef {
  readonly instanceId: InstanceId;
  readonly domainTypeId: DomainTypeId;
}
```

### PerspectiveValue/BranchValue (00-exhaustive-type-system.md lines 103-107)

```typescript
export type PerspectiveValue =
  | { readonly kind: 'default' };

export type BranchValue =
  | { readonly kind: 'default' };
```

### Extent (00-exhaustive-type-system.md lines 113-119)

```typescript
export interface Extent {
    readonly cardinality: CardinalityAxis;
    readonly temporality: TemporalityAxis;
    readonly binding: BindingAxis;
    readonly perspective: PerspectiveAxis;
    readonly branch: BranchAxis;
}
```

### Default Constants (00-exhaustive-type-system.md lines 169-171)

```typescript
const DEFAULT_BINDING: BindingValue = { kind: 'unbound' };
const DEFAULT_PERSPECTIVE: PerspectiveValue = { kind: 'default' };
const DEFAULT_BRANCH: BranchValue = { kind: 'default' };
```

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `src/core/canonical-types.ts` | Replace AxisTag, add aliases, fix InstanceRef, fix value types |
| `src/core/ids.ts` | Verify VarId types exist (they do) |

---

## Migration Notes

### axisDefault() → axisInst(defaultValue)

Every call to `axisDefault()` must become either:
1. `axisInst(DEFAULT_CARDINALITY)` — for concrete default
2. `axisVar(cardinalityVarId('my-var'))` — for type variable

### axisInstantiated(value) → axisInst(value)

Simple rename.

### AxisTag<T> → Axis<T, VarIdType>

The second type parameter is the variable ID type. Each axis has its own.

---

## Affected Downstream Code

After this sprint, the following will have type errors that require updates:
- All files that call `axisDefault()`
- All files that call `axisInstantiated()`
- All files that construct `InstanceRef`
- All files that reference `Extent` (if they access axis fields)
