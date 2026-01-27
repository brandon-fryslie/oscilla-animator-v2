# Implementation Context: snapshot-consolidation

**Sprint:** Consolidate Buffer Snapshot Capture Logic
**Date:** 2026-01-27

## Key Files

| File | Purpose |
|------|---------|
| `src/runtime/ContinuityApply.ts` | Main file to modify - contains applyContinuity() |
| `src/runtime/ContinuityState.ts` | Contains getOrCreateTargetState() that triggers the issue |
| `src/runtime/__tests__/project-policy-domain-change.test.ts` | Primary test suite for this behavior |
| `src/runtime/__tests__/continuity-integration.test.ts` | Additional continuity tests |

## The Core Problem

When `getOrCreateTargetState()` is called and the buffer size has changed, it creates NEW zero-filled buffers, destroying the old values. The continuity system needs those old values to compute gauge offsets (preserving visual position at domain change boundary).

### Before getOrCreateTargetState()
```
existingTargetState.slewBuffer = [0.5, 0.5, 0.3, 0.3, 0.7, 0.7]  // 3 elements, vec2
existingTargetState.count = 6
```

### After getOrCreateTargetState() when count changes to 8
```
newTargetState.slewBuffer = [0, 0, 0, 0, 0, 0, 0, 0]  // 4 elements, ALL ZEROS!
newTargetState.count = 8
```

The solution is to snapshot the old buffer BEFORE calling getOrCreateTargetState().

## Current Snapshot Logic (Lines 301-390)

```typescript
// Line 302-303: Check if state exists
const existingTargetState = state.continuity.targets.get(targetId);
const hadPreviousState = existingTargetState !== undefined;

// Lines 312-318: Capture snapshot BEFORE reallocation
let oldSlewSnapshot: Float32Array | null = null;
let oldGaugeSnapshot: Float32Array | null = null;  // <-- UNUSED!
if (hadPreviousState && existingTargetState!.count !== bufferLength) {
  oldSlewSnapshot = new Float32Array(existingTargetState!.slewBuffer);
  oldGaugeSnapshot = new Float32Array(existingTargetState!.gaugeBuffer);
}

// Line 322: This may reallocate and zero buffers!
const targetState = getOrCreateTargetState(state.continuity, targetId, bufferLength);

// Lines 342-350: Later use of snapshot (with fallback)
if (state.continuity.domainChangeThisFrame && hadPreviousState) {
  oldEffectiveSnapshot = oldSlewSnapshot ?? (
    existingTargetState!.slewBuffer.length > 0
      ? new Float32Array(existingTargetState!.slewBuffer)
      : null
  );
}

// Lines 355-366: More fallback chains
const oldEffective = oldSlewSnapshot ?? (
  targetState.slewBuffer.length > 0 && targetState.slewBuffer.length <= bufferLength
    ? new Float32Array(targetState.slewBuffer)
    : null
);
```

## Proposed CaptureContext Design

```typescript
/**
 * Context captured BEFORE getOrCreateTargetState() to preserve old buffer values.
 * This is necessary because getOrCreateTargetState() may allocate new zero-filled
 * buffers when the element count changes.
 */
export interface CaptureContext {
  /** Snapshot of slew buffer before reallocation (null if no prior state or size unchanged) */
  oldSlewSnapshot: Float32Array | null;
  /** Whether target state existed before this call */
  hadPreviousState: boolean;
  /** Whether buffer size is changing (triggers reallocation) */
  sizeChanged: boolean;
}

/**
 * Capture state before calling getOrCreateTargetState().
 * MUST be called BEFORE getOrCreateTargetState() to avoid data loss.
 */
export function capturePreAllocationState(
  continuity: ContinuityState,
  targetId: StableTargetId,
  newBufferLength: number
): CaptureContext {
  const existingState = continuity.targets.get(targetId);
  const hadPreviousState = existingState !== undefined;
  const sizeChanged = hadPreviousState && existingState!.count !== newBufferLength;

  return {
    oldSlewSnapshot: sizeChanged ? new Float32Array(existingState!.slewBuffer) : null,
    hadPreviousState,
    sizeChanged,
  };
}
```

## Why oldGaugeSnapshot Is Unused

Looking at `initializeGaugeOnDomainChange()` (lines 371-378):
```typescript
initializeGaugeOnDomainChange(
  oldEffective,      // Uses oldSlewSnapshot, not oldGaugeSnapshot!
  baseBuffer,
  targetState.gaugeBuffer,
  mapping,
  elementCount,
  stride
);
```

The gauge is RECOMPUTED from old effective values (slew buffer), not preserved from old gauge. The formula is:
```
gauge_new[i] = old_effective[mapped_i] - base_new[i]
```

This preserves the visual position: `effective_new = base_new + gauge_new = old_effective`

So `oldGaugeSnapshot` was likely added "just in case" but is actually dead code.

## Test Strategy

All existing tests in `project-policy-domain-change.test.ts` test the exact scenarios where this code matters:

1. `mapped elements maintain position at domain change boundary` - Tests gauge initialization
2. `applyContinuity preserves position at domain change boundary` - Integration test
3. `handles decrease in element count` - Tests size decrease path
4. `round-trip domain change preserves original animation shape` - Multi-frame integration
5. `project policy gauge decays to zero over time` - Tests gauge decay

**No new tests needed** - the existing tests comprehensively cover the behavior. The refactor must pass all tests unchanged.

## Implementation Order

1. **P0 first**: Remove dead code (oldGaugeSnapshot) - smallest change, validates understanding
2. **P1 second**: Create CaptureContext - adds new code, doesn't change existing
3. **P2 third**: Integrate CaptureContext into applyContinuity() - biggest change
4. **P3 last**: Simplify ternaries - cosmetic improvement after P2

Each step should be separately testable (`npm run test` after each step).
