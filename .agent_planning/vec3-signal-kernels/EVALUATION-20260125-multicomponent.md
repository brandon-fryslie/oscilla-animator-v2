# Evaluation: Multi-Component Signal Support (vec2, vec3, vec4, color)
Timestamp: 2026-01-25-160500
Git Commit: 436f5a8

## Executive Summary
Overall: 0% complete | Critical issues: 5 | Tests reliable: N/A (no tests for this feature)

The SignalEvaluator is architecturally scalar-only. All multi-component signal operations (vec2, vec3, color) are referenced in blocks but the kernels do not exist. Field-level multi-component operations work correctly. The system needs either (A) full multi-component signal support or (B) removal of pure-signal paths from multi-component blocks.

## Runtime Check Results

| Check | Status | Output |
|-------|--------|--------|
| Test suite | PARTIAL | 9 tests failing (see below) |
| `packVec2` in SignalEvaluator | MISSING | Kernel not implemented |
| `packColor` in SignalEvaluator | MISSING | Kernel not implemented |
| `vec3FromComponents` in SignalEvaluator | MISSING | Kernel not implemented |
| `jitterVecSig` in SignalEvaluator | MISSING | Kernel not implemented |
| `setZSig` in SignalEvaluator | MISSING | Kernel not implemented |
| Field equivalents exist | YES | makeVec2, makeVec3, hsvToRgb, fieldJitterVec, fieldSetZ |
| Stride table defined | YES | PAYLOAD_STRIDE in canonical-types.ts |
| writeF64Strided exists | YES | ScheduleExecutor.ts:91-102 |

## Missing Checks

1. **No unit tests for multi-component signal paths** - all signal kernel tests are scalar-only
2. **No integration test for Const<vec2>** - blocks reference packVec2 but no test exercises it
3. **No integration test for Const<color>** - blocks reference packColor but no test exercises it
4. **No integration test for PolarToCartesian with signal inputs**
5. **No integration test for pure-signal geometry operations**

## Findings

### 1. Missing Signal Kernels - Complete Inventory

**Status**: NOT_STARTED
**Evidence**:

| Kernel | File:Line | Used By | Stride |
|--------|-----------|---------|--------|
| `packVec2` | signal-blocks.ts:119 | Const<vec2> | 2 |
| `packColor` | signal-blocks.ts:136 | Const<color> | 4 |
| `vec3FromComponents` | geometry-blocks.ts:78 | PolarToCartesian | 3 |
| `jitterVecSig` | geometry-blocks.ts:199 | OffsetVec | 3 |
| `setZSig` | field-operations-blocks.ts:1030 | SetZ | 3 |

**Issues**:
- Any block using these kernels throws "Unknown signal kernel: X"
- This affects: Const<vec2>, Const<color>, PolarToCartesian, OffsetVec, SetZ when used with pure-signal inputs

### 2. evaluateSignal Returns Single Number

**Status**: ARCHITECTURAL_CONSTRAINT
**Evidence**: SignalEvaluator.ts:78-114
```typescript
export function evaluateSignal(
  sigId: SigExprId,
  signals: readonly SigExpr[],
  state: RuntimeState
): number {  // <-- Returns single number
  ...
  const value = evaluateSigExpr(expr, signals, state);
  ...
  return value;
}
```

**Issues**:
- Cannot return vec2 (2 numbers) or color (4 numbers)
- Would require signature change: `number | number[]` or `Float64Array`
- All callers would need updates

### 3. Signal Cache is Scalar-Only

**Status**: ARCHITECTURAL_CONSTRAINT
**Evidence**: RuntimeState.ts:193-194
```typescript
sigValues: Float64Array;  // One f64 per signal
sigStamps: Uint32Array;   // One stamp per signal
```

**Issues**:
- No stride tracking in cache
- Vec3 would need 3 consecutive slots or a different storage mechanism
- Cache invalidation becomes more complex with multi-slot signals

### 4. Slot Write Validation Assumes Stride=1

**Status**: PARTIAL_SUPPORT
**Evidence**: ScheduleExecutor.ts:81-89
```typescript
function writeF64Scalar(state: RuntimeState, lookup: SlotLookup, value: number): void {
  if (lookup.stride !== 1) {
    throw new Error(`writeF64Scalar: expected stride=1 for slot ${lookup.slot}, got stride=${lookup.stride}`);
  }
  state.values.f64[lookup.offset] = value;
}
```

**Partial support exists**: ScheduleExecutor.ts:91-102 has `writeF64Strided()` that accepts any stride, but it's not connected to signal evaluation.

### 5. Type System Allows Multi-Component Signals

**Status**: TYPE_SYSTEM_READY
**Evidence**: SignalType can have any PayloadType including vec2/vec3/color. The IR types support this.

```typescript
// From Const block (signal-blocks.ts:119-121)
sigId = ctx.b.sigZip([xSig, ySig], packFn, signalType('vec2'));
```

**Issues**:
- Types say it's allowed, but runtime doesn't implement it
- Type checking passes, runtime throws

### 6. Field Kernels Work Correctly

**Status**: COMPLETE
**Evidence**: FieldKernels.ts implements all multi-component operations:

| Kernel | Input | Output | Stride |
|--------|-------|--------|--------|
| makeVec2 | 2 floats | vec2 | 2 |
| makeVec3 | 2 floats | vec3 (z=0) | 3 |
| fieldPolarToCartesian | 4 floats | vec3 | 3 |
| fieldJitterVec | vec3 + 4 floats | vec3 | 3 |
| fieldSetZ | vec3 + float | vec3 | 3 |
| hsvToRgb | 3 floats | color | 4 |
| applyOpacity | color + float | color | 4 |
| perElementOpacity | color + float | color | 4 |

### 7. Block Pattern Analysis

**Status**: MIXED_SUPPORT
**Evidence**: Cardinality-polymorphic blocks have three paths:

```typescript
// PolarToCartesian example (geometry-blocks.ts:62-132)
if (angle.k === 'sig' && radius.k === 'sig') {
  // Signal path - BROKEN (uses vec3FromComponents)
} else if (angle.k === 'field' && radius.k === 'field') {
  // Field path - WORKS (uses fieldPolarToCartesian)
} else {
  // Mixed path - WORKS (broadcasts signals to fields)
}
```

**Observation**: Only the pure-signal path is broken. Mixed and field paths work.

## Ambiguities Found

| Area | Question | How LLM Guessed | Impact |
|------|----------|-----------------|--------|
| Return type of evaluateSignal | Should it return number or number[]? | Kept as number | HIGH - fundamental API change |
| Signal cache storage | Use 3 slots for vec3 or Object storage? | No decision made | HIGH - affects cache design |
| Const block vec2/color support | Is pure-signal Const<vec2> a real use case? | Implemented but broken | MEDIUM - blocks exist but don't work |
| Stride tracking for signals | How to track stride per signal? | No tracking exists | HIGH - would need new metadata |
| Performance vs simplicity | Object storage is simpler but slower | No decision | MEDIUM - affects performance path |

## Complexity Assessment

### Option A: Full Multi-Component Signal Support

**Required changes**:

1. **SignalEvaluator.ts** (~100 lines)
   - Change `evaluateSignal` return type to `number | Float64Array`
   - Add `evaluateSigExprMulti` for multi-component expressions
   - Implement 5 missing kernels: packVec2, packColor, vec3FromComponents, jitterVecSig, setZSig
   - Update NaN/Infinity detection for arrays

2. **RuntimeState.ts** (~30 lines)
   - Add stride tracking to FrameCache
   - Modify sigValues to support multi-slot entries
   - Or use separate Map<SigExprId, Float64Array> for multi-component

3. **ScheduleExecutor.ts** (~50 lines)
   - Update evalSig step to handle multi-component results
   - Connect writeF64Strided to signal path
   - Update slot allocation to account for stride

4. **All callers of evaluateSignal** (~20 locations)
   - Handle number | Float64Array return type
   - Update materialization paths

**Estimated complexity**: HIGH (200+ lines, architectural changes)
**Estimated time**: 2-3 days

**Risks**:
- Performance regression from type checks on every signal evaluation
- Cache invalidation complexity
- Breaking changes to existing callers

### Option B: Force Field Path for Multi-Component Blocks

**Required changes**:

1. **signal-blocks.ts** (~20 lines)
   - Remove Const<vec2> and Const<color> signal paths
   - Force field path with broadcast

2. **geometry-blocks.ts** (~30 lines)
   - Remove pure-signal path from PolarToCartesian
   - Remove pure-signal path from OffsetVec
   - Always use mixed/field path

3. **field-operations-blocks.ts** (~10 lines)
   - Remove pure-signal path from SetZ

4. **Documentation** (~20 lines)
   - Document that multi-component operations require at least one field input

**Estimated complexity**: LOW (60-80 lines, no architectural changes)
**Estimated time**: 0.5-1 day

**Risks**:
- Users cannot use Const<vec2> or Const<color> in pure-signal graphs
- Forces field allocation even for single-instance use cases
- May surprise users expecting signal-level multi-component math

### Option C: Decompose to Scalar Components

**Required changes**:

1. **SignalEvaluator.ts** (~60 lines)
   - Implement packVec2/packColor as multi-slot writes
   - Store vec2 in slots [n, n+1], vec3 in [n, n+1, n+2]
   - Add unpack kernels to read components

2. **ScheduleExecutor.ts** (~40 lines)
   - Allocate contiguous slots for multi-component signals
   - Track stride per slot

3. **IRBuilder** (~30 lines)
   - Update slot allocation to reserve stride-many slots

**Estimated complexity**: MEDIUM (130 lines)
**Estimated time**: 1-1.5 days

**Risks**:
- More slots consumed per multi-component signal
- Complex slot allocation logic
- Reassembly overhead when reading multi-component values

### Option D: Hybrid Approach

**Strategy**: Implement Option B now (remove pure-signal paths) and defer Option A/C to later phase.

**Rationale**:
- Pure-signal multi-component operations are rare in practice
- Most real animations use per-element (field) behavior
- Gets the system working immediately
- Can add full support later if users need it

**Estimated complexity**: LOW initial, defer HIGH later
**Estimated time**: 0.5 day now, 2-3 days later if needed

## Recommendations

1. **Immediate (unblock current work)**: Choose Option D (Hybrid)
   - Remove broken pure-signal paths from multi-component blocks
   - Document the limitation
   - This fixes the immediate blockers without architectural changes

2. **If pure-signal multi-component is required later**: Implement Option C (Scalar decomposition)
   - Simpler than Option A (no return type change)
   - Uses existing infrastructure (slot allocation, writeF64Strided)
   - Can be done incrementally

3. **Add tests**: Regardless of approach
   - Test field-path multi-component operations (already work)
   - Test that pure-signal blocks with multi-component outputs throw clear errors
   - Add integration tests for color and geometry blocks

## Test Failures (Existing)

Current test run shows 9 failing tests, but these are unrelated to multi-component signals:
- 2 in continuity-integration.test.ts (crossfade policy)
- 1 in level9-continuity-decoupling.test.ts (stride missing)
- 1 in steel-thread-dual-topology.test.ts
- 4 in connection-validation.test.ts (payload-generic connections)
- 1 in event-blocks.test.ts (state persistence)

## Verdict
- [x] PAUSE - Architectural decision needed before implementation

Questions for User:
1. **Is pure-signal multi-component a real use case?** If users always have at least one field input (e.g., NormalizedIndex), Option D is sufficient.
2. **Priority order**: Should we fix the blockers now (Option D) and defer full support, or implement full support immediately?
3. **Const<vec2> and Const<color>**: Are these used in practice, or are constants usually per-element fields?

---

```
check project-evaluator complete
  Scope: multi-component-signals | Completion: 0% | Gaps: 5 missing kernels
  Workflow: PAUSE ("Architectural decision needed: scalar-only vs multi-component signals")
  -> Next: User decision on Option A/B/C/D
```
