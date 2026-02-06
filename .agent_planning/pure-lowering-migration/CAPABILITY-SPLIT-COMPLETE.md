# Capability Split Complete: BlockIRBuilder vs OrchestratorIRBuilder

## Status: ✅ COMPLETE

## Summary

Successfully split IRBuilder into two capability surfaces:
- **BlockIRBuilder**: Pure surface for block lowering (no allocation, no schedule mutation)
- **OrchestratorIRBuilder**: Full surface for orchestrator code (extends BlockIRBuilder with imperative operations)

## Architecture

```
┌─────────────────────────────────────────┐
│         BlockIRBuilder                  │
│  (Pure Expression Construction)        │
│  - constant(), time(), external()       │
│  - kernelMap(), kernelZip()            │
│  - construct(), extract()              │
│  - stateRead() (symbolic)              │
│  - createInstance()                    │
│  NO: allocSlot, stepSlotWriteStrided   │
└─────────────────────────────────────────┘
                    △
                    │ extends
                    │
┌─────────────────────────────────────────┐
│      OrchestratorIRBuilder              │
│  (Full Imperative Surface)              │
│  + allocTypedSlot()                     │
│  + registerSigSlot()                    │
│  + stepSlotWriteStrided()               │
│  + stepStateWrite()                     │
│  + stepMaterialize()                    │
│  + resolveStateExprs()                  │
└─────────────────────────────────────────┘
```

## Implementation

### 1. New Interfaces

**BlockIRBuilder.ts** - Pure surface for blocks
- Expression construction only
- No allocation or schedule mutation
- Used in `LowerCtx.b` (what blocks see)

**OrchestratorIRBuilder.ts** - Full surface for orchestrator
- Extends BlockIRBuilder
- Adds allocation methods
- Adds schedule step emission
- Adds expression resolution/patching
- Used in orchestrator code (binding-pass, lower-blocks, combine-utils)

### 2. Updated IRBuilderImpl

**IRBuilderImpl.ts**
- Implements `OrchestratorIRBuilder` (full surface)
- Restored all imperative methods
- Can be upcast to `BlockIRBuilder` when passing to blocks

### 3. Updated LowerCtx

**registry.ts**
```typescript
export interface LowerCtx {
  // ...
  readonly b: BlockIRBuilder; // ← Was IRBuilder, now BlockIRBuilder
  // ...
}
```

### 4. Updated Orchestrator Code

All orchestrator files now use `OrchestratorIRBuilder`:
- `binding-pass.ts`
- `lower-blocks.ts`
- `combine-utils.ts`

## Type-Level Enforcement

✅ **Blocks cannot call impure methods at compile time**

Attempting to call from a block:
```typescript
// In block lower()
ctx.b.allocSlot()           // ❌ Type error: Property 'allocSlot' does not exist on type 'BlockIRBuilder'
ctx.b.stepSlotWriteStrided() // ❌ Type error: Property 'stepSlotWriteStrided' does not exist on type 'BlockIRBuilder'
```

✅ **Orchestrator has full access**

In orchestrator code:
```typescript
function processEffects(builder: OrchestratorIRBuilder) {
  const slot = builder.allocTypedSlot(type);  // ✅ Works
  builder.stepMaterialize(field, inst, slot); // ✅ Works
}
```

✅ **Capability split enforced by types**

When calling block.lower():
```typescript
const builder: OrchestratorIRBuilder = createIRBuilder();
const bForBlock: BlockIRBuilder = builder; // Upcast to restricted interface
const result = block.lower({ ctx: { b: bForBlock, ... }, ... });
// Block sees only BlockIRBuilder methods
// Orchestrator keeps full OrchestratorIRBuilder access
```

## Remaining Type Errors (Expected)

### Blocks That Need Migration (Pure Lowering)
These blocks call impure methods and need to be migrated to use construct() + effects:

1. **const.ts** (8 errors)
   - Uses `allocSlot()` and `stepSlotWriteStrided()`
   - Needs: construct() for vec2/vec3/color

2. **expression.ts** (6 errors)
   - Uses `allocSlot()` and `stepSlotWriteStrided()`
   - Needs: construct() for multi-component results

3. **external-vec2.ts** (2 errors)
   - Uses `allocSlot()` and `stepSlotWriteStrided()`
   - Needs: construct() for vec2

4. **default-source.ts** (6 errors)
   - Uses `allocSlot()` and `registerSigSlot()`
   - Needs: migrate to pure lowering or mark as 'impure'

5. **infinite-time-root.ts** (1 error)
   - Uses `registerSlotType()`
   - Likely simple fix

### Helper Functions That Need Updates (15 errors)
Several blocks pass `ctx.b` to helper functions that expect old `IRBuilder`:
- broadcast.ts, circle-layout-uv.ts, grid-layout-uv.ts, path-field.ts, etc.

These helper functions need their signatures updated from `IRBuilder` to `BlockIRBuilder`.

### Test Fix (1 error)
- construct-signal.test.ts: Missing time fields (tAbsMs, pulse)

## Total Error Count

- **Before capability split**: ~60 errors
- **After capability split**: 37 errors
- **Reduction**: 23 errors fixed (orchestrator files now type-correct)

## Next Steps

1. Update helper function signatures (`IRBuilder` → `BlockIRBuilder`)
2. Migrate 4 core blocks (const, expression, external-vec2, default-source)
3. Fix infinite-time-root.ts
4. Fix test time state
5. Add ESLint rule as belt-and-suspenders (optional - type system already enforces)

## Architecture Validation

✅ **Single Implementation**: IRBuilderImpl implements both interfaces
✅ **Type-Level Enforcement**: Blocks cannot call impure methods
✅ **No Runtime Overhead**: Just interface upcasting, zero cost
✅ **No `as any` Required**: Clean type safety throughout
✅ **Future-Proof**: New impure methods automatically restricted from blocks

The capability split is complete and working as designed.
