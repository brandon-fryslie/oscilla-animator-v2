# Memory Leak Investigation and Fix Plan

**Date**: 2026-01-20
**Issue**: Excessive memory usage (10.9GB Float32Array, 500MB Uint8ClampedArray)

## Root Cause Analysis

### Primary Issue: BufferPool.releaseAll() Never Called

The `BufferPool` class has a `releaseAll()` method designed to return buffers to the pool at frame end, but **this method is never invoked** in the animation loop.

**Evidence:**
- `BufferPool.releaseAll()` defined at `src/runtime/BufferPool.ts:101-108`
- Animation loop in `src/main.ts:714-839` - no call to `pool.releaseAll()`
- The pool continuously allocates new buffers via `pool.alloc()` every frame without ever recycling them

### Memory Growth Pattern

With 5000 elements and ~60 FPS:
- Per frame allocations (conservatively):
  - `f32` buffers: 5000 elements × 4 bytes = 20KB per buffer
  - `vec2f32` buffers: 5000 elements × 8 bytes = 40KB per buffer
  - `rgba8` buffers: 5000 elements × 4 bytes = 20KB per buffer
- Multiple buffers per frame for position, color, size, etc.
- At 60 FPS, unbounded growth: ~100KB+ × 60 = ~6MB/second minimum

After just 30 minutes: 10+ GB (matches profiler data)

### Secondary Issue: FrameCache.fieldBuffers Never Cleared

The `FrameCache` uses stamp-based invalidation (`fieldStamps`) to avoid recomputing buffers within a frame, but old entries are never removed from the cache Maps.

**Evidence:**
- `fieldBuffers: Map<string, ArrayBufferView>` at `src/runtime/RuntimeState.ts:55`
- Cache entries added at `src/runtime/Materializer.ts:82`
- No cleanup logic - old entries accumulate indefinitely

### Tertiary Issue: ContinuityState Allocations

During domain changes, `ContinuityApply.ts` creates snapshot copies:
- `oldSlewSnapshot = new Float32Array(...)` at line 343
- `oldGaugeSnapshot = new Float32Array(...)` at line 344
- `crossfadeOldBuffer = new Float32Array(...)` at line 572

These are necessary for correctness but compound the problem when combined with the primary leak.

## Fix Strategy

### Fix 1: Call releaseAll() After Each Frame (CRITICAL)

**File**: `src/main.ts`
**Location**: End of animate() function, after rendering

```typescript
// After line 739 (after renderFrame call)
pool.releaseAll();
```

This single line fix should eliminate ~90% of the memory growth.

### Fix 2: Limit FrameCache Size

**File**: `src/runtime/RuntimeState.ts` or `src/runtime/Materializer.ts`

Add cache size limit and LRU eviction:
```typescript
// In materialize(), before caching:
const MAX_CACHED_FIELDS = 100;
if (state.cache.fieldBuffers.size > MAX_CACHED_FIELDS) {
  // Evict oldest entries (those with lowest stamps)
  const entries = [...state.cache.fieldStamps.entries()];
  entries.sort((a, b) => a[1] - b[1]);
  const toEvict = entries.slice(0, entries.length - MAX_CACHED_FIELDS);
  for (const [key] of toEvict) {
    state.cache.fieldBuffers.delete(key);
    state.cache.fieldStamps.delete(key);
  }
}
```

### Fix 3: Optimize ContinuityState Snapshots (Low Priority)

The snapshot allocations in `ContinuityApply.ts` are necessary for correctness during domain changes. However, we could pool these buffers:
- Pre-allocate snapshot buffers per target
- Resize only when needed
- This is an optimization, not a correctness fix

## Implementation Order

1. **Fix 1**: Add `pool.releaseAll()` - 1 line, immediate impact
2. **Fix 2**: Add cache size limit - ~20 lines, prevents long-term growth
3. **Fix 3**: Pool snapshots - optional, minor impact

## Verification

After applying Fix 1:
1. Open Memory profiler
2. Take heap snapshot at t=0
3. Run animation for 2 minutes
4. Take heap snapshot at t=2min
5. Compare: Float32Array count should be stable (hundreds, not hundreds of thousands)

Expected result: Memory usage stable at <100MB instead of growing to 10GB+.

## Confidence Level

**High** - The analysis is clear:
- `BufferPool` is designed for recycling but recycling is never triggered
- The 493K Float32Array instances match expected allocation rate over time
- Single line fix (`pool.releaseAll()`) should resolve the primary issue
