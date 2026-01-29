# Implementation Context: combine-kernels

**Sprint:** combine-kernels - Add Missing Signal Combine Kernels
**Generated:** 2026-01-25

## Key Files

| File | Purpose |
|------|---------|
| `src/runtime/SignalEvaluator.ts` | Add combine kernel cases to `applySignalKernel()` |

## Code Location

**Where to add (line ~454, after 'noise' case, before vec2 kernels):**
```typescript
// === NOISE (deterministic, seed-based) ===

case 'noise': {
  // ... existing code ...
}

// ADD HERE: === COMBINE KERNELS ===

// vec2 kernels not supported at signal level
case 'polarToCartesian':
```

## Implementation

```typescript
// === COMBINE KERNELS (multi-input signal combination) ===

case 'combine_sum': {
  return values.reduce((a, b) => a + b, 0);
}

case 'combine_average': {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

case 'combine_max': {
  if (values.length === 0) return -Infinity;
  return Math.max(...values);
}

case 'combine_min': {
  if (values.length === 0) return Infinity;
  return Math.min(...values);
}

case 'combine_last': {
  if (values.length === 0) return 0;
  return values[values.length - 1];
}
```

## Why These Semantics

| Mode | Identity | Semantics |
|------|----------|-----------|
| `sum` | 0 | Additive combination of all inputs |
| `average` | 0 | Arithmetic mean of inputs |
| `max` | -Infinity | Maximum wins (standard math identity) |
| `min` | Infinity | Minimum wins (standard math identity) |
| `last` | 0 | Last writer wins (order-dependent) |

## Related Code

**Producer:** `IRBuilderImpl.sigCombine()` at line 173 creates kernels as:
```typescript
const fn: PureFn = { kind: 'kernel', name: `combine_${mode}` };
```

**Consumer:** `SignalEvaluator.applySignalKernel()` at line 225 dispatches:
```typescript
case 'kernel':
  return applySignalKernel(fn.name, values);
```
