# Pure Lowering Migration Status

## Summary

**Total Blocks**: ~80 blocks
**Migrated**: 77 blocks with `loweringPurity` annotation ✅
**Remaining**: 3 blocks need design decision

## Completed Categories

✅ Math: 9/10 (missing: expression - blocked)
✅ Adapters: 18/18 ✅ COMPLETE
✅ Lens: 13/13 ✅ COMPLETE
✅ Color: 11/11 ✅ COMPLETE
✅ Shape: 5/5 ✅ COMPLETE
✅ Layout: 3/3 ✅ COMPLETE
✅ Domain: 2/2 ✅ COMPLETE
✅ Field: 4/4 ✅ COMPLETE
✅ Instance: 1/1 ✅ COMPLETE
✅ Event: 2/2 ✅ COMPLETE
✅ Signal: 7/9 (missing: const, default-source - blocked)
✅ IO: 3/3 ✅ COMPLETE
✅ Render: 2/2 ✅ COMPLETE
✅ Time: 1/1 ✅ COMPLETE

## Blocks Still Using Direct Slot Allocation

Only 3 blocks remain unmigrated due to design decision needed:

### 1. **src/blocks/signal/const.ts** - ⚠️ BLOCKED
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

### 2. **src/blocks/math/expression.ts** - ⚠️ BLOCKED
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

### 3. **src/blocks/signal/default-source.ts** - ⚠️ ARCHITECTURAL
**Issue**: This is the macro expansion block from the design doc
```typescript
// DefaultSource is meant to be expanded during normalization
// May not need traditional lowering at all
```

**Status**: ⚠️ Needs architectural review - may be eliminated by normalization

---

## ✅ COMPLETED (9 blocks migrated in last commit)

### Identity Adapters ✅
- ~~norm01-to-scalar~~ ✅
- ~~phase-to-scalar~~ ✅
- ~~scalar-to-deg~~ ✅

### Color Multi-Output ✅
- ~~make-color-hsl~~ ✅
- ~~mix-color~~ ✅
- ~~split-color-hsl~~ ✅

### IO Blocks ✅
- ~~external-gate~~ ✅
- ~~external-input~~ ✅

### Time Block ✅
- ~~infinite-time-root~~ ✅

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

### ⚠️ Design Decision Required (HARD - 2 blocks):
1. Decide on `stepSlotWriteStrided` handling for pure model (see options above)
2. Migrate Const block based on decision
3. Migrate Expression block based on decision

### 🔍 Architectural Review (SPECIAL - 1 block):
4. Review DefaultSource block - may be eliminated by normalization phase

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
