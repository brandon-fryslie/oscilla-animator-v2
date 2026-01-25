# Definition of Done: buffer-prealloc
Sprint: Preallocate Depth-Sort Permutation Buffers
Bead: oscilla-animator-v2-la0

## Acceptance Criteria

### 1. Module-Level Buffer Pool
- [ ] `pooledIndices: Uint32Array` declared at module level
- [ ] `pooledScreenPos: Float32Array` declared at module level (stride 2)
- [ ] `pooledRadius: Float32Array` declared at module level (stride 1)
- [ ] `pooledDepth: Float32Array` declared at module level (stride 1)
- [ ] `pooledColor: Uint8ClampedArray` declared at module level (stride 4)
- [ ] `pooledRotation: Float32Array` declared at module level (stride 1)
- [ ] `pooledScale2: Float32Array` declared at module level (stride 2)
- [ ] Initial capacity of at least 256 instances

### 2. Grow-Only Resize Helper
- [ ] `ensureBufferCapacity(count: number)` function exists
- [ ] Returns early if current capacity is sufficient
- [ ] Grows all buffers together to avoid capacity mismatch
- [ ] Uses at least 2x growth factor (amortized O(1))

### 3. depthSortAndCompact Updated
- [ ] Calls `ensureBufferCapacity(count)` at function start
- [ ] Uses `Uint32Array` for indices instead of `number[]`
- [ ] Writes output to pooled buffers (no `new Float32Array` in hot path)
- [ ] Returns properly-sized subarrays (`.subarray(0, visibleCount)`)
- [ ] Return value interface unchanged (same properties, same behavior)

### 4. Tests Pass
- [ ] `npm run typecheck` passes
- [ ] `npm run test RenderAssembler.test.ts` passes
- [ ] `npm run test RenderAssembler-per-instance-shapes.test.ts` passes
- [ ] Full test suite has no new failures

### 5. No Behavior Change
- [ ] Existing callers work without modification
- [ ] Sort order unchanged (far-to-near, stable)
- [ ] Fast-path optimization still works (skip sort for already-ordered)

## Out of Scope
- Thread safety (single-threaded runtime)
- Buffer clearing/zeroing (not needed - we overwrite)
- Performance benchmarking (nice-to-have, not required)
- Changes to public interface

## Verification Commands
```bash
npm run typecheck
npm run test RenderAssembler.test.ts
npm run test RenderAssembler-per-instance-shapes.test.ts
npm run test
```
