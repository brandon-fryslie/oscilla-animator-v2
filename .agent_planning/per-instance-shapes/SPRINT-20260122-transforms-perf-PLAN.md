# Sprint: perf — Per-Instance Shapes Performance
Generated: 2026-01-22
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Optimize the per-instance shapes path with topology group caching and establish benchmark infrastructure to measure and document performance characteristics.

## Architectural Decision: No Per-Instance Transforms in Render Pipeline

Per-instance size, rotation, and scale2 are **NOT** render-pipeline concerns. They belong in the topology parameterization / field expression layer:

- **Size**: Parameterize topology (e.g., ellipse rx/ry, polygon radius)
- **Rotation**: Rotate control points in field expressions
- **Scale2**: Anisotropic scaling via topology params (e.g., ellipse rx ≠ ry)

The existing uniform `scale` signal (per render group, not per instance) remains as-is. No IR, compiler, block, or assembler changes needed for transforms.

The Canvas2DRenderer's per-instance transform support (rotation, scale2 in InstanceTransforms) stays in the type system as capability but is not wired through the pipeline — it's available if a future use case genuinely requires render-level transforms.

---

## Scope

**Deliverables:**
1. Topology group caching across frames (WeakMap, identity-based)
2. Vitest benchmark suite for assembler operations
3. Performance documentation with measured results

**Not in scope:**
- Per-instance size/rotation/scale2 (topology parameterization, not render pipeline)
- Compiler/block changes

---

## Work Items

### P0: Topology Group Caching

**Dependencies**: None
**Files**: `src/runtime/RenderAssembler.ts`

#### Description
Cache topology grouping results across frames. Use WeakMap keyed on the shape buffer reference — same buffer identity + same count = cache hit. Avoids Map + array allocations every frame for static scenes.

#### Acceptance Criteria
- [ ] WeakMap cache: `WeakMap<Uint32Array, { count: number; groups: Map<string, TopologyGroup> }>`
- [ ] Cache hit: same buffer reference AND same count → reuse groups (zero allocations)
- [ ] Cache miss: different buffer or different count → recompute and store
- [ ] Existing `groupInstancesByTopology` refactored: cache wrapper around compute
- [ ] No stale data possible (WeakMap releases when buffer is GC'd)
- [ ] Unit test: call twice with same buffer → groups computed once (spy on inner compute)
- [ ] Unit test: new buffer reference → recompute
- [ ] Unit test: same buffer, different count → recompute
- [ ] No behavioral change to callers (same return type, same semantics)

#### Technical Notes
```typescript
const topologyGroupCache = new WeakMap<
  Uint32Array,
  { count: number; groups: Map<string, TopologyGroup> }
>();

function groupInstancesByTopology(
  shapeBuffer: Uint32Array,
  instanceCount: number
): Map<string, TopologyGroup> {
  const cached = topologyGroupCache.get(shapeBuffer);
  if (cached && cached.count === instanceCount) {
    return cached.groups;
  }
  const groups = computeTopologyGroups(shapeBuffer, instanceCount);
  topologyGroupCache.set(shapeBuffer, { count: instanceCount, groups });
  return groups;
}

// Rename existing implementation to computeTopologyGroups
function computeTopologyGroups(
  shapeBuffer: Uint32Array,
  instanceCount: number
): Map<string, TopologyGroup> {
  // ... existing O(N) grouping logic unchanged ...
}
```

Why WeakMap:
- Key is the buffer object itself (identity-based)
- Same buffer reference = same content (materializer reuses references for unchanged fields)
- Buffer GC'd → cache entry automatically cleaned
- No manual invalidation logic needed

---

### P1: In-App Performance Instrumentation

**Dependencies**: None (parallel with caching)
**Files**: `src/runtime/RuntimeState.ts`, `src/runtime/RenderAssembler.ts`, `src/runtime/HealthMonitor.ts`

#### Description
Add per-operation timing to the existing HealthMetrics so assembler performance is visible in-app through the debug/health infrastructure. Track grouping time, slicing time, cache hit/miss, and total assembly time per frame.

#### Acceptance Criteria
- [ ] `HealthMetrics` extended with assembler timing fields (ring buffers, same pattern as frameTimes)
- [ ] `assemblerGroupingTimeMs`: time spent in topology grouping per frame
- [ ] `assemblerSlicingTimeMs`: time spent in buffer slicing per frame
- [ ] `assemblerTotalTimeMs`: total assembly time per frame
- [ ] `topologyGroupCacheHits` / `topologyGroupCacheMisses`: counters
- [ ] Timing recorded via `performance.now()` around grouping and slicing calls
- [ ] Timing data accessible through existing HealthMonitor snapshot system
- [ ] Overhead < 1% frame budget (performance.now() calls are cheap)
- [ ] Data available for debug UI to display (same pattern as frame timing stats)

#### Technical Notes

Extend HealthMetrics (same ring buffer pattern as frameTimes):
```typescript
// In RuntimeState.ts HealthMetrics:
/** Assembler timing - topology grouping (ms per frame, ring buffer) */
assemblerGroupingMs: number[];
assemblerGroupingMsIndex: number;

/** Assembler timing - buffer slicing (ms per frame, ring buffer) */
assemblerSlicingMs: number[];
assemblerSlicingMsIndex: number;

/** Assembler timing - total assembly (ms per frame, ring buffer) */
assemblerTotalMs: number[];
assemblerTotalMsIndex: number;

/** Topology group cache hit/miss counters (reset each snapshot window) */
topologyGroupCacheHits: number;
topologyGroupCacheMisses: number;
```

In RenderAssembler, wrap operations:
```typescript
function assemblePerInstanceShapes(...): DrawPathInstancesOp[] {
  const t0 = performance.now();
  const groups = groupInstancesByTopology(shapeBuffer, count);
  const tGrouped = performance.now();

  // ... slicing loop ...
  const tSliced = performance.now();

  // Record to health metrics
  recordAssemblerTiming(state, {
    groupingMs: tGrouped - t0,
    slicingMs: tSliced - tGrouped,
    totalMs: tSliced - t0,
  });

  return ops;
}
```

Cache hit/miss tracking in groupInstancesByTopology:
```typescript
if (cached && cached.count === instanceCount) {
  state.health.topologyGroupCacheHits++;
  return cached.groups;
}
state.health.topologyGroupCacheMisses++;
```

This feeds into the existing HealthMonitor snapshot system, making it available to any debug UI panel.

---

### P1: Buffer View Optimization

**Dependencies**: Topology group caching (uses same grouping result)
**Files**: `src/runtime/RenderAssembler.ts`

#### Description
Optimize `sliceInstanceBuffers()` to use `TypedArray.subarray()` (zero-copy view) when a topology group's instance indices are contiguous. For non-contiguous indices, keep the existing copy path. This eliminates per-frame allocations for the common case where instances of the same topology are adjacent in the buffer.

#### Acceptance Criteria
- [ ] Detect contiguous index runs: indices [3,4,5,6] → contiguous, [0,3,7] → non-contiguous
- [ ] Contiguous case: use `fullPosition.subarray(start*2, (start+count)*2)` — zero allocation
- [ ] Non-contiguous case: existing copy logic (unchanged)
- [ ] Color buffer: same optimization (contiguous → subarray, else copy)
- [ ] Returned buffers are correct regardless of path taken
- [ ] Unit test: contiguous indices → returns subarray (same underlying buffer)
- [ ] Unit test: non-contiguous indices → returns copy (different buffer)
- [ ] Unit test: single-element group → subarray (trivially contiguous)
- [ ] Unit test: full range [0..N-1] → subarray of entire buffer
- [ ] Benchmark: measure allocation reduction for sorted vs unsorted instance buffers

#### Technical Notes
Contiguity check is O(1) — just compare first and last index:
```typescript
function isContiguous(indices: number[]): boolean {
  if (indices.length <= 1) return true;
  return indices[indices.length - 1] - indices[0] === indices.length - 1;
}

function sliceInstanceBuffers(
  fullPosition: Float32Array,
  fullColor: Uint8ClampedArray,
  instanceIndices: number[]
): SlicedBuffers {
  const N = instanceIndices.length;

  if (isContiguous(instanceIndices)) {
    // Zero-copy views
    const start = instanceIndices[0];
    return {
      position: fullPosition.subarray(start * 2, (start + N) * 2),
      color: fullColor.subarray(start * 4, (start + N) * 4),
    };
  }

  // Non-contiguous: copy (existing logic)
  const position = new Float32Array(N * 2);
  const color = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    const srcIdx = instanceIndices[i];
    position[i*2]   = fullPosition[srcIdx*2];
    position[i*2+1] = fullPosition[srcIdx*2+1];
    color[i*4]   = fullColor[srcIdx*4];
    color[i*4+1] = fullColor[srcIdx*4+1];
    color[i*4+2] = fullColor[srcIdx*4+2];
    color[i*4+3] = fullColor[srcIdx*4+3];
  }
  return { position, color };
}
```

**Important assumption**: `instanceIndices` must be sorted for `isContiguous` to work. The grouping algorithm builds indices in order (appends as it iterates), so they ARE sorted. Add an assertion in debug mode if concerned.

**When does this help?**
- Instances of the same topology are often adjacent in the buffer (created together by the same block)
- For N topologies with equal distribution: each group is contiguous → zero allocations
- For randomly interleaved topologies: groups are non-contiguous → falls back to copies

---

### P2: Vitest Benchmark Suite (Regression Detection)

**Dependencies**: Caching complete (to benchmark cache vs no-cache)
**Files**: `vitest.config.ts`, `package.json`, new `src/runtime/__benchmarks__/RenderAssembler.bench.ts`

#### Description
Vitest benchmarks for automated regression detection. These complement the in-app instrumentation — benchmarks catch regressions in CI, in-app metrics show live behavior.

#### Acceptance Criteria
- [ ] `npm run bench` script in package.json
- [ ] Vitest bench config added (include `__benchmarks__/*.bench.ts`)
- [ ] Benchmark: `computeTopologyGroups` at (100/5), (500/10), (1000/50)
- [ ] Benchmark: `sliceInstanceBuffers` at 2+ scales
- [ ] Benchmark: cache hit vs miss comparison
- [ ] Results: ops/sec and median time
- [ ] Exports needed: `computeTopologyGroups`, `sliceInstanceBuffers` (test-only exports)

---

### P3: Performance Documentation

**Dependencies**: In-app instrumentation and benchmarks complete
**Files**: new `src/runtime/__benchmarks__/PERFORMANCE.md`

#### Description
Document measured performance characteristics. Factual, measured, no aspirational claims.

#### Acceptance Criteria
- [ ] Allocation pattern per frame documented (cached vs per-frame)
- [ ] In-app metrics fields documented (what each HealthMetrics field means)
- [ ] Benchmark results table (operations × scales → ops/sec)
- [ ] Cache effectiveness documented (hit rate, allocation savings)
- [ ] Future optimization opportunities:
  - Buffer views (subarray for contiguous indices)
  - Pre-allocated scratch buffers
  - Sorted emission (minimize canvas state changes)
- [ ] "Copies acceptable" rationale with measured cost

---

## Dependencies

- Per-instance shapes core: ✅ COMPLETE (previous sprint)
- `groupInstancesByTopology`: ✅ EXISTS (refactor to add cache)
- `sliceInstanceBuffers`: ✅ EXISTS (measure, don't change)
- Vitest: ✅ CONFIGURED (add bench mode)

## Risks

### NONE — This is pure optimization + measurement work
- Topology group caching: same semantics, fewer allocations
- Benchmarks: read-only measurement of existing code
- Documentation: recording facts

No behavioral changes to any user-facing functionality.

## Implementation Order

```
P0: Topology group caching (RenderAssembler.ts) ────┐
                                                     ├── parallel
P1: In-app instrumentation (HealthMetrics + timing) ┘
                        ↓
P1: Buffer view optimization (uses cached groups, measures improvement)
                        ↓
P2: Vitest benchmark suite (regression detection)
                        ↓
P3: Performance documentation (after measurements)
```

## Verification

```bash
npm run typecheck     # No type errors
npm run test          # All existing + cache + instrumentation tests pass
npm run bench         # Benchmarks produce results
npm run dev           # In-app: verify timing data appears in health metrics
```

Cache verification:
- Static scene (same shape buffer each frame): zero allocation after first frame
- Dynamic scene (new buffer each frame): same perf as before (cache miss = current behavior)

In-app verification:
- Run app with per-instance shapes patch
- Observe assembler timing in health metrics (grouping, slicing, total)
- Verify cache hit counter increments for static scenes
- Verify overhead < 1% frame budget
