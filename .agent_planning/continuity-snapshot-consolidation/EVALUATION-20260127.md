# Evaluation: Consolidate buffer snapshot capture logic in ContinuityApply

**Topic:** oscilla-animator-v2-cs8
**Date:** 2026-01-27
**Verdict:** CONTINUE

## Context

The bead describes a consolidation opportunity in `src/runtime/ContinuityApply.ts:335-390` (actually lines 301-390 based on code review) where buffer snapshots are captured at multiple points to prevent data loss when `getOrCreateTargetState()` allocates new buffers.

## Current State Analysis

### Problem Statement

The `applyContinuity()` function captures buffer snapshots at three different points:

1. **Lines 312-318**: Capture `oldSlewSnapshot` and `oldGaugeSnapshot` before `getOrCreateTargetState()` when buffer SIZE changes
2. **Lines 342-350**: Capture `oldEffectiveSnapshot` for crossfade blending
3. **Lines 355-366**: Use snapshots in domain change handling (with ternary fallback chains)

The core issue is that `getOrCreateTargetState()` at line 322 may allocate NEW zero-filled buffers when the element count changes, destroying the old values we need for continuity calculations.

### Why Multiple Capture Points Exist

1. **Timing constraint**: We must capture old values BEFORE calling `getOrCreateTargetState()` because that call may allocate new buffers
2. **Size change detection**: We only need snapshots when `existingTargetState.count !== bufferLength`
3. **Policy-specific needs**: Different policies (crossfade vs project/slew/preserve) use snapshots differently

### Current Code Structure

```
applyContinuity():
├── Check if existingTargetState exists
├── IF buffer size changed:
│   ├── Snapshot oldSlewSnapshot (line 316)
│   └── Snapshot oldGaugeSnapshot (line 317)
├── Call getOrCreateTargetState() (may zero buffers)
├── IF newly created target (no previous state):
│   └── Initialize slew/gauge from base
├── Get mapping
├── IF domainChangeThisFrame && hadPreviousState:
│   └── Compute oldEffectiveSnapshot (with ternary fallback)
├── IF domainChangeThisFrame && policy != crossfade:
│   ├── Compute oldEffective (with ternary fallback)
│   ├── Compute oldSlew (with ternary fallback)
│   ├── Call initializeGaugeOnDomainChange()
│   └── Call initializeSlewWithMapping()
└── Apply policy (none/preserve/slew/project/crossfade)
```

### The Ternary Fallback Chains (Lines 345-366)

```typescript
// Line 345-349: For crossfade oldEffectiveSnapshot
oldEffectiveSnapshot = oldSlewSnapshot ?? (
  existingTargetState!.slewBuffer.length > 0
    ? new Float32Array(existingTargetState!.slewBuffer)
    : null
);

// Lines 357-366: For non-crossfade policies
const oldEffective = oldSlewSnapshot ?? (
  targetState.slewBuffer.length > 0 && targetState.slewBuffer.length <= bufferLength
    ? new Float32Array(targetState.slewBuffer)
    : null
);
const oldSlew = oldSlewSnapshot ?? (
  targetState.slewBuffer.length > 0
    ? new Float32Array(targetState.slewBuffer)
    : null
);
```

These ternaries handle two cases:
1. **Size changed**: Use pre-captured snapshot (`oldSlewSnapshot`)
2. **Size unchanged**: Copy current buffer (safe because `getOrCreateTargetState` didn't reallocate)

### Risk Assessment

**HIGH RISK** - The bead correctly identifies this as high-risk work:

1. **Data loss on incorrect ordering**: If we capture snapshots after `getOrCreateTargetState()` when size changed, we get zeros
2. **Continuity invariant**: Mapped elements MUST maintain their visual position at domain change boundary
3. **Test coverage**: Tests explicitly verify boundary behavior with different count transitions

## Consolidation Opportunities

### Option A: Extract to a "CaptureContext" helper

Create a single capture point that captures ALL potentially needed snapshots before `getOrCreateTargetState()`:

```typescript
interface CaptureContext {
  oldSlewSnapshot: Float32Array | null;
  oldGaugeSnapshot: Float32Array | null;
  hadPreviousState: boolean;
  sizeChanged: boolean;
}

function capturePreAllocationState(
  continuity: ContinuityState,
  targetId: StableTargetId,
  newBufferLength: number
): CaptureContext { ... }
```

**Pros:**
- Single capture point, easy to reason about
- Encapsulates the "must capture before allocation" invariant
- Reduces duplication of snapshot logic

**Cons:**
- May capture snapshots that aren't needed (minor memory overhead)
- Introduces a new type and function

### Option B: Refactor getOrCreateTargetState to preserve old buffers

Modify `getOrCreateTargetState()` to return the old buffers when reallocating:

```typescript
interface TargetStateWithOld {
  state: TargetContinuityState;
  oldSlewBuffer: Float32Array | null;
  oldGaugeBuffer: Float32Array | null;
}
```

**Pros:**
- Eliminates need for external snapshotting
- Makes the invariant impossible to violate

**Cons:**
- Changes API contract
- Adds memory overhead (keeping old buffers around)
- Multiple call sites would need updating

### Option C: Inline snapshot selection (remove ternaries)

Keep the current structure but simplify the ternary fallback into explicit if/else:

```typescript
let oldEffective: Float32Array | null;
if (sizeChanged) {
  oldEffective = oldSlewSnapshot;
} else if (hadPreviousState && targetState.slewBuffer.length > 0) {
  oldEffective = new Float32Array(targetState.slewBuffer);
} else {
  oldEffective = null;
}
```

**Pros:**
- Minimal change, lower risk
- More readable than nested ternaries
- Preserves existing behavior exactly

**Cons:**
- Doesn't fundamentally consolidate the logic
- Still multiple snapshot variables

## Recommendation

**Option A (CaptureContext helper)** is the best balance of consolidation and safety:

1. Single point of capture enforces the "before allocation" invariant
2. Helper function can be unit tested independently
3. Reduces cognitive load in the main `applyContinuity()` function
4. The ternary fallback chains can be eliminated since CaptureContext always captures when needed

## Unknowns to Resolve

1. **Is oldGaugeSnapshot actually used?** - Need to verify if gauge snapshot is needed anywhere. Looking at the code, only `oldSlewSnapshot` is referenced after the initial capture. The gauge is recomputed from base, not preserved.

2. **Performance impact of always capturing** - Snapshot creation involves `new Float32Array()`. For large buffers (many elements), this could add GC pressure. Need to measure.

## Dependencies

None identified. This is a self-contained refactor of ContinuityApply.ts.

## Risks

1. **Regression in continuity behavior**: The test suite (`project-policy-domain-change.test.ts`) explicitly tests boundary behavior. All tests must pass.
2. **Subtle timing bugs**: The ordering of snapshot capture relative to `getOrCreateTargetState()` is critical.
3. **Policy-specific edge cases**: Different policies (crossfade vs project) use snapshots differently.
