# Memory Leak Prevention - Evaluation

**Generated:** 2026-01-25
**Topic:** Memory Leak Prevention / Hot Loop Memory Discipline
**Status:** CONTINUE

## Executive Summary

The codebase has **strong existing memory discipline** with BufferPool, WeakMap caching, and frame-boundary release patterns. However, there are **specific leak vectors** and **missing mechanical enforcement** that prevent "solving memory leaks forever."

The user's observation of "substantial memory leak in the hot loop" is likely caused by one of the identified leak vectors below.

## Current Architecture Assessment

### ✅ Strengths (Already Well-Designed)

| Component | Pattern | Assessment |
|-----------|---------|------------|
| BufferPool | Format:count keying + releaseAll() per frame | Excellent |
| Slot Lookup | WeakMap keyed on CompiledProgramIR | Excellent |
| Event Payloads | Cleared at frame start, reused allocation | Good |
| Topology Group Cache | WeakMap on buffer identity | Excellent |
| React Event Listeners | useEffect cleanup | Good |
| Field Buffer Cache | Frame-stamped + LRU eviction | Good |

### ⚠️ Identified Leak Vectors

#### V1: depthSortAndCompact Subarray Retention (HIGH RISK)
**Location:** `RenderAssembler.ts:257-273`

The function returns **views** into module-level pooled buffers. If any caller retains these views beyond immediate use, they point to corrupted data on next frame. No runtime guard exists.

**Evidence of leak:** When multiple topology groups are processed, `assemblePerInstanceShapes()` correctly copies the compacted data (lines 830-838). But the single-group path in `assembleDrawPathInstancesOp()` returns the subarray views directly without copying (lines 1196-1206).

```typescript
// LEAK: Returns view into pooled buffer without copy
const compacted = depthSortAndCompact(projection, count, colorBuffer, rotation, scale2);
// buildInstanceTransforms receives the view, which may be stored in frame.ops
```

#### V2: Frame.ops Array Accumulation (MEDIUM RISK)
**Location:** `ScheduleExecutor.ts:488, AnimationLoop.ts:157`

The `frame.ops` array is read by AnimationLoop to compute element counts:
```typescript
const totalElements = frame.ops.reduce((sum, op) => sum + op.instances.count, 0);
```

If the RenderFrameIR object is retained (e.g., by debug/inspection tools), all DrawOp instances and their buffers are kept alive.

#### V3: Materializer Cache Unbounded Growth (MEDIUM RISK)
**Location:** `Materializer.ts:232-250`

The cache has a limit (MAX_CACHED_FIELDS = 200) but eviction runs **after** the limit is exceeded. During domain changes or rapid recompiles, temporary field allocations can spike above the limit before eviction runs.

#### V4: Module-Level Pooled Buffers Never Shrink (LOW RISK)
**Location:** `RenderAssembler.ts:56-64`

Pooled buffers (`pooledIndices`, `pooledScreenPos`, etc.) grow with 2x factor but never shrink. After processing a large scene (100K elements), these buffers remain large even when scene shrinks to 100 elements.

#### V5: ProjectInstances Pool Fallback (LOW RISK)
**Location:** `RenderAssembler.ts:308`

`visible` buffer is always allocated fresh (`new Uint8Array(count)`) because there's no pool for uint8 arrays:
```typescript
const visible = new Uint8Array(count); // No pool for uint8 yet
```

This creates GC pressure on every projection call.

#### V6: Topology Group Cache Memory Pressure (LOW RISK)
**Location:** `RenderAssembler.ts:561-564`

WeakMap is keyed on buffer identity. During rapid recompiles, new buffers are created, old ones become garbage, but the cache entries persist until GC runs. Memory pressure spikes before GC.

## Missing Mechanical Enforcement

### E1: No Invariant for Buffer Lifetime
There's no compile-time or runtime check that subarray views from `depthSortAndCompact` are not retained beyond their valid scope.

### E2: No Pool Exhaustion Monitoring
If pool allocation exceeds expectations, there's no alert or metric. Leaks can go unnoticed.

### E3: No Per-Frame Memory Tracking
The health monitor tracks frame timing but not memory allocation counts or sizes.

### E4: No Automated Leak Detection in Tests
Tests don't verify that pool sizes return to baseline after frame completion.

## Verdict: CONTINUE

The architecture is sound but lacks:
1. Mechanical enforcement of buffer lifetime invariants
2. Runtime instrumentation for leak detection
3. Automated testing of memory discipline

## Recommendations by Sprint

1. **Sprint 1 (HIGH confidence):** Fix V1 - depthSortAndCompact subarray retention
2. **Sprint 2 (HIGH confidence):** Add memory instrumentation to health monitor
3. **Sprint 3 (MEDIUM confidence):** Add invariant enforcement (debug-mode guards)
4. **Sprint 4 (MEDIUM confidence):** Automated leak detection in test suite
5. **Sprint 5 (LOW confidence):** Pool shrink policy and advanced memory management
