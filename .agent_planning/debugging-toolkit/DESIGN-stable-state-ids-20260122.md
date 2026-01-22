# Design: Stable StateId System for Stateful Primitives

## Problem

Currently, stateful primitives (UnitDelay, and future Lag/Slew/Phasor) allocate state slots using a positional counter:

```typescript
allocStateSlot(initialValue: number = 0): StateSlotId {
  const id = stateSlotId(this.stateSlotCounter++);
  this.stateSlots.push({ initialValue });
  return id;
}
```

This means if you add a block before an existing stateful block, all state slot indices shift and state gets silently scrambled on hot-swap.

## Solution

**Stable StateId** = semantic identity that survives recompilation.

For scalar state: `StateId = blockId + stateKind`
For field state: `StateId = blockId + stateKind` (tied to an InstanceId)

The lane index is NOT part of StateId - lanes are remapped using continuity's mapping service.

## Types

```typescript
// Branded stable state ID (semantic, survives recompile)
export type StableStateId = string & { readonly __brand: 'StableStateId' };

export function stableStateId(blockId: string, stateKind: string): StableStateId {
  return `${blockId}:${stateKind}` as StableStateId;
}

// Scalar state mapping (signal cardinality)
export interface StateMappingScalar {
  stateId: StableStateId;
  slotIndex: number;         // positional, changes each compile
  stride: number;            // floats per state element (usually 1)
  initial: number[];         // length = stride
}

// Field state mapping (many cardinality)
export interface StateMappingField {
  stateId: StableStateId;
  instanceId: InstanceId;    // which lane set this tracks
  slotStart: number;         // start offset (positional)
  laneCount: number;         // N at compile time
  stride: number;            // floats per lane
  initial: number[];         // per-lane init template (length = stride)
}

export type StateMapping = StateMappingScalar | StateMappingField;
```

## IRBuilder Changes

```typescript
// NEW signature
allocStateSlot(
  stableId: StableStateId,
  options: {
    initialValue?: number;
    stride?: number;
    // For field state:
    instanceId?: InstanceId;
    laneCount?: number;
  }
): StateSlotId;
```

## Block Usage

```typescript
// UnitDelay (scalar)
const stateSlot = ctx.b.allocStateSlot(
  stableStateId(ctx.instanceId, 'delay'),  // ctx.instanceId IS the blockId
  { initialValue }
);

// Future: FieldSlewFilter (field)
const stateSlot = ctx.b.allocStateSlot(
  stableStateId(ctx.instanceId, 'slew'),
  {
    initialValue: 0,
    instanceId: ctx.inferredInstance,
    laneCount: instanceCount
  }
);
```

## Compiler Output

The compiled program includes a state mapping table:

```typescript
interface ScheduleIR {
  // ... existing fields ...
  stateMappings: StateMapping[];  // NEW
}
```

## Hot-Swap Migration

On recompile:

1. Build lookup: `oldMappings: Map<StableStateId, StateMapping>`
2. For each new StateMapping:
   - Look up old mapping by StableStateId
   - If not found → new state, initialize with defaults
   - If found and scalar → copy `oldState[oldSlot]` → `newState[newSlot]`
   - If found and field:
     - Get lane mapping from continuity service for this instanceId
     - For each new lane: copy from mapped old lane, or init default if -1

## Integration with Continuity Mapping Service

The continuity mapping service already provides:
```typescript
function buildMappingById(oldDomain, newDomain): MappingState {
  // Returns newToOld: Int32Array where newToOld[i] = old lane index or -1
}
```

State migration reuses this:
```typescript
function migrateFieldState(
  oldState: Float32Array,
  newState: Float32Array,
  mapping: MappingState,
  stride: number,
  initial: number[]
): void {
  if (mapping.kind === 'identity') {
    // Direct copy
    newState.set(oldState.subarray(0, Math.min(oldState.length, newState.length)));
    // Init any new lanes
    for (let i = oldState.length / stride; i < newState.length / stride; i++) {
      for (let s = 0; s < stride; s++) {
        newState[i * stride + s] = initial[s];
      }
    }
  } else {
    // Use mapping
    const newToOld = mapping.newToOld;
    for (let i = 0; i < newToOld.length; i++) {
      const oldIdx = newToOld[i];
      if (oldIdx >= 0) {
        for (let s = 0; s < stride; s++) {
          newState[i * stride + s] = oldState[oldIdx * stride + s];
        }
      } else {
        for (let s = 0; s < stride; s++) {
          newState[i * stride + s] = initial[s];
        }
      }
    }
  }
}
```

## Files to Modify

1. `src/compiler/ir/types.ts` - Add StableStateId, StateMapping types
2. `src/compiler/ir/IRBuilder.ts` - Update allocStateSlot signature
3. `src/compiler/ir/IRBuilderImpl.ts` - Implement new allocStateSlot
4. `src/compiler/passes-v2/pass7-schedule.ts` - Emit stateMappings
5. `src/blocks/signal-blocks.ts` - Update UnitDelay to use StableStateId
6. `src/runtime/RuntimeState.ts` - Store state by StableStateId (or keep array with migration)
7. `src/main.ts` - Add state migration on hot-swap

## Implementation Order

1. Add types to `ir/types.ts`
2. Update IRBuilder interface and implementation
3. Update UnitDelay block
4. Add stateMappings to ScheduleIR
5. Add migration logic to hot-swap path
6. Write tests

## Open Questions

1. Should we store state as `Map<StableStateId, Float32Array>` or keep the current `Float64Array` with migration?
   - Recommendation: Keep array for performance, migrate by index. The StateMapping table provides the stable↔positional translation.

2. How to handle stride > 1 for state read/write?
   - Current: single float per state slot
   - Future: could support multi-float state (e.g., filter with y and dy)
   - For now: stride=1 is sufficient, can extend later
