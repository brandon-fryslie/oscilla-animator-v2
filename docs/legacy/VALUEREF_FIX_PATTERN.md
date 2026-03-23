# ValueRefPacked Type Contract Fix - Remaining Work

## Background
Commit 7fd3a6a (DO NOT REVERT) added required `type` and `stride` fields to the `ValueRefPacked` type. All block `lower` functions must now include these fields when returning signal or field outputs.

## Fix Pattern

### For Signal ('sig') outputs:
```typescript
// OLD (broken)
return { outputsById: { out: { k: 'sig', id: sigId, slot } } };

// NEW (correct)
const outType = ctx.outTypes[0];  // Get index based on output port position
return {
  outputsById: {
    out: {
      k: 'sig',
      id: sigId,
      slot,
      type: outType,
      stride: strideOf(outType.payload)
    },
  },
};
```

### For Field ('field') outputs:
```typescript
// OLD (broken)
return { outputsById: { field: { k: 'field', id: fieldId, slot } } };

// NEW (correct)
const outType = ctx.outTypes[0];
return {
  outputsById: {
    field: {
      k: 'field',
      id: fieldId,
      slot,
      type: outType,
      stride: strideOf(outType.payload)
    },
  },
};
```

### For Multiple Outputs:
Use the index position for each output:
```typescript
return {
  outputsById: {
    position: { k: 'field', id: posId, slot: posSlot, type: ctx.outTypes[0], stride: strideOf(ctx.outTypes[0].payload) },
    angle: { k: 'field', id: angId, slot: angSlot, type: ctx.outTypes[1], stride: strideOf(ctx.outTypes[1].payload) },
  },
};
```

## Required Import
Add to imports from '../core/canonical-types':
```typescript
import { ..., strideOf } from '../core/canonical-types';
```

## Remaining Files to Fix

### 1. geometry-blocks.ts
- PolarToCartesian (signal output at index 0)
- CircularLayout (field outputs at indices 0, 1)
- CartesianToGrid (signal output at index 0)

### 2. identity-blocks.ts
- Random (field outputs at indices 0, 1)
- FieldIndex (field outputs at indices 0, 1)

### 3. instance-blocks.ts
- Array (field output at index 0)
- GridLayout (field output at index 0)
- PolarLayout (field output at index 0)
- PointLayout (field output at index 0)

### 4. path-blocks.ts
- BezierPath (signal output at 0, field output at 1)
- BSplinePath (signal output at 0, field output at 1)

### 5. path-operators-blocks.ts
- Sample (field outputs at 0, 1)
- PointsOnPath (field outputs at 0, 1, 2)

### 6. primitive-blocks.ts
- Circle (signal output at index 0)
- Polygon (signal output at index 0)

### 7. signal-blocks.ts
- Const (signal output at index 0)
- Ramp (signal output at index 0)
- Triangle (signal output at index 0)
- Wave (signal output at index 0)
- Sine (signal output at index 0)
- Cosine (signal output at index 0)

### 8. time-blocks.ts
- TimeMultiplexer (multiple signal outputs - see note below)

### 9. field-blocks.ts
- Broadcast (field output at index 0)

### 10. Test files (lower priority)
- event-blocks.test.ts
- expression-blocks.test.ts

## Special Case: time-blocks.ts
The TimeMultiplexer block uses `allocTypedSlot()` which doesn't exist. Investigate IRBuilder to see if this should be `allocSlot()`.

## Build Verification
After fixes:
```bash
npm run build
npm run test
```

## Completed Files
- ✅ adapter-blocks.ts (all 10 adapters)
- ✅ math-blocks.ts (Add, Subtract, Multiply, Divide, Modulo with type narrowing fixes)
- ✅ color-blocks.ts (already fixed)
- ✅ event-blocks.ts (already fixed)
- ✅ expression-blocks.ts (already fixed)
- ✅ field-blocks.ts (already fixed)
- ✅ array-blocks.ts (already fixed)
- ✅ camera-block.ts (already fixed)
- ✅ field-operations-blocks.ts (already fixed)
