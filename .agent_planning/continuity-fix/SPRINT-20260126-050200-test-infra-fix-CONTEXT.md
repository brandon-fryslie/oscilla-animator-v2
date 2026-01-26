# Implementation Context: test-infra-fix

Generated: 2026-01-26T05:02:00

## Files to Modify

### Primary Files

1. **`src/__tests__/runtime-test-helpers.ts`** (lines 133-139)
   - Fix `createMockRuntimeState` signature
   - Current: `(slotCount: number = 100, overrides?: Partial<RuntimeState>)`
   - Target: `(overrides?: Partial<RuntimeState>, slotCount?: number)`

2. **`src/runtime/__tests__/continuity-integration.test.ts`** (lines 383-550)
   - Fix calls to `createMockRuntimeState`
   - Fix `StableTargetId` vs `InstanceId` mismatch
   - Fix `ValueSlot` typing
   - Add null checks for `state.time`

### Supporting Changes

May need to add to `runtime-test-helpers.ts`:
- `testStableTargetId(semantic, instanceId, portName)` - returns properly typed `StableTargetId`
- `testValueSlot(n)` - returns properly typed `ValueSlot`

## Key Code Patterns

### Current (Broken)

```typescript
// runtime-test-helpers.ts
export function createMockRuntimeState(
  slotCount: number = 100,
  overrides?: Partial<RuntimeState>
): RuntimeState {
  const base = createRuntimeState(slotCount);
  return { ...base, ...overrides };
}

// Test usage (WRONG - passes object as first arg)
const state = createMockRuntimeState({
  continuity,
  values: { objects: new Map() },
});
```

### Target (Fixed)

```typescript
// runtime-test-helpers.ts
export function createMockRuntimeState(
  overrides?: Partial<RuntimeState>,
  slotCount: number = 100
): RuntimeState {
  const base = createRuntimeState(slotCount);
  return { ...base, ...overrides };
}

// Test usage (NOW CORRECT)
const state = createMockRuntimeState({
  continuity,
  values: { objects: new Map() },
});
```

## Type Fixes Needed

### StableTargetId

```typescript
// Current (broken)
getOrCreateTargetState(continuity, testInstanceId('custom', 'inst:x'), 3);

// Fixed - need proper StableTargetId
import { computeStableTargetId } from '../ContinuityState';
getOrCreateTargetState(continuity, computeStableTargetId('custom', 'inst', 'x'), 3);
```

### ValueSlot

```typescript
// Current (broken)
baseSlot: valueSlot(0),

// Need to import or create proper helper
import { valueSlot } from '../../compiler/ir/Indices';
// OR
const slot0 = 0 as ValueSlot;
```

## Related Spec Sections

- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/11-continuity-system.md` §3.7 (Crossfade Policy)
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/11-continuity-system.md` §5.1 (Continuity Steps)
