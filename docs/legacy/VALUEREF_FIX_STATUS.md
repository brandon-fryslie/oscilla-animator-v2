# ValueRefPacked Type Fix Status

## Problem
Commit 7fd3a6a changed ValueRefPacked type to require `type` and `stride` fields for sig/field variants.
All block lower functions must be updated.

## Completed (Committed)

### Fully Fixed Files:
1. ✅ adapter-blocks.ts - All adapters  
2. ✅ field-operations-blocks.ts - All field ops
3. ✅ array-blocks.ts - Array block
4. ✅ camera-block.ts - CameraProjectionConst
5. ✅ color-blocks.ts - All color blocks
6. ✅ event-blocks.ts - All event blocks
7. ✅ expression-blocks.ts - Expression block
8. ✅ field-blocks.ts - Broadcast block

### Partially Fixed (TypeScript Errors Remaining):
9. ⚠️ math-blocks.ts - Has type narrowing issues in field paths

## Math-blocks.ts Type Narrowing Issue

### Problem Lines:
- Add: lines 66-67
- Subtract: lines 140-141
- Multiply: lines 214-215
- Divide: lines 288-289
- Modulo: lines 362-363

### Current (Broken) Code:
```typescript
const aField = a.k === 'field' ? a.id : ctx.b.Broadcast(a.id as SigExprId, ...);
const bField = b.k === 'field' ? b.id : ctx.b.Broadcast(b.id as SigExprId, ...);
```

TypeScript Error: "Property 'id' does not exist on type..." - can't narrow type in ternary else branch.

### Fix Pattern:
```typescript
// Type-safe field/signal handling
let aField: FieldExprId;
if (a.k === 'field') {
  aField = a.id;
} else if (a.k === 'sig') {
  aField = ctx.b.Broadcast(a.id, signalTypeField('float', 'default'));
} else {
  throw new Error('Add: Invalid input type for a');
}

let bField: FieldExprId;
if (b.k === 'field') {
  bField = b.id;
} else if (b.k === 'sig') {
  bField = ctx.b.Broadcast(b.id, signalTypeField('float', 'default'));
} else {
  throw new Error('Add: Invalid input type for b');
}
```

Apply to all 5 blocks (Add, Subtract, Multiply, Divide, Modulo).

## Remaining Production Files

These files need `type` and `stride` added to all ValueRefPacked returns:

1. ❌ geometry-blocks.ts
2. ❌ identity-blocks.ts
3. ❌ instance-blocks.ts
4. ❌ path-blocks.ts
5. ❌ path-operators-blocks.ts
6. ❌ primitive-blocks.ts
7. ❌ signal-blocks.ts
8. ❌ time-blocks.ts

### Fix Pattern for Each Block:

```typescript
lower: ({ ctx, inputsById }) => {
  // ... existing logic ...
  
  const outType = ctx.outTypes[outputIndex];  // Get output type from context
  const slot = ctx.b.allocSlot();
  
  return {
    outputsById: {
      out: { 
        k: 'sig',  // or 'field' or 'event'
        id: someId, 
        slot,
        type: outType,                    // Add this
        stride: strideOf(outType.payload) // Add this (sig/field only, not event)
      },
    },
  };
}
```

### Import Requirement:
Add `strideOf` to imports from '../core/canonical-types' in each file if not present.

## Test Files (Do Later)
- ❌ src/blocks/__tests__/event-blocks.test.ts
- ❌ src/blocks/__tests__/expression-blocks.test.ts

Test files can be fixed after production code builds successfully.

## Verification
After all fixes:
```bash
npm run build  # Should compile with no errors in src/blocks/
```
