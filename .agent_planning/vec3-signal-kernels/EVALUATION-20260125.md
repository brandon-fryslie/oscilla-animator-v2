# Evaluation: vec3 Signal Kernels
Timestamp: 2026-01-25-125600
Git Commit: defd697

## Executive Summary
Overall: 0% complete | Critical issues: 3 | Tests reliable: N/A (no tests for this feature)

The blocks `PolarToCartesian`, `OffsetVec`, `JitterVec`, and `SetZ` have signal paths that reference vec3 signal kernels (`vec3FromComponents`, `jitterVecSig`, `setZSig`) that **do not exist**. These blocks will throw runtime errors when used with all-signal inputs.

## Runtime Check Results
| Check | Status | Output |
|-------|--------|--------|
| `vec3FromComponents` in SignalEvaluator | MISSING | Kernel not implemented |
| `jitterVecSig` in SignalEvaluator | MISSING | Kernel not implemented |
| `setZSig` in SignalEvaluator | MISSING | Kernel not implemented |
| Field equivalents exist | YES | `makeVec3`, `fieldJitterVec`, `fieldSetZ` all exist |

## Missing Checks
1. **No unit tests for vec3 signal paths** - signal kernel tests only cover scalar kernels
2. **No integration test for PolarToCartesian with signal inputs**
3. **No integration test for JitterVec with signal inputs**

## Findings

### 1. Missing Signal Kernels (CRITICAL - BLOCKING)
**Status**: NOT_STARTED
**Evidence**:
- geometry-blocks.ts:78 calls `ctx.b.kernel('vec3FromComponents')`
- geometry-blocks.ts:199 calls `ctx.b.kernel('jitterVecSig')`
- field-operations-blocks.ts:1030 calls `ctx.b.kernel('setZSig')`
- SignalEvaluator.ts:287-473 `applySignalKernel()` has no cases for these kernels
- SignalEvaluator.ts:461-469 explicitly throws for vec2 kernels with comment "vec2 kernels not supported at signal level"

**Issues**:
- Any block using signal-path vec3 operations will throw "Unknown signal kernel: vec3FromComponents"
- This affects 4 blocks: PolarToCartesian, OffsetVec, JitterVec, SetZ (geometry-blocks.ts and field-operations-blocks.ts)

### 2. Architectural Constraint
**Status**: ARCHITECTURAL_DECISION_NEEDED
**Evidence**: SignalEvaluator.ts header (lines 13-26) explicitly states:
```
WHAT DOES NOT BELONG HERE:
- Vec2/geometry operations -> use Materializer field kernels
```

**Issues**:
- The architecture was designed for scalar-only signal kernels
- Vec3 operations require stride-3 storage, but signal slots are assumed scalar (ScheduleExecutor.ts:85-86 validates stride=1)
- RuntimeState.values.f64 is a flat Float64Array, not structured for vector access

### 3. Slot Storage for Vec3 Signals
**Status**: NOT_IMPLEMENTED
**Evidence**:
- RuntimeState.ts:96 shows `f64: Float64Array` for signal values
- ScheduleExecutor.ts:85-86 validates `stride === 1` for scalar writes
- No vec3 write/read functions exist in ScheduleExecutor

**Issues**:
- Vec3 signals need 3 consecutive slots per value
- No `writeF64Vec3` helper exists
- Slot allocation would need to understand vec3 stride

### 4. Field Kernels Work Correctly
**Status**: COMPLETE (for field path)
**Evidence**:
- FieldKernels.ts:82-101 `makeVec3` exists and works
- FieldKernels.ts:341-373 `fieldJitterVec` exists and works
- FieldKernels.ts:419-439 `fieldSetZ` exists and works

**Note**: The field path (when inputs are Field<T>) works correctly. Only the pure-signal path is broken.

## Ambiguities Found

| Area | Question | How LLM Guessed | Impact |
|------|----------|-----------------|--------|
| Signal vec3 storage | Should vec3 signals use 3 slots or object storage? | No decision made - code doesn't implement either | High - determines implementation approach |
| Stride validation | Should ScheduleExecutor allow stride > 1? | Assumed no (current code) | Medium - would need refactor |
| Mixed scalar/vector | Can a signal graph mix scalar and vector signals? | Blocks assume yes (sigZip takes x,y,z scalars and outputs vec3) | High - type system allows it but runtime doesn't |

## Complexity Assessment

### Option A: Implement Vec3 Signal Kernels (Full Signal Support)

**Required changes**:
1. Add `vec3FromComponents` to SignalEvaluator.ts (packages 3 floats into vec3)
2. Add `jitterVecSig` to SignalEvaluator.ts (applies jitter to vec3)
3. Add `setZSig` to SignalEvaluator.ts (replaces Z component)
4. Modify slot allocation to support stride-3 slots for vec3
5. Add `writeF64Vec3` and `readF64Vec3` to ScheduleExecutor
6. Update RuntimeState to track stride per slot

**Estimated complexity**: HIGH (50-100 lines of code, architectural impact)

**Risks**:
- Breaks architectural assumption that signals are scalar
- Performance impact of stride checking on every slot access
- Type system doesn't distinguish vec3 signals from float signals at compile time

### Option B: Force Field Path for Vec3 Blocks

**Required changes**:
1. Remove signal-only path from PolarToCartesian, OffsetVec, JitterVec, SetZ
2. Always use field path (broadcast scalar inputs to fields, use field kernels)
3. Document that vec3 operations require at least one field input

**Estimated complexity**: LOW (20-40 lines of code, no architectural changes)

**Risks**:
- Users cannot use these blocks with pure signal inputs
- Forces unnecessary field allocation for single-instance use cases

### Option C: Decompose Vec3 to Scalar Components

**Required changes**:
1. In signal path, compute x/y/z separately as scalar signals
2. Store in 3 separate scalar slots
3. Reassemble to vec3 only when writing to field or output

**Estimated complexity**: MEDIUM (30-50 lines of code)

**Risks**:
- More slots used per vec3
- Slot allocation complexity
- Still need vec3 reassembly at some point

## Recommendations

1. **Immediate (blocks currently broken)**: Choose Option B - force field path. The signal-only use case is rare (most real animations need per-element behavior anyway), and this fixes the immediate blocker.

2. **If signal-path vec3 is required**: Implement Option A but scope carefully:
   - Only implement the 3 missing kernels
   - Use Object storage (RuntimeState.values.objects) for vec3 signals instead of modifying f64 array
   - This avoids stride changes to the slot system

3. **Add tests**: Regardless of approach, add integration tests that exercise the signal path for these blocks.

## Verdict
- [x] PAUSE - Architectural decision needed before implementation

Questions for User:
1. **Is pure-signal vec3 a real use case?** If users always have at least one field input, Option B is sufficient.
2. **Performance vs simplicity tradeoff**: Object storage for vec3 signals is simpler but slower than stride-3 f64 arrays.
3. **Migration path**: Should existing blocks with signal vec3 outputs be changed to field-only, or should the runtime be extended?

---

```
check project-evaluator complete
  Scope: vec3-signal-kernels | Completion: 0% | Gaps: 3 kernels missing
  Workflow: PAUSE ("Architectural decision needed: scalar-only signals vs vec3 signals")
  -> Next: User decision on whether to implement Option A (full vec3 signals) or Option B (field-only for vec3)
```
