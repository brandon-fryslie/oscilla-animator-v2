# Runtime & Enforcement Unimplemented Features - Context

## Spec References

### Runtime Storage Model
From TYPE-SYSTEM-INVARIANTS.md:
```
1. Storage keyed by (ValueExprId, lane) - not separate signal/field/event stores
2. For cardinality one: stride contiguous slots
3. For cardinality many(instance): stride * instanceCount contiguous slots
4. For discrete temporality: stamp buffer: valueStamp[ValueExprId, lane] = lastTickOrFrameWritten
5. No separate evaluateSignal/evaluateField/evaluateEvent - should dispatch based on CanonicalType
6. State storage must be branch-scoped (keyed by branch identity)
7. State storage must respect lane identity for fields
```

### Schedule Steps
From TYPE-SYSTEM-INVARIANTS.md:
```
1. Steps should NOT have hard-coded evalSig/evalField/evalEvent discriminants
2. Should be unified or derived from type
```

## Current Implementation Patterns

### Storage Access Patterns (Good)
```typescript
// Signal write (ScheduleExecutor.ts:96)
state.values.f64[lookup.offset] = value;

// Field write (ScheduleExecutor.ts:309)
state.values.objects.set(step.target, buffer);

// State write (ScheduleExecutor.ts:532)
state.state[step.stateSlot as number] = value;

// Field state write (ScheduleExecutor.ts:562)
state.state[baseSlot + i] = src[i];
```

These show:
- Slot-based addressing (opaque)
- Contiguous layout for fields (baseSlot + i)
- Separate storage banks (f64, objects, state)

### Step Dispatch Pattern (Needs Work)
```typescript
// ScheduleExecutor.ts:213-256
switch (step.kind) {
  case 'evalSig': {
    // Evaluate signal...
  }
  case 'evalEvent': {
    // Evaluate event...
  }
  // ...
}
```

This bypasses CanonicalType dispatch, creating parallel classification.

## Missing Infrastructure

### 1. Branch-Scoped State
No representation of branch identity in state storage:
```typescript
// Current (RuntimeState.ts:498)
state: Float64Array

// Spec requires
state: Map<BranchId, Float64Array>
```

### 2. Stamp Buffers
Event clearing is time-based, not stamp-based:
```typescript
// Current (ScheduleExecutor.ts:166-172)
state.eventScalars.fill(0);
state.events.forEach((payloads) => {
  payloads.length = 0;
});

// Spec requires
state.eventStamps.set(valueExprId, frameId);
// Values remain for debugging, stamps control staleness
```

### 3. Lane Metadata
No explicit lane→slot mapping for fields:
```typescript
// Implied by offset math, but not explicit
const baseSlot = step.stateSlot;
for (let i = 0; i < count; i++) {
  state.state[baseSlot + i] = src[i];
}

// Should have explicit metadata
interface FieldStateLayout {
  valueExprId: ValueExprId;
  baseSlot: number;
  stride: number;
  instanceId: InstanceId;
}
```

## Implementation Dependencies

### For Branch-Scoped State
Requires:
- Branch identity in CanonicalType (✅ exists)
- Branch resolution in schedule steps
- State migration support for branch mapping

### For Stamp Buffers
Requires:
- Event ValueExprId tracking
- Frame ID in runtime state (✅ exists: cache.frameId)
- Consumer updates to check stamps

### For Unified Step Dispatch
Requires:
- ValueExpr unification (in progress)
- Type-driven dispatch helpers
- Removal of evalSig/evalField/evalEvent discriminants

## Next Steps Priority

1. **High**: Unified step dispatch (blocks other work)
2. **High**: Branch-scoped state (architectural change)
3. **Medium**: Stamp buffers (feature enhancement)
4. **Medium**: Lane metadata tracking (robustness)
