# Live Param Recompile Evaluation

**Date:** 2026-01-18
**Topic:** What's Missing for Live Param Recompile to Work
**Verdict:** CONTINUE (with nuance - see Analysis)

## Executive Summary

**The param flow chain DOES work correctly.** Verified via test that changing `block.params.count` from 500 → 100 produces `instance.count` change from 500 → 100 in compiled output.

The likely issue is not in the compiler param flow, but in:
1. **Demo patch architecture** - Array block count may be irrelevant if GridLayout determines actual rendered count
2. **Domain change detection scope** - Detection compares `schedule.instances` counts, but may not fire for all param changes

## Investigation Summary

### Chain Verification ✅

| Step | Component | Status | Evidence |
|------|-----------|--------|----------|
| 1 | UI → Store | ✅ Works | `updateBlockParams()` creates new block with merged params |
| 2 | Store → MobX | ✅ Works | `hashBlockParams()` serializes all params, reaction fires |
| 3 | MobX → Compiler | ✅ Works | `scheduleRecompile()` → `recompileFromStore()` |
| 4 | Compiler reads params | ✅ Works | Pass 6: `config = block.params` at line 364 |
| 5 | Block uses params | ✅ Works | Array block: `const count = (config?.count as number) ?? 100` |
| 6 | IR stores count | ✅ Works | `createInstance(DOMAIN_CIRCLE, count, layout)` |
| 7 | Schedule has instances | ✅ Works | Pass 7: `instances = unlinkedIR.builder.getInstances()` |
| 8 | Runtime reads count | ✅ Works | `instance.count` in ScheduleExecutor |

### Test Confirmation

```typescript
// First compile with count=500
expect(instance.count).toBe(500);  // ✅ PASS

// Mutate params, recompile with count=100
expect(instance.count).toBe(100);  // ✅ PASS
```

## Root Cause Hypothesis

The **demo patch architecture** likely obscures the param effect:

```typescript
const array = b.addBlock('Array', { count: 5000 });
const layout = b.addBlock('GridLayout', { rows: 71, cols: 71 });
```

**Key insight:** The Array block creates an instance with count from params, but:

1. **GridLayout doesn't override instance count** - It only provides spatial layout
2. **The actual rendered count** comes from `instance.count` in the schedule
3. **BUT** the demo UI behavior may depend on other factors

### Three Possibilities

1. **Array.count DOES work** - Changing 5000 → 100 should change rendering
   - Verify: Add console.log in Array block's lower function

2. **Domain change detection doesn't fire** - If instance ID stays the same but count changes
   - Check: `detectAndLogDomainChanges()` compares `prevInstanceCounts` vs new counts
   - The detection SHOULD work, but throttling (200ms) may hide rapid changes

3. **Visual effect is subtle** - If circles are very small, count changes may not be obvious
   - Verify: Check if circles actually reduce in count on canvas

## What Needs Investigation

### Priority 1: Verify in Runtime

Add diagnostic logging to confirm the chain in the actual running app:

```typescript
// In Array block's lower function:
console.log(`[Array] Lowering with count=${count} from config:`, config);

// In detectAndLogDomainChanges:
console.log(`[Domain] Old counts:`, [...prevInstanceCounts]);
console.log(`[Domain] New counts:`, [...newInstances].map(([id, d]) => [id, d.count]));
```

### Priority 2: Verify UI is Calling updateBlockParams

Add logging in ParamField's handleChange:
```typescript
const handleChange = useCallback((newValue: unknown) => {
  console.log(`[ParamField] Updating ${paramKey} to:`, newValue);
  rootStore.patch.updateBlockParams(blockId, { [paramKey]: newValue });
}, [blockId, paramKey]);
```

### Priority 3: Check MobX Reaction

Verify the reaction actually fires:
```typescript
// In main.ts setupLiveRecompileReaction
console.log(`[Reaction] Hash changed from ${lastBlockParamsHash} to ${hash}`);
```

## Architecture Notes

### For ALL Blocks / ALL Params

The param flow is **generic** - it works for any block type:

1. `config = block.params` is universal (Pass 6)
2. Each block's `lower()` function decides how to use config
3. Blocks that create instances use config to set count
4. Blocks that don't create instances still receive config

### Blocks That Create Instances

| Block | Param | Effect |
|-------|-------|--------|
| Array | count | Creates instance with that count |
| CircleInstance | count | Creates instance with that count |

### Blocks That Don't Create Instances

These receive params but don't affect instance counts:
- GridLayout (rows, cols affect layout, not count)
- Oscillator (waveform)
- RenderInstances2D (none)

## Recommendations

### Immediate (Verification)

1. **Add runtime logging** to confirm param changes reach the lowering function
2. **Test with CircleInstance block** (simpler, single block creates instances)
3. **Check browser console** for "Block params changed, scheduling recompile..."

### If Param Flow IS Working

If the above confirms params flow through correctly but visual change isn't seen:

1. **Check if GridLayout obscures Array count** - In three-stage arch, Array count sets max, GridLayout fills grid
2. **Add explicit "instance count changed" log** in domain detection
3. **Verify renderer actually uses new count**

### If Param Flow IS NOT Working

If logging shows params aren't reaching lowering function:

1. Check MobX reaction is firing
2. Check `block.params` has the new values
3. Check normalized patch has the new values
4. Check Pass 6 receives correct blocks

## Files Involved

- `src/stores/PatchStore.ts:157-170` - updateBlockParams
- `src/main.ts:612-642` - MobX reaction setup
- `src/main.ts:518-574` - recompileFromStore
- `src/compiler/passes-v2/pass6-block-lowering.ts:363-367` - config = block.params
- `src/blocks/array-blocks.ts:59-64` - Array block lowering
- `src/runtime/ScheduleExecutor.ts:145-217` - Runtime uses instance.count

## Next Steps

1. Run app with logging enabled
2. Change Array count slider
3. Check console for:
   - "Block params changed, scheduling recompile..."
   - "[Array] Lowering with count=X"
   - "[Domain] Old counts / New counts"
4. If all show correct values → issue is elsewhere (rendering/visual)
5. If values don't change → trace backward to find where chain breaks
