# Plan: Fix Debug Slot Error + Field Data Visualization MVP

**Date**: 2026-01-22
**Status**: APPROVED (conditional: single sprint, demand-driven tracking)
**Priority**: P1 (bug fix + feature)

## Problem Statement

### The Bug
```
[DebugService.getEdgeValue] Slot 18 for edge 'e11' has no value.
Runtime has started but this slot was never written to - this is a scheduling bug.
```

### Root Cause
CardinalityGeneric blocks specialized to Field cardinality get slots allocated in `debugIndex`, but no `materialize` step is scheduled for those slots (only render-connected fields get materialized). The DebugService maps the edge, runtime starts, slot is never written → throws.

### Design Constraint (User Requirement)
- The error MUST still throw for **debug-tracked** fields with no data (true scheduling bug)
- A field is "debug-tracked" if: (a) user is hovering over it with debug on, OR (b) inspector is open for the field with debug on
- Non-tracked field edges return a "not tracked" status (no throw, no crash)
- **One sprint** — no phased delivery

## Solution: Demand-Driven Field Debug Tracking

### Architecture

```
UI (hover/inspect) → DebugService.trackField(slotId) → trackedFieldSlots Set
                                                              ↓
Runtime (each frame) → checks trackedFieldSlots → materializes only tracked fields
                                                              ↓
                       → recordFieldValue(slot, buffer) → DebugService stores buffer
                                                              ↓
UI query → getEdgeValue(edgeId)
  - signal: return value (unchanged)
  - field + tracked + has value: return FieldValueResult
  - field + tracked + no value: THROW (scheduling bug)
  - field + not tracked: return { kind: 'field-untracked' }
```

### Key Design Decisions

1. **Demand-driven materialization**: Fields are only materialized when actively tracked. Zero overhead when not debugging fields.
2. **Throw preserved for tracked fields**: If user explicitly tracks a field and it has no data, that's a real bug — throw as before.
3. **Graceful degradation for untracked**: Non-tracked field edges don't crash, they show "hover to inspect" in UI.
4. **DebugService owns tracking state**: Single source of truth for which fields are tracked.

## Implementation Steps

### Step 1: Add Cardinality to EdgeMetadata

**Files**: `src/services/mapDebugEdges.ts`

Use port binding's `domain` field (already in `PortBindingIR`) to tag edge metadata with cardinality.

```typescript
interface EdgeMetadata {
  slotId: ValueSlot;
  type: CanonicalType;
  cardinality: 'signal' | 'field';  // NEW
}
```

### Step 2: Update DebugService — Tracked Fields + Discriminated Results

**File**: `src/services/DebugService.ts`

1. Add tracking set and field buffer storage:
```typescript
private trackedFieldSlots = new Set<ValueSlot>();
private fieldBuffers = new Map<ValueSlot, Float32Array>();
```

2. Add tracking API:
```typescript
trackField(slotId: ValueSlot): void
untrackField(slotId: ValueSlot): void
isFieldTracked(slotId: ValueSlot): boolean
getTrackedFieldSlots(): ReadonlySet<ValueSlot>
```

3. Make `EdgeValueResult` a discriminated union:
```typescript
export type EdgeValueResult =
  | { kind: 'signal'; value: number; slotId: ValueSlot; type: CanonicalType }
  | { kind: 'field'; count: number; min: number; max: number; mean: number; first: number; slotId: ValueSlot; type: CanonicalType }
  | { kind: 'field-untracked'; slotId: ValueSlot; type: CanonicalType };
```

4. Update `getEdgeValue` logic:
- Signal: unchanged behavior
- Field + tracked + has value: return FieldValueResult with stats
- Field + tracked + no value after runtime started: THROW
- Field + not tracked: return `{ kind: 'field-untracked' }`

### Step 3: Schedule Materialize for Tracked Fields

**File**: `src/runtime/ScheduleExecutor.ts`

In the frame loop, after normal steps, check `state.tap.getTrackedFieldSlots()` and materialize any tracked fields that weren't already materialized by the render pipeline.

```typescript
// After Phase 1 steps, materialize debug-tracked fields
if (state.tap) {
  const trackedSlots = state.tap.getTrackedFieldSlots?.();
  if (trackedSlots) {
    for (const slot of trackedSlots) {
      if (!state.values.objects.has(slot)) {
        // Find the field expression for this slot and materialize it
        // Uses fieldSlotRegistry from program
      }
    }
  }
}
```

This requires the program to include a `fieldSlotToExpr` mapping so the runtime can find which field expression to materialize for a given slot.

### Step 4: Add fieldSlotRegistry to CompiledProgramIR

**Files**: `src/compiler/compile.ts`, `src/compiler/ir/program.ts`

Add a mapping from field output slots to their field expression IDs and instance IDs, so the runtime can materialize on demand:

```typescript
// In CompiledProgramIR or debugIndex
readonly fieldSlotRegistry: ReadonlyMap<ValueSlot, { fieldId: FieldExprId; instanceId: InstanceId }>;
```

Built from `blockOutputs` entries where `ref.k === 'field'`.

### Step 5: Fix slotMeta for Field Slots

**File**: `src/compiler/compile.ts`

Field output slots need `storage: 'object'` in slotMeta (they store buffer references, not f64 values). Currently all slots default to `'f64'` or `'shape2d'`. Add field detection:

```typescript
// When building slotMeta, check if slot is a field output
const isFieldSlot = fieldSlotRegistry.has(slot);
const storage = isFieldSlot ? 'object' : (type.payload === 'shape' ? 'shape2d' : 'f64');
```

### Step 6: Update DebugTap Interface

**File**: `src/runtime/DebugTap.ts`

Add methods for tracked field queries:

```typescript
export interface DebugTap {
  recordSlotValue?(slot: ValueSlot, value: number): void;
  recordFieldValue?(slot: ValueSlot, buffer: ArrayBufferView): void;
  getTrackedFieldSlots?(): ReadonlySet<ValueSlot>;  // NEW
}
```

### Step 7: Update UI — SimpleDebugPanel + DebugStore + useDebugProbe

**Files**: `src/ui/components/SimpleDebugPanel.tsx`, `src/stores/DebugStore.ts`, `src/ui/hooks/useDebugProbe.ts`

1. `DebugStore.setHoveredEdge()` → when edge is field, call `debugService.trackField(slotId)`
2. `DebugStore.setHoveredEdge(null)` → untrack previous field
3. `SimpleDebugPanel` renders based on `EdgeValueResult.kind`:
   - `'signal'`: current display (value, type, slot)
   - `'field'`: count, min, max, mean, type
   - `'field-untracked'`: "Hover to inspect field values"

### Step 8: Wire Tap in main.ts

**File**: `src/main.ts` (or wherever tap is configured)

Ensure the tap object implements `getTrackedFieldSlots` by delegating to `debugService.getTrackedFieldSlots()`.

## Execution Order

1. Step 1 (cardinality in EdgeMetadata)
2. Step 4 (fieldSlotRegistry in compile)
3. Step 5 (fix slotMeta for field slots)
4. Step 6 (DebugTap interface)
5. Step 2 (DebugService updates)
6. Step 3 (runtime demand-driven materialize)
7. Step 8 (wire tap)
8. Step 7 (UI updates)

## Verification Criteria

### Bug Fixed:
- Hovering a signal edge: shows value (unchanged behavior)
- Hovering a field edge: shows field stats (count, min, max, mean)
- NOT hovering a field edge: no crash, no wasted materialization
- Field IS tracked but runtime doesn't produce value: THROWS (real bug detection preserved)

### No Regressions:
- Existing signal debug probe works identically
- No performance impact when not debugging fields
- Existing tests pass

## Files Modified

| File | Change |
|------|--------|
| `src/compiler/ir/program.ts` | Add fieldSlotRegistry to CompiledProgramIR |
| `src/compiler/compile.ts` | Build fieldSlotRegistry, fix slotMeta for field slots |
| `src/runtime/DebugTap.ts` | Add getTrackedFieldSlots |
| `src/runtime/ScheduleExecutor.ts` | Demand-driven field materialization |
| `src/services/mapDebugEdges.ts` | Include cardinality in EdgeMetadata |
| `src/services/DebugService.ts` | Tracked fields, discriminated EdgeValueResult, field buffer storage |
| `src/stores/DebugStore.ts` | Track/untrack fields on hover |
| `src/ui/hooks/useDebugProbe.ts` | Handle new EdgeValueResult union |
| `src/ui/components/SimpleDebugPanel.tsx` | Field value display |
| `src/main.ts` | Wire getTrackedFieldSlots in tap |
