# Sprint Plan: Contract Hardening

**Sprint ID:** signal-kernel-phase2-sprint1
**Created:** 2026-01-21
**Confidence:** HIGH

## Goal

Harden signal kernel contracts by adding proper input normalization and edge case handling. This implements the remaining recommendations from `6-signal-kernel.md`.

## Tasks

### 1. Add Helper Functions

Add at top of `applySignalKernel` in `SignalEvaluator.ts`:

```typescript
function wrapPhase(p: number): number {
  const t = p - Math.floor(p);
  return t; // ∈ [0,1)
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
```

### 2. Apply wrapPhase to Trig Oscillators

Update `oscSin`, `oscCos`, `oscTan` to wrap phase:

```typescript
case 'oscSin': {
  if (values.length !== 1) {
    throw new Error(`Signal kernel 'oscSin' expects 1 input, got ${values.length}`);
  }
  const p = wrapPhase(values[0]);
  return Math.sin(p * 2 * Math.PI);
}
```

### 3. Apply clamp01 to Easing Functions

Update all easing functions to clamp input:

```typescript
case 'easeInQuad': {
  if (values.length !== 1) {
    throw new Error(`Signal kernel 'easeInQuad' expects 1 input, got ${values.length}`);
  }
  const t = clamp01(values[0]);
  return t * t;
}
```

Affected functions:
- easeInQuad, easeOutQuad, easeInOutQuad
- easeInCubic, easeOutCubic, easeInOutCubic  
- easeInElastic, easeOutElastic, easeOutBounce

### 4. Fix smoothstep Edge Case

Handle division by zero when edge0 === edge1:

```typescript
case 'smoothstep': {
  if (values.length !== 3) {
    throw new Error(`Signal kernel 'smoothstep' expects 3 inputs, got ${values.length}`);
  }
  const edge0 = values[0], edge1 = values[1], x = values[2];
  if (edge0 === edge1) return x < edge0 ? 0 : 1; // Handle degenerate case
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
```

## Files to Modify

1. `src/runtime/SignalEvaluator.ts` - Add helpers, update kernels

## Testing

- Run existing tests: `pnpm test --grep kernel`
- Add edge case tests for:
  - Phase values > 1 (should wrap)
  - Phase values < 0 (should wrap)
  - Easing t < 0 (should clamp to 0)
  - Easing t > 1 (should clamp to 1)
  - smoothstep with edge0 === edge1

## Definition of Done

- [ ] wrapPhase helper added
- [ ] clamp01 helper added
- [ ] oscSin/oscCos/oscTan use wrapPhase
- [ ] All 9 easing functions use clamp01
- [ ] smoothstep handles edge0===edge1
- [ ] All existing tests pass
- [ ] Edge case tests added
