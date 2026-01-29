# Implementation Context: immediate-leak-fix

**Sprint:** Fix Subarray Retention Memory Leak
**Generated:** 2026-01-25

## Code Locations

### Primary Fix Location
`src/runtime/RenderAssembler.ts:1183-1239`

This is the **single-group uniform shape path** in `assembleDrawPathInstancesOp()`. It currently returns subarray views directly from `depthSortAndCompact()`.

### Reference Implementation (Correct Pattern)
`src/runtime/RenderAssembler.ts:826-848`

The **multi-group per-instance shapes path** in `assemblePerInstanceShapes()` already does the right thing:

```typescript
// Lines 830-838: CORRECT - copies all buffers
const compactedCopy = {
  count: compacted.count,
  screenPosition: new Float32Array(compacted.screenPosition),
  screenRadius: new Float32Array(compacted.screenRadius),
  depth: new Float32Array(compacted.depth),
  color: new Uint8ClampedArray(compacted.color),
  rotation: compacted.rotation ? new Float32Array(compacted.rotation) : undefined,
  scale2: compacted.scale2 ? new Float32Array(compacted.scale2) : undefined,
};
```

### The Leak Mechanism

1. `depthSortAndCompact()` returns subarray views into module-level pooled buffers
2. Single-group path passes these views directly to `buildInstanceTransforms()`
3. `buildInstanceTransforms()` stores them in `InstanceTransforms` object
4. The `InstanceTransforms` is stored in `DrawOp`
5. `DrawOp` is stored in `frame.ops`
6. `frame.ops` is read by AnimationLoop (line 157) for stats
7. If frame is retained by any debug/inspection code, the views are retained
8. **Next frame:** pooled buffers are overwritten, views point to garbage

## Why Multi-Group Path Doesn't Leak

The multi-group path **loops** over groups, calling `depthSortAndCompact()` multiple times. If it didn't copy, each call would overwrite the previous group's data. The copy was added specifically to prevent this.

The single-group path only calls `depthSortAndCompact()` once, so the immediate data is valid. The leak happens when the frame persists across frames (debug inspection, retained references).

## Copy Cost Analysis

The copy is cheap because:
1. Only **visible** elements are copied (post-culling)
2. Typical visible count is 100-10000 elements
3. Copy is O(N) memcpy, very fast

For 10000 elements:
- screenPosition: 10000 * 2 * 4 = 80KB
- screenRadius: 10000 * 4 = 40KB
- depth: 10000 * 4 = 40KB
- color: 10000 * 4 = 40KB
- Total: ~200KB per frame per render step

At 60fps, this is ~12MB/s of copying, which is negligible for modern CPUs.

## Alternative: Pool the Output

Instead of copying, we could allocate the output from BufferPool. This would require:
1. Passing `pool` through more call sites
2. Ensuring the output is released at frame end
3. More complex lifetime tracking

The copy approach is simpler and sufficient for now.

## Testing Strategy

1. **Unit test:** Verify that modifying pooled buffers after `depthSortAndCompact` doesn't affect stored DrawOp data
2. **Integration test:** Run 1000 frames, check heap size stability
3. **Manual test:** Chrome DevTools memory profiling

## Related Code

- `AnimationLoop.ts:111` - `pool.releaseAll()` is called correctly
- `AnimationLoop.ts:157` - Reads `frame.ops` for element count
- `RuntimeState.ts` - Frame cache structures
- `BufferPool.ts` - Pool implementation (well-designed)
