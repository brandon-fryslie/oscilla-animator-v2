# Pure Lowering Migration Status

## Summary

**Total Blocks**: ~80 blocks
**Migrated**: 68 blocks with `loweringPurity` annotation
**Remaining**: 12 blocks need migration

## Completed Categories

✅ Math: 9/10 (missing: expression)
✅ Adapters: 15/15
✅ Lens: 13/13
✅ Color: 8/8
✅ Shape: 5/5
✅ Layout: 3/3
✅ Domain: 2/2
✅ Field: 4/4
✅ Instance: 1/1
✅ Event: 2/2
✅ Signal: 7/9 (missing: const, default-source)
✅ IO: 3/3 (marked impure)
✅ Render: 2/2 (marked impure)
✅ Time: 1/1 (marked impure)

## Blocks Still Using Direct Slot Allocation

These blocks call `ctx.b.allocSlot()` directly and need migration to effects-as-data:

### 1. **src/blocks/signal/const.ts** - COMPLEX
**Issue**: Multi-component signals (vec2, color) use `stepSlotWriteStrided()`
```typescript
// Current pattern for color:
const slot = ctx.b.allocSlot(stride);
const rSig = ctx.b.constant(floatConst(val.r), ...);
const gSig = ctx.b.constant(floatConst(val.g), ...);
const bSig = ctx.b.constant(floatConst(val.b), ...);
const aSig = ctx.b.constant(floatConst(val.a), ...);
const components = [rSig, gSig, bSig, aSig];
ctx.b.stepSlotWriteStrided(slot, components); // ⚠️ Imperative schedule mutation
```

**Challenge**: `stepSlotWriteStrided` is an imperative IRBuilder method that directly modifies the schedule. The pure lowering model requires all effects to be declarative.

**Possible Solutions**:
- Add `componentWrites` to effects section for multi-component signals
- Refactor multi-component constants to use `construct()` instead
- Create a new IR node for strided constant initialization

**Status**: ⚠️ Blocked - needs design decision on how to handle strided writes in pure model

---

### 2. **src/blocks/math/expression.ts** - COMPLEX
**Issue**: Uses `stepSlotWriteStrided()` for multi-component results AND has varargs
```typescript
// Current pattern:
const slot = ctx.b.allocSlot(stride);
if (stride > 1) {
  ctx.b.stepSlotWriteStrided(slot, components); // ⚠️ Imperative
}
```

**Challenge**: Same as Const block - imperative schedule modification

**Status**: ⚠️ Blocked - same design decision needed

---

### 3. **src/blocks/signal/default-source.ts** - SPECIAL
**Issue**: This is the macro expansion block from the design doc
```typescript
// DefaultSource is meant to be expanded during normalization
// May not need traditional lowering at all
```

**Status**: ⚠️ Needs architectural review - may be eliminated by normalization

---

### 4-6. **Identity Adapters** - TRIVIAL
- src/blocks/adapter/norm01-to-scalar.ts
- src/blocks/adapter/phase-to-scalar.ts  
- src/blocks/adapter/scalar-to-deg.ts

**Pattern**: Simple identity adapters that just re-type
```typescript
const slot = ctx.b.allocSlot();
return {
  outputsById: {
    out: { id: input.id, slot, type: outType, stride },
  },
};
```

**Status**: ✅ EASY - just need to add effects section

---

### 7-9. **Color Multi-Output** - STRAIGHTFORWARD
- src/blocks/color/make-color-hsl.ts
- src/blocks/color/mix-color.ts
- src/blocks/color/split-color-hsl.ts

**Pattern**: Multiple output ports, each needs slot
```typescript
const slotH = ctx.b.allocSlot();
const slotS = ctx.b.allocSlot();
const slotL = ctx.b.allocSlot();
```

**Status**: ✅ EASY - just list all ports in slotRequests

---

### 10-11. **IO Blocks** - SIMPLE
- src/blocks/io/external-gate.ts
- src/blocks/io/external-input.ts

**Pattern**: Single output, straightforward
```typescript
const slot = ctx.b.allocSlot();
return { outputsById: { out: { id, slot, type, stride } } };
```

**Status**: ✅ EASY - already marked impure, just need effects section

---

### 12. **src/blocks/time/infinite-time-root.ts** - SIMPLE
**Pattern**: Time root with multiple rail outputs
```typescript
const slotA = ctx.b.allocSlot();
const slotB = ctx.b.allocSlot();
```

**Status**: ✅ EASY - just list all rail outputs in slotRequests

---

## Blocking Issues

### stepSlotWriteStrided in Pure Model

**Problem**: The `ctx.b.stepSlotWriteStrided(slot, components)` method directly adds a step to the execution schedule, which violates the pure lowering contract.

**Current Usage**:
- Const block: vec2, vec3, color constants
- Expression block: vec2, vec3, color results

**Options**:

1. **Add to Effects** (recommended):
```typescript
effects: {
  slotRequests: [{ portId: 'out', type: outType }],
  stridedWrites: [
    { slot: undefined, components: [rSig, gSig, bSig, aSig] }
  ],
}
```

2. **Use Construct Pattern**:
```typescript
// Instead of strided write, use construct + extract
const colorSig = ctx.b.construct([rSig, gSig, bSig, aSig], colorType);
// Orchestrator handles decomposition
```

3. **Keep as Impure Exception**:
```typescript
loweringPurity: 'impure' // Multi-component constants require schedule mutation
```

**Decision Needed**: How should multi-component signal initialization work in pure lowering model?

---

## Next Steps

### Immediate (EASY - 9 blocks, ~30 min):
1. ✅ Migrate 3 identity adapters (norm01-to-scalar, phase-to-scalar, scalar-to-deg)
2. ✅ Migrate 3 color multi-output blocks (make-color-hsl, mix-color, split-color-hsl)
3. ✅ Migrate 2 IO blocks (external-gate, external-input)
4. ✅ Migrate 1 time block (infinite-time-root)

### Design Decision Required (HARD - 2 blocks):
5. ⚠️ Decide on `stepSlotWriteStrided` handling for pure model
6. ⚠️ Migrate Const block based on decision
7. ⚠️ Migrate Expression block based on decision

### Architectural Review (SPECIAL - 1 block):
8. 🔍 Review DefaultSource block - may be eliminated by normalization phase

---

## Testing After Migration

Once all blocks are migrated:
1. Run full test suite
2. Verify simple demo still works
3. Check that multi-component signals (vec2, color) render correctly
4. Verify stateful blocks (lag, accumulator) still maintain state
5. Test macro expansion if DefaultSource is kept

---

## Design Doc Reference

See: `design-docs/_new/pure-lowering-blocks/01-macro-lowering.md`

Key principles:
- **Pure lowering**: Blocks return data, don't mutate builder
- **Effects as data**: Schedule steps, slot allocations via effects object
- **Macro expansion**: Pure blocks can be reused as IR libraries
- **Determinism**: Same inputs → same IR output
