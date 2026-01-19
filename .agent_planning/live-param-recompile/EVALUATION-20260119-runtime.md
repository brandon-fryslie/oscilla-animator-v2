# Evaluation: Live Param Recompile - Runtime Investigation

Generated: 2026-01-19
Verdict: **CONTINUE** - Two distinct issues identified, one fixable

## Summary

Investigation of why param changes in UI don't affect visual output revealed **two separate issues**:

### Issue 1: Circle Radius - NOT A BUG (Patch Wiring Issue)

**Finding**: Circle block's radius param is NOT wired to RenderInstances2D's size input.

**Evidence** (from `src/main.ts:111-116`):
```typescript
const render = b.addBlock('RenderInstances2D', {}, {
  inputDefaults: {
    size: constant(3),  // HARDCODED - not from Circle!
  },
});
```

The Circle block outputs to Array.element, but RenderInstances2D gets its size from `inputDefaults` with a hardcoded constant. This is the **intended demo patch design**, not a runtime bug.

**Status**: Working as designed. To make Circle radius affect visual size, the patch would need to wire Circle.circle → RenderInstances2D.size.

### Issue 2: Array Count - ACTUAL BUG

**Finding**: Array.count param changes trigger recompile but may not affect visual output.

**Diagnostic Evidence** (verified in browser):
- `[Param] Circle#b1.radius: 0.02 → 0.1` ✅ ParamChanged fires
- `Block params changed, scheduling recompile...` ✅ MobX reaction triggers
- `Live recompile triggered...` ✅ Recompile starts
- `[Compiler] Array#b2 created instance instance_0 with count=5000` ✅ BlockLowered shows count
- `Recompiled: 16 signals, 19 fields` ✅ Compilation completes

**Analysis**:
The full chain UI → Store → Compiler works correctly. The potential issue is in **runtime state handling**:

1. In `src/main.ts:551-559`, state is only recreated if `newSlotCount !== oldSlotCount`
2. If Array.count changes but slot count stays the same, old state persists
3. The `instance.count` in schedule DOES get updated (it's in the new program)
4. But runtime state buffers may be sized for old count

**Key Code Path** (ScheduleExecutor.ts:217):
```typescript
const count = typeof instance.count === 'number' ? instance.count : 0;
```
This reads from `schedule.instances` which comes from `program.schedule` - the NEW program. So instance count SHOULD be correct.

**Remaining Question**: If instance count is read from new program, why wouldn't visual output change? Need to verify:
1. Are field buffers sized correctly for new instance count?
2. Is the render pass using the correct count?

## Verification Needed

To confirm Array.count changes work:
1. Check if visual output changes when Array.count goes from 5000 → 100
2. The circle density should visibly decrease
3. Add diagnostic logging for instance count during render step execution

## Recommendations

### P0: Add Runtime Diagnostic
Add logging in ScheduleExecutor for render step execution:
```typescript
console.log(`[Runtime] Render pass: instanceId=${step.instanceId}, count=${count}`);
```

### P1: Verify Field Buffer Sizing
Check if field materializer allocates buffers sized to instance count. If old buffer size persists, only old count of elements get rendered.

### P2: Document Circle Radius Behavior
The Circle block's radius affects domain/shape definition, not visual size. Document this or change demo patch to wire Circle → RenderInstances2D.size.

## Files for Fix

| File | Purpose |
|------|---------|
| `src/runtime/ScheduleExecutor.ts` | Add render step diagnostics |
| `src/runtime/Materializer.ts` | Verify buffer sizing uses instance count |
| `src/main.ts` | Consider buffer reallocation on instance count change |

## Next Steps

1. Add runtime diagnostics to trace instance count through render step
2. Test Array.count change (5000 → 100) and observe if circle count changes
3. If visual doesn't change, investigate field buffer allocation
