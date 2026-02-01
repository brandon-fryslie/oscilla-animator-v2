# Core Type System - To Review

These are implementation differences that may be improvements over the spec.

## 1. InstanceRef field naming

**Spec requirement**:
```typescript
export interface InstanceRef {
  readonly instanceId: InstanceId;
  readonly domainTypeId: DomainTypeId;
}
```

**Current state**: src/core/canonical-types.ts:790-793
```typescript
export interface InstanceRef {
  readonly domainTypeId: DomainTypeId;
  readonly instanceId: InstanceId;
}
```

**Classification rationale**: The implementation reverses the field order (domainTypeId first, then instanceId). This matches the common pattern of "type before instance" and may be more intuitive. The order doesn't affect functionality or serialization.

**Impact**: None. Field order in TypeScript interfaces doesn't affect runtime behavior.

**Recommendation**: Keep current implementation. It's arguably better (type-then-instance is more natural).

---

## 2. UnitType structure - 8 structured kinds vs 5 simple

**Spec requirement** (from design-docs/canonical-types/00-exhaustive-type-system.md):
```typescript
export type UnitType =
  | { readonly kind: 'none' }
  | { readonly kind: 'scalar' }
  | { readonly kind: 'norm01' }
  | { readonly kind: 'angle'; readonly unit: 'radians' | 'degrees' | 'phase01' }
  | { readonly kind: 'time'; readonly unit: 'ms' | 'seconds' };
```

**Current state**: src/core/canonical-types.ts:53-61
```typescript
export type UnitType =
  | { readonly kind: 'none' }
  | { readonly kind: 'scalar' }
  | { readonly kind: 'norm01' }
  | { readonly kind: 'count' }
  | { readonly kind: 'angle'; readonly unit: 'radians' | 'degrees' | 'phase01' }
  | { readonly kind: 'time'; readonly unit: 'ms' | 'seconds' }
  | { readonly kind: 'space'; readonly unit: 'ndc' | 'world' | 'view'; readonly dims: 2 | 3 }
  | { readonly kind: 'color'; readonly unit: 'rgba01' };
```

**Classification rationale**: The implementation adds 4 structured unit kinds not in the minimal spec:
- `count` (for integer counts/indices)
- `space` (for spatial coordinates with dims)
- `color` (for RGBA color values)

These additions are well-motivated and match the comment header:
> "Restructured to 8 structured kinds (items #18, #19): Simple: none, scalar, norm01, count / Structured: angle, time, space, color"

The spec may be showing a minimal set, while the implementation is more complete.

**Impact**: Positive. More precise unit tracking.

**Recommendation**: Keep current implementation. It's a strict improvement over the minimal spec. Update spec to document these additions as canonical.

---

## 3. Perspective/Branch use generic 'specific' variant instead of named variants

**Spec v1+ design**:
```typescript
type PerspectiveValue =
  | { kind: 'default' }
  | { kind: 'world' }
  | { kind: 'view'; viewId: ViewId }
  | { kind: 'screen'; screenId: ScreenId };
```

**Current implementation**:
```typescript
export type PerspectiveValue =
  | { readonly kind: 'default' }
  | { readonly kind: 'specific'; readonly instance: InstanceRef };
```

**Classification rationale**: The implementation uses a generic extensibility pattern (specific + InstanceRef) instead of hardcoding all future variants. This is more flexible and aligns with the InstanceRef-based design elsewhere in the system.

**Impact**: Neutral to positive. The generic pattern is more extensible.

**Recommendation**: TO-REVIEW with user. The generic pattern may be better, but the spec's named variants are more self-documenting. Consider hybrid: keep specific pattern but add type guards/helpers for common cases (isWorldPerspective, isViewPerspective, etc.) when v1+ lands.

---

## Summary

All TO-REVIEW items are implementation choices that differ from spec but may be improvements:
1. Field ordering (minor, keep current)
2. Extended unit types (major improvement, keep current, update spec)
3. Generic specific pattern for perspective/branch (extensibility vs explicitness tradeoff, user decision needed)
