# Slot System Complexity Evaluation

**Generated**: 2026-01-25
**Topic**: slot-simplification
**Status**: EVALUATION COMPLETE

## Executive Summary

The slot/stride/slotMeta system has accumulated significant complexity through incremental feature additions. What should be a simple "allocate N floats, write N floats, read N floats" pattern has become a maze of dual code paths, special cases, and scattered handling.

**Core Complexity Sources:**
1. **Dual execution paths** (evalSig vs slotWriteStrided)
2. **Stride registration scatter** (multiple registration points)
3. **Storage class dispatch** (f64, shape2d, object confusion)
4. **Time signal special handling** (hardcoded slot 0, special case in evaluator)
5. **Event slot special handling** (different allocation, different storage)
6. **Debug index registration complexity** (multi-layer provenance tracking)

## Current State Analysis

### 1. Slot Allocation System

**Files involved:**
- `src/compiler/ir/IRBuilderImpl.ts` - allocSlot, allocTypedSlot, allocValueSlot, registerSlotType
- `src/compiler/compile.ts` - slotMeta generation in convertLinkedIRToProgram
- `src/compiler/passes-v2/pass6-block-lowering.ts` - registerSlotType calls
- `src/compiler/passes-v2/pass7-schedule.ts` - additional slot allocation for continuity

**Problems identified:**

1. **Three allocation methods that do similar things:**
   ```typescript
   allocSlot(stride?: number): ValueSlot           // Raw allocation
   allocTypedSlot(type: SignalType): ValueSlot     // Allocation + type tracking
   allocValueSlot(type: SignalType): ValueSlot     // Alias for allocTypedSlot
   ```

2. **Stride computation duplicated in 4 places:**
   - `IRBuilderImpl.allocTypedSlot()` - computes stride from payload
   - `IRBuilderImpl.getSlotMetaInputs()` - computes stride again
   - `compile.ts convertLinkedIRToProgram()` - computes stride again with payloadStride()
   - Block lowering functions - compute stride via strideOf()

3. **registerSlotType called in multiple places:**
   - By blocks themselves (signal-blocks.ts)
   - By pass6-block-lowering.ts after lowering
   - Implicitly via allocTypedSlot

4. **System reserved slots hardcoded:**
   ```typescript
   // IRBuilderImpl constructor
   this.reserveSystemSlot(0, signalType('color')); // time.palette at slot 0
   ```
   But the ScheduleExecutor also hardcodes:
   ```typescript
   const TIME_PALETTE_SLOT = 0 as ValueSlot;
   ```

### 2. evalSig vs slotWriteStrided Dual Path

**The problem:** Scalar signals use `evalSig` step, but multi-component signals (vec2, vec3, color) use `slotWriteStrided` step. This creates:

1. **Different registration paths:**
   - Scalar signals: `registerSigSlot(id, slot)` -> schedule generates `evalSig` step
   - Multi-component: `stepSlotWriteStrided(slot, components)` -> explicit step in builder

2. **Different execution paths:**
   ```typescript
   // ScheduleExecutor.ts
   case 'evalSig': {
     // stride=1 enforced
     if (stride !== 1) throw Error(...);
     const value = evaluateSignal(...);
     writeF64Scalar(state, lookup, value);
   }

   case 'slotWriteStrided': {
     // stride must match inputs.length
     for (let i = 0; i < inputs.length; i++) {
       state.values.f64[offset + i] = evaluateSignal(inputs[i], ...);
     }
   }
   ```

3. **Special filtering in pass7-schedule.ts:**
   ```typescript
   // Collect slots that are targets of slotWriteStrided steps.
   // These slots are written by the strided write step, not evalSig.
   const stridedWriteSlots = new Set<ValueSlot>();
   for (const step of builderSteps) {
     if (step.kind === 'slotWriteStrided') {
       stridedWriteSlots.add(step.slotBase);
     }
   }
   // Then skip these in evalSig generation:
   if (stridedWriteSlots.has(slot)) continue;
   ```

### 3. Time Signal Special Handling

**Current complexity:**
1. Slot 0 is reserved at IRBuilder construction for time.palette
2. ScheduleExecutor writes time.palette explicitly before schedule execution
3. Time blocks (InfiniteTimeRoot) allocate additional slots but don't use them
4. SignalEvaluator has special case for 'time' expressions that read from state.time

**Evidence:**
```typescript
// IRBuilderImpl.ts constructor
this.reserveSystemSlot(0, signalType('color'));

// ScheduleExecutor.ts executeFrame
const TIME_PALETTE_SLOT = 0 as ValueSlot;
writeF64Strided(state, palette, time.palette, 4);

// SignalEvaluator.ts
case 'time': {
  switch (timeExpr.which) {
    case 'tMs': return state.time.tMs;
    case 'palette': return 0; // Slot number, not the value!
    // ...
  }
}
```

### 4. Event Slot Special Handling

**Different from value slots:**
- Separate allocation: `allocEventSlot(eventId): EventSlotId`
- Separate storage: `state.eventScalars: Uint8Array` (not f64)
- Separate step: `evalEvent` (not evalSig)
- No slotMeta entry (events don't use slotMeta system)

**This means:**
- Events have their own parallel system
- No unified "everything is a slot" abstraction
- Debug index handles events differently

### 5. slotMeta Generation Complexity

**In compile.ts convertLinkedIRToProgram:**
```typescript
// Track offsets per storage class
const storageOffsets = { f64: 0, f32: 0, i32: 0, u32: 0, object: 0, shape2d: 0 };

// Build slotMeta entries for all allocated slots
for (let slotId = 0; slotId < builder.getSlotCount(); slotId++) {
  const slot = slotId as ValueSlot;
  const slotInfo = slotTypes.get(slot);
  const type = slotInfo?.type || signalType('float'); // Default to float if no type!

  // Storage class dispatch
  const storage = fieldSlotSet.has(slotId) ? 'object'
    : type.payload === 'shape' ? 'shape2d'
    : 'f64';

  // Stride from slotInfo or compute from payload
  const stride = storage === 'object' ? 1 : (slotInfo?.stride ?? payloadStride(type.payload));

  // Offset increments by stride
  const offset = storageOffsets[storage];
  storageOffsets[storage] += stride;
}
```

**Problems:**
1. Default to float if no type info (hides bugs)
2. Storage class determined by three different conditions
3. Stride can come from two sources (slotInfo or payloadStride)
4. Offset computation intermixed with type resolution

### 6. Debug Index Registration

**Multiple layers:**
1. `slotToBlock` - which block owns which slot
2. `slotToPort` - which port on which block
3. `ports` array - detailed port binding info
4. `blockMap` - numeric BlockId to string ID

**Scattered registration:**
- pass6-block-lowering: registerSigSlot, registerFieldSlot, registerSlotType
- compile.ts: builds debugIndex from blockOutputs
- mapDebugEdges: additional edge-to-slot mapping for UI

## Quantitative Metrics

| Metric | Count |
|--------|-------|
| Files touching slot system | 15+ |
| Allocation methods | 3 (allocSlot, allocTypedSlot, allocValueSlot) |
| Stride computation locations | 4 |
| Storage classes | 6 (f64, f32, i32, u32, object, shape2d) |
| Step types for slot writes | 2 (evalSig, slotWriteStrided) |
| Special-cased slots | 2+ (time.palette at 0, events separate) |
| Registration call sites | 10+ |

## Root Cause

The system evolved incrementally:
1. Started with simple scalar slots (stride=1, f64 storage)
2. Added multi-component support (stride>1) via separate step type
3. Added events (separate storage, separate steps)
4. Added shapes (shape2d storage)
5. Added fields (object storage)
6. Added debug tracking (scattered registration)

Each addition was grafted on without unifying the underlying model.

## What "Simple" Would Look Like

A unified slot system where:
1. **One allocation method**: `allocSlot(type: SignalType) -> SlotHandle`
2. **One execution path**: All slots use the same evaluation + write pattern
3. **Stride is automatic**: Derived from type at allocation, never computed again
4. **Storage is automatic**: Derived from type at allocation
5. **Debug registration is automatic**: Happens at allocation
6. **No reserved slots**: Time signals go through normal allocation
7. **Events unified**: Events are just slots with boolean payload

## Blocked Questions

1. Can we unify events into the slot system, or do they need separate storage for monotone-OR semantics?
2. Can time signals use normal allocation, or is slot 0 reservation load-bearing?
3. How much of the shape2d storage class is actually used?
