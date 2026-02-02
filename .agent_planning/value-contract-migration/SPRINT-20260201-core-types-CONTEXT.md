# Implementation Context: Core Types Sprint
Generated: 2026-02-01

## Files to Create

| File | Purpose |
|------|---------|
| `src/core/canonical-types/contract.ts` | ValueContract type, constructors, equality, compatibility |

## Files to Modify

| File | Change |
|------|--------|
| `src/core/canonical-types/canonical-type.ts` | Add `contract?: ValueContract` to CanonicalType, update constructors |
| `src/core/canonical-types/equality.ts` | Add contractsEqual, update typesEqual |
| `src/core/canonical-types/index.ts` | Export new contract types and functions |
| `src/core/inference-types.ts` | Add contract to InferenceCanonicalType, update constructors |
| `src/blocks/adapter-spec.ts` | Add contract to TypePattern, update matching logic |

## ValueContract Type Design

```typescript
export type ValueContract =
  | { readonly kind: 'none' }       // No guarantee (default)
  | { readonly kind: 'clamp01' }    // [0,1] clamped
  | { readonly kind: 'wrap01' }     // [0,1) cyclic wrap
  | { readonly kind: 'clamp11' }    // [-1,1] clamped (bipolar)

// Strength ordering for compatibility:
// none < clamp01, wrap01, clamp11 (none is weakest)
// Connecting strong→weak: OK (e.g., clamp01 output → no-contract input)
// Connecting weak→strong: needs adapter (e.g., no-contract → clamp01 input)
// Connecting different strong types: needs adapter (e.g., wrap01 → clamp01)
```

## Constructor API

Option A (positional — matches existing pattern):
```typescript
canonicalType(payload, unit?, extentOverrides?, contract?)
```

Option B (use existing pattern, add contract helper):
```typescript
// Keep canonicalType as-is, add:
function withContract(type: CanonicalType, contract: ValueContract): CanonicalType
```

Recommendation: Option A — consistent with how unit and extent overrides work. But since it's the 4th positional arg, consider if an options object would be cleaner. Check existing usage patterns first.

## Adapter-Spec Integration

Current TypePattern:
```typescript
interface TypePattern {
  payload: PayloadType | 'same' | 'any';
  unit: UnitType | 'same' | 'any';
  extent: ExtentPattern | 'same' | 'any';
}
```

Add:
```typescript
interface TypePattern {
  payload: PayloadType | 'same' | 'any';
  unit: UnitType | 'same' | 'any';
  extent: ExtentPattern | 'same' | 'any';
  contract?: ValueContract | 'same' | 'any'; // optional = don't care
}
```

## Compatibility Function

```typescript
function contractsCompatible(source: ValueContract | undefined, target: ValueContract | undefined): boolean {
  const s = source?.kind ?? 'none';
  const t = target?.kind ?? 'none';

  // Target expects nothing? Always compatible.
  if (t === 'none') return true;

  // Target expects something? Source must provide the same guarantee.
  return s === t;
}
```

This means:
- `clamp01 → none`: OK (dropping guarantee)
- `none → clamp01`: NOT OK (needs Clamp01 adapter)
- `wrap01 → clamp01`: NOT OK (different guarantees, needs adapter)
- `clamp01 → clamp01`: OK (same guarantee)
