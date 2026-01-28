# Implementation Context: unified-slots

Generated: 2026-01-25
Plan: SPRINT-20260125-unified-slots-PLAN.md

## P0: Centralize Stride Computation

### Target Files

1. **src/core/canonical-types.ts** (lines 150-165)
   - `strideOf(payload: PayloadType): number` - KEEP, this is the source of truth

2. **src/compiler/ir/IRBuilderImpl.ts** (lines 496-519)
   - DELETE the switch statement in `allocTypedSlot()`
   - Replace with: `const stride = strideOf(type.payload);`

3. **src/compiler/ir/IRBuilderImpl.ts** (lines 566-588)
   - DELETE the switch statement in `getSlotMetaInputs()`
   - Replace with: `const stride = strideOf(type.payload);`

4. **src/compiler/compile.ts** (lines 441-451)
   - DELETE `payloadStride()` import
   - Use `strideOf()` from canonical-types if needed, OR rely on slotInfo.stride

### Code Patterns to Follow

```typescript
// GOOD: Use strideOf from canonical-types
import { strideOf } from '../core/canonical-types';
const stride = strideOf(type.payload);

// BAD: Inline switch statement
let stride: number;
switch (type.payload) {
  case 'vec2': stride = 2; break;
  // ...
}
```

---

## P0: Unified allocSlot Method

### Target Files

1. **src/compiler/ir/Indices.ts** - Add StorageClass type if not exists

2. **src/compiler/ir/IRBuilder.ts** (lines 150-210)
   - DELETE `allocSlot(stride?: number)` signature
   - DELETE `allocTypedSlot` method
   - DELETE `allocValueSlot` method
   - DELETE `registerSlotType` method
   - ADD new signature:
     ```typescript
     allocSlot(type: CanonicalType, label?: string): SlotAllocation;
     ```

3. **src/compiler/ir/IRBuilderImpl.ts**
   - Add SlotAllocation type:
     ```typescript
     export interface SlotAllocation {
       readonly slot: ValueSlot;
       readonly stride: number;
       readonly storage: 'f64' | 'f32' | 'object' | 'shape2d';
       readonly offset: number;
     }
     ```
   - Modify allocSlot to:
     ```typescript
     allocSlot(type: CanonicalType, label?: string): SlotAllocation {
       const stride = strideOf(type.payload);
       const storage = this.storageForPayload(type.payload);
       const offset = this.storageOffsets[storage];
       this.storageOffsets[storage] += stride;

       const slot = valueSlot(this.slotCounter++);

       // Build slotMeta entry immediately
       this.slotMetaEntries.push({
         slot,
         storage,
         offset,
         stride,
         type,
         debugName: label,
       });

       return { slot, stride, storage, offset };
     }
     ```
   - DELETE allocTypedSlot, allocValueSlot, registerSlotType
   - ADD slotMetaEntries: SlotMetaEntry[] = []
   - ADD storageOffsets: Record<StorageClass, number> = { f64: 0, ... }
   - ADD getSlotMeta(): readonly SlotMetaEntry[]

4. **src/compiler/ir/types.ts** - Export SlotAllocation if needed

### Code Patterns to Follow

```typescript
// Block lowering BEFORE
const slot = ctx.b.allocSlot(stride);
ctx.b.registerSlotType(slot, type);
return { outputsById: { out: { k: 'sig', id, slot, type, stride } } };

// Block lowering AFTER
const { slot, stride } = ctx.b.allocSlot(type);
return { outputsById: { out: { k: 'sig', id, slot, type, stride } } };
```

---

## P1: Remove slotMeta Generation from compile.ts

### Target File

**src/compiler/compile.ts** (lines 417-496)

### Current Code (TO DELETE)

```typescript
// Build slot metadata from slot types
const slotTypes = builder.getSlotMetaInputs();
const slotMeta: SlotMetaEntry[] = [];

// Track offsets per storage class
const storageOffsets = { f64: 0, f32: 0, i32: 0, u32: 0, object: 0, shape2d: 0 };

// Build slotMeta entries for all allocated slots
for (let slotId = 0; slotId < builder.getSlotCount?.() || 0; slotId++) {
  // ... 50+ lines of complexity ...
}
```

### Replacement Code

```typescript
const slotMeta = builder.getSlotMeta();
```

---

## P1: Update All Block Lowering

### File Transformation Pattern

For each file in src/blocks/:

**Search for:**
```typescript
const slot = ctx.b.allocSlot();
const slot = ctx.b.allocSlot(stride);
ctx.b.allocTypedSlot(type);
ctx.b.allocValueSlot(type);
ctx.b.registerSlotType(slot, type);
```

**Replace with:**
```typescript
const { slot } = ctx.b.allocSlot(type);
// OR if stride needed:
const { slot, stride } = ctx.b.allocSlot(type);
```

### Files and Approximate Line Counts

| File | allocSlot calls | registerSlotType calls |
|------|-----------------|------------------------|
| signal-blocks.ts | ~20 | ~10 |
| time-blocks.ts | ~10 | ~0 |
| geometry-blocks.ts | ~10 | ~5 |
| color-blocks.ts | ~5 | ~2 |
| math-blocks.ts | ~10 | ~5 |
| expression-blocks.ts | ~5 | ~2 |
| primitive-blocks.ts | ~5 | ~2 |
| array-blocks.ts | ~5 | ~2 |
| instance-blocks.ts | ~5 | ~2 |
| field-blocks.ts | ~10 | ~5 |
| field-operations-blocks.ts | ~5 | ~2 |
| path-blocks.ts | ~5 | ~2 |
| path-operators-blocks.ts | ~5 | ~2 |
| adapter-blocks.ts | ~5 | ~2 |
| camera-block.ts | ~10 | ~5 |
| render-blocks.ts | ~5 | ~2 |
| identity-blocks.ts | ~3 | ~1 |
| event-blocks.ts | ~5 | ~2 |
| test-blocks.ts | ~5 | ~2 |

---

## P2: Remove Continuity Pipeline Slot Allocation

### Target File

**src/compiler/passes-v2/pass7-schedule.ts** (lines 413-416)

### Current Code

```typescript
let nextSlot = unlinkedIR.builder.getSlotCount();
const slotAllocator = (): ValueSlot => {
  return nextSlot++ as ValueSlot;
};
```

### Proposed Change

Pass the IRBuilder to buildContinuityPipeline and use proper allocation:

```typescript
const slotAllocator = (): SlotAllocation => {
  return unlinkedIR.builder.allocSlot(canonicalType('object')); // or appropriate type
};
```

### Investigation Required

Need to determine what type these continuity slots should have. They store:
- Float32Array references for position buffers
- Float32Array references for color buffers

Likely type: `canonicalType('object')` or a new `canonicalType('buffer')` type.

---

## Storage Class Determination

Add helper to IRBuilderImpl:

```typescript
private storageForPayload(payload: PayloadType): 'f64' | 'f32' | 'object' | 'shape2d' {
  switch (payload) {
    case 'shape':
      return 'shape2d';
    case 'object':
    case 'buffer':
      return 'object';
    default:
      // All numeric types use f64
      return 'f64';
  }
}
```

---

## Test Files to Verify

After changes, ensure these tests pass:
- src/compiler/__tests__/compile.test.ts
- src/compiler/__tests__/steel-thread.test.ts
- src/compiler/__tests__/steel-thread-rect.test.ts
- src/compiler/__tests__/steel-thread-dual-topology.test.ts
- src/runtime/__tests__/integration.test.ts
- src/runtime/__tests__/RenderAssembler.test.ts
- src/blocks/__tests__/*.test.ts
