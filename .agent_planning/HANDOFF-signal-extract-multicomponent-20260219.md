# Handoff: Generic Multi-Component Signal Extraction

**Created**: 2026-02-19
**For**: Any agent working on runtime evaluator or block lowering
**Status**: in-progress (workaround landed, proper fix needed)

---

## Objective

Make `ValueExprSignalEvaluator.extract` work generically for any multi-component signal input (vec2, vec3, vec4, color), not just `construct` expressions. Currently the evaluator can only decompose a `construct` — it cannot extract components from a signal that was written to a strided f64 slot by another mechanism.

## Current State

### What's Been Done
- **Workaround landed** in `src/runtime/ValueExprSignalEvaluator.ts:195-217`: The `extract` case now traverses into `construct` inputs and evaluates the target component sub-expression directly. This fixed the immediate runtime crash (`extract(1) on signal-extent: only componentIndex=0 supported`) that blocked the `path-flow.hcl` demo.
- The workaround is correct for all **current** IR patterns because the IR builder always pairs `extract` with `construct` for multi-component signals.
- `path-flow.hcl` demo renders correctly (visually verified via screenshot script).
- `path-flow-demo.test.ts` passes (4/4).

### What's In Progress
- Nothing actively in-progress. The workaround is stable.

### What Remains
- Replace the construct-traversal workaround with a generic slot-based read that works for ANY multi-component signal input.
- Add tests for extract from non-construct multi-component signals.

## Context & Background

### Why We're Doing This

The signal evaluator (`evaluateValueExprSignal`) returns `number` — a single scalar. Multi-component signals (vec2/vec3/vec4/color) are written to contiguous f64 slots by `evaluateConstructSignal` in the `ScheduleExecutor`. When `extract` needs component N from such a signal, it must be able to read from `state.values.f64[offset + componentIndex]`. The `slotRead` mechanism was removed (2026-02-06) but nothing replaced it for this use case.

Today the workaround works because the IR builder always generates `extract → construct` pairs. But this coupling is fragile — any future IR pattern producing a multi-component signal without a `construct` node (e.g., a kernel returning vec3, or a new expression kind) will hit the same crash.

### Key Decisions Made

| Decision | Rationale | Date |
|----------|-----------|------|
| Remove `slotRead` from evaluator | Dead code — compiler never generated it | 2026-02-06 |
| Construct traversal workaround | Unblocks path-flow demo immediately | 2026-02-19 |
| Identified slot-based read as proper fix | Generic, handles all multi-component sources | 2026-02-19 |

### Important Constraints
- `evaluateValueExprSignal` signature returns `number` — this is correct and should not change (extract always produces a scalar)
- The fix must be read-only (no state mutation) and respect IR immutability
- Multi-component signals are written to `state.values.f64` at contiguous offsets by the `ScheduleExecutor` before any downstream extract evaluates
- The evaluator currently receives only `(veId, valueExprs, state)` — no access to slot mappings

## The Architectural Problem

### Signal evaluation is scalar-only by design

```
evaluateValueExprSignal(veId, valueExprs, state) → number
```

This works for scalars. For multi-component signals, the ScheduleExecutor has a special path:

```typescript
// ScheduleExecutor.ts, evalValue step:
if (stride > 1 && exprNode?.kind === 'construct') {
    evaluateConstructSignal(exprNode, valueExprs, state, state.values.f64, offset);
}
```

All components get written to `f64[offset..offset+stride-1]`. But when a downstream `extract(input, componentIndex)` evaluates, it calls `evaluateValueExprSignal(input)` which can only return one number (component 0 via the construct case).

### The missing link: expr → slot mapping

The ScheduleExecutor already has the mapping from ValueExprId → f64 offset:

```typescript
// SlotLookupCache.ts
getSigToSlotMap(program, slotLookupMap): Map<number, number>
// Maps ValueExprId → f64 offset (cached per program via WeakMap)
```

But this mapping is not available to the signal evaluator.

## Acceptance Criteria

- [ ] `extract(input, N)` works when `input` is ANY multi-component signal (not just `construct`)
- [ ] `extract` from a construct still works (regression test)
- [ ] `extract` from a slot-backed multi-component signal works (new test)
- [ ] `path-flow.hcl` demo still renders correctly
- [ ] No performance regression in the hot loop (extract is called per-frame per-signal)

## Scope

### Files to Modify
- `src/runtime/ValueExprSignalEvaluator.ts` — Fix `extract` case to read from f64 store
- `src/runtime/ScheduleExecutor.ts` — Pass slot lookup context to evaluator (if needed by chosen approach)
- `src/runtime/__tests__/` — Add tests for multi-component extract

### Related Components
- `src/runtime/SlotLookupCache.ts` — Has `getSigToSlotMap()` and `SlotLookup` type
- `src/compiler/backend/schedule-program.ts` — Creates `evalValue` steps with slot targets
- `src/compiler/ir/value-expr.ts` — `ValueExprExtract` and `ValueExprConstruct` types
- `src/blocks/layout/attractor-layout.ts` — Primary consumer (extracts from vec3 target signal)

### Out of Scope
- Changing the `evaluateValueExprSignal` return type
- Changing the IR representation of extract/construct
- Field-extent extraction (handled by `ValueExprMaterializer`, already works correctly)

## Implementation Approach

### Recommended: Slot-based f64 read in extract

**Approach:** When `extract` encounters a non-construct input, look up the input expression's f64 slot offset and read `state.values.f64[offset + componentIndex]`.

**Key design choice:** How does the evaluator get the slot mapping?

**Option A — Thread through function parameters:**
Add an optional `sigToSlot` parameter to `evaluateValueExprSignal` and `evaluateSignalExtent`. The ScheduleExecutor already computes `sigToSlot` and passes it along.

```typescript
export function evaluateValueExprSignal(
  veId: ValueExprId,
  valueExprs: readonly ValueExpr[],
  state: RuntimeState,
  sigToSlot?: Map<number, number>  // NEW: optional slot mapping
): number
```

Pro: Explicit data flow, no hidden state.
Con: Changes a hot-path function signature; every caller must be updated.

**Option B — Store mapping on RuntimeState:**
Attach the `sigToSlot` map to `RuntimeState` (or its cache) at frame start. The evaluator reads it from `state`.

```typescript
// In ScheduleExecutor, before Phase 1:
state.cache.sigToSlot = getSigToSlotMap(program, slotLookupMap);

// In evaluator extract case:
const offset = state.cache.sigToSlot?.get(expr.input as number);
if (offset !== undefined) {
    return state.values.f64[offset + expr.componentIndex];
}
```

Pro: No signature changes; slot mapping is per-frame state anyway.
Con: Adds a field to RuntimeState/cache; implicit dependency.

**Option C — Keep construct traversal, add f64 fallback:**
Keep the current construct traversal as the fast path. Add f64 slot read as fallback for non-construct inputs. This is a hybrid that preserves the current fix while adding generic support.

```typescript
case 'extract': {
    const inputExpr = valueExprs[expr.input as number];

    // Fast path: construct input — direct component evaluation
    if (inputExpr?.kind === 'construct') {
        return evaluateValueExprSignal(
            inputExpr.components[expr.componentIndex], valueExprs, state
        );
    }

    // Generic path: read from f64 slot (multi-component signal stored by ScheduleExecutor)
    const offset = state.cache.sigToSlot?.get(expr.input as number);
    if (offset !== undefined) {
        return state.values.f64[offset + expr.componentIndex];
    }

    // Scalar fallback
    const inputVal = evaluateValueExprSignal(expr.input, valueExprs, state);
    if (expr.componentIndex === 0) return inputVal;

    throw new Error(`extract(${expr.componentIndex}): no slot mapping for ${inputExpr?.kind}`);
}
```

Pro: Minimal change, construct fast path preserved, generic fallback.
Con: Three code paths (but clearly prioritized).

### Recommended: Option C (hybrid)

Option C is the smallest delta from the current workaround and adds the generic capability. The construct traversal is a valid optimization (avoids slot lookup), and the f64 fallback handles everything else.

### Patterns to Follow
- `SlotLookupCache.ts` caching pattern (WeakMap keyed by program)
- `ScheduleExecutor.ts` Phase 1 setup pattern for per-frame state
- `ValueExprMaterializer.ts` extract case (line 112-121) — the field-extent equivalent that already works generically

### Known Gotchas
- The `sigToSlot` map is built from `evalValue` steps, which only exist for signals that have schedule steps. If an expression is only evaluated recursively (never a step root), it won't be in the map. The construct traversal handles this case.
- Multi-component signals written via `slotWriteStrided` steps use a different mapping path — verify these are also in `sigToSlot`.
- The signal evaluator cache stores only component[0] for construct expressions. This is fine because extract bypasses the cache by evaluating components directly.

## Reference Materials

### Codebase References
- `src/runtime/ValueExprSignalEvaluator.ts:195-217` — Current workaround (extract case)
- `src/runtime/ValueExprSignalEvaluator.ts:47-60` — `evaluateConstructSignal` (writes all components)
- `src/runtime/ScheduleExecutor.ts:202-247` — Multi-component evalValue handling
- `src/runtime/ScheduleExecutor.ts:506` — `sigToSlot` map computation
- `src/runtime/SlotLookupCache.ts` — `getSigToSlotMap()`, `SlotLookup`, `getSlotLookupMap()`
- `src/runtime/ValueExprMaterializer.ts:112-121` — Field-extent extract (reference implementation)
- `src/compiler/ir/value-expr.ts:324-338` — `ValueExprExtract` type definition
- `src/runtime/__tests__/construct-signal.test.ts` — Existing construct tests

## Testing Strategy

### Existing Tests
- `src/runtime/__tests__/construct-signal.test.ts` — Tests construct evaluation
- `src/blocks/layout/__tests__/path-flow-demo.test.ts` — Integration test (frontend only)

### New Tests Needed
- [ ] Extract from construct (regression — should already pass)
- [ ] Extract component 0, 1, 2 from vec3 construct
- [ ] Extract from a slot-backed non-construct signal (requires slot mapping setup)
- [ ] Extract out-of-range component index throws
- [ ] End-to-end: AttractorLayout with vec3 target (already covered by path-flow demo)

### Visual Validation
- [ ] `./scripts/get-screenshot-of-demo-patch.sh path-flow.hcl` — rainbow dots in softened pentagon

## Success Metrics

- All existing tests pass (no regressions)
- `extract(N)` works for any multi-component signal regardless of IR source
- `path-flow.hcl` renders correctly
- No measurable performance regression in frame execution

---

## Next Steps for Agent

**Immediate actions:**
1. Read `src/runtime/SlotLookupCache.ts` to understand `getSigToSlotMap()` internals
2. Read `src/runtime/RuntimeState.ts` to find the right place to attach `sigToSlot` to cache
3. Implement Option C (hybrid: construct traversal + f64 slot fallback)

**Before starting implementation:**
- [ ] Review `slotWriteStrided` step handling to ensure those slots are also in the mapping
- [ ] Check if `evaluateValueExprSignal` is called from any context other than ScheduleExecutor (it is — from stateWrite in Phase 2, and from debug tap)
- [ ] Verify the `sigToSlot` map includes all multi-component signals, not just construct-backed ones

**When complete:**
- [ ] Run `npx vitest run` to verify no test regressions
- [ ] Run `./scripts/get-screenshot-of-demo-patch.sh path-flow.hcl` for visual verification
- [ ] Update this handoff as complete
