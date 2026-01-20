# Plan: Implement Correct Project Policy

## Problem Summary

The `project` policy for position continuity is still causing visual drift when domain count changes (e.g., increasing then decreasing element count). The spiral animation that should return to its original shape instead becomes distorted with particles pushed outward.

## Root Cause Analysis

After re-reading the spec (§2.5, §3, §3.6), I now understand the issue:

### What the Spec Says

1. **`project` policy** (spec §2.2, §3): "Topology-aware continuity. Map old elements to new elements by stable ID, then apply post-processing (usually slew)."

2. **Gauge initialization at boundary** (spec §2.5):
   ```typescript
   // Using mapping i_old = map(i_new):
   for (let i_new = 0; i_new < newCount; i_new++) {
     const i_old = mapping.newToOld[i_new];
     if (i_old >= 0) {
       // Mapped: preserve old effective value
       Δ[i_new] = X_old_eff[i_old] - X_new_base[i_new];
     } else {
       // Unmapped (new element): start at base
       Δ[i_new] = 0;
     }
   }
   ```

3. **For slew** (spec §4.1): The slew filter target is the **post-gauge base** (base + Δ):
   > "Where `target[i]` is the post-gauge base (or new base, depending on policy)"

### Current Bug

The current implementation for `project` policy:
- Clears gauge to zero on domain change
- Slews toward base values only

This means on domain change:
- Slew buffer has OLD positions
- Target is NEW base positions
- Particles slew from old to new positions over 120ms

**This is wrong!** For mapped elements, the particles should maintain their old positions (no visible change at the boundary), then gradually transition to their new base positions.

### Correct Behavior

For `project` policy with `post: 'slew'`:

1. **At domain change boundary**:
   - For **mapped elements**: Initialize gauge so `base + gauge = old_effective` (no discontinuity)
   - For **new elements**: Initialize gauge = 0 (start at base)
   - Initialize slew buffer to `base + gauge` (the effective value)

2. **On each frame**:
   - Apply gauge: `gauged = base + gauge`
   - Slew toward `gauged` value
   - **Decay the gauge over time** so particles gradually transition to base positions

Wait - re-reading more carefully, the spec says slew target is "post-gauge base". Let me reconsider...

Actually, looking at §4.1 again:
> "Where `target[i]` is the post-gauge base (or new base, depending on policy)"

For `project`, the gauge should be **permanent** (like `preserve`) but with slew smoothing. The key insight from §2.5:
> "Inject gauge offset so effective value is continuous, **then hold it forever**" (for preserve)

But for `project + post:slew`, I believe:
- Gauge is computed at domain change to preserve continuity
- Slew smooths transitions to the gauged values
- The gauge does NOT decay - it's permanent

Let me re-read the spec one more time to confirm...

Actually, I think the confusion is that there are TWO different scenarios:

**Scenario A: Parameter change (no domain change)**
- Base values change (e.g., radius slider moved)
- No element mapping needed
- Slew smoothly transitions from old effective to new target

**Scenario B: Domain change (count changes)**
- Elements are mapped by ID
- Gauge is initialized to preserve effective positions
- Then slew smooths any transitions

The current bug seems to be that we're NOT initializing gauge correctly for `project` policy.

## The Real Fix

Looking at the current code again:

```typescript
if (policy.kind === 'project') {
  // Project: Clear gauge - slew alone handles the transition
  targetState.gaugeBuffer.fill(0);
}
```

This is WRONG. For `project` policy, we should STILL compute the gauge to preserve continuity, just like `preserve` and `slew` policies. The difference is:
- `preserve`: gauge only, no slew
- `slew`: gauge + slew toward gauged values
- `project`: gauge + slew toward gauged values (same as slew, but uses element mapping)

The `project` case should NOT clear gauge to zero!

## Implementation Plan

### Step 1: Fix `project` policy domain change handling

In `ContinuityApply.ts`, change:

```typescript
if (policy.kind === 'project') {
  // Project: Clear gauge - slew alone handles the transition
  targetState.gaugeBuffer.fill(0);
}
```

To:

```typescript
// For ALL policies that use gauge (preserve, slew, project):
// Initialize gauge to preserve effective values at boundary
initializeGaugeOnDomainChange(
  oldEffective,
  baseBuffer,
  targetState.gaugeBuffer,
  mapping,
  elementCount,
  stride
);
```

### Step 2: Fix `project` policy execution

Current (WRONG):
```typescript
case 'project':
  applySlewFilter(
    baseBuffer,         // Target: base values (no gauge offset)
    ...
  );
```

Should be (CORRECT):
```typescript
case 'project':
  // Apply gauge: gauged = base + gauge
  applyAdditiveGauge(baseBuffer, targetState.gaugeBuffer, outputBuffer, bufferLength);
  // Slew toward gauged values
  applySlewFilter(
    outputBuffer,       // Target: gauged values (base + gauge)
    targetState.slewBuffer,
    outputBuffer,
    policy.tauMs,
    dtMs,
    bufferLength
  );
```

### Step 3: Verify the fix

Run tests and manually verify:
1. Start animation with N elements
2. Increase count to M > N
3. Decrease count back to N
4. Animation should look identical to step 1

## Files to Modify

1. `src/runtime/ContinuityApply.ts` - Fix domain change handling and execution for `project` policy

## DoD (Definition of Done)

- [ ] `project` policy initializes gauge on domain change (not clears it)
- [ ] `project` policy execution applies gauge then slew
- [ ] All existing tests pass
- [ ] Manual verification: changing count back and forth preserves animation shape
