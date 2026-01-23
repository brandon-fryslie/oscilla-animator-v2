# Definition of Done: perf (Per-Instance Shapes Performance)
Generated: 2026-01-22
Confidence: HIGH
Plan: SPRINT-20260122-transforms-perf-PLAN.md
Status: COMPLETE

## Architectural Decision Recorded

- [x] Per-instance size/rotation/scale2 confirmed as NOT render-pipeline concerns
- [x] Topology parameterization documented as the correct layer for per-instance scaling/rotation
- [x] Existing uniform `scale` signal (per render group) stays unchanged

## Topology Group Caching

- [x] WeakMap cache implemented in RenderAssembler.ts
- [x] Cache hit: same buffer ref + same count → reuse (zero allocations)
- [x] Cache miss: different buffer or count → recompute and store
- [x] Existing function refactored: cache wrapper + renamed inner compute
- [x] No behavioral change to callers
- [x] Unit test: hit scenario (same ref, computed once)
- [x] Unit test: miss scenario (new ref, recomputed)
- [x] Unit test: miss scenario (same ref, different count)

## In-App Performance Instrumentation

- [x] HealthMetrics extended with assembler timing fields (ring buffers)
- [x] `assemblerGroupingMs`: recorded per frame
- [x] `assemblerSlicingMs`: recorded per frame
- [x] `assemblerTotalMs`: recorded per frame
- [x] `topologyGroupCacheHits` / `topologyGroupCacheMisses`: counters
- [x] Timing via `performance.now()` in assembler
- [x] Data accessible through HealthMonitor snapshot system
- [x] Overhead < 1% frame budget
- [x] Visible in-app through existing debug infrastructure

## Buffer View Optimization

- [x] Contiguity detection: O(1) check on index array
- [x] Contiguous indices → `TypedArray.subarray()` (zero-copy view)
- [x] Non-contiguous indices → existing copy path (unchanged)
- [x] Both position and color buffers optimized
- [x] Unit test: contiguous → returns subarray (same underlying ArrayBuffer)
- [x] Unit test: non-contiguous → returns copy (different ArrayBuffer)
- [x] Unit test: single-element → subarray
- [x] Unit test: full range → subarray of entire buffer
- [x] Benchmark: allocation reduction measured (sorted vs unsorted)

## Vitest Benchmark Suite

- [x] `npm run bench` script works
- [x] Benchmarks: groupInstancesByTopology at 3 scales
- [x] Benchmarks: sliceInstanceBuffers at 2+ scales (contiguous vs non-contiguous)
- [x] Benchmarks: cache hit vs miss
- [x] Results: ops/sec and median time

## Performance Documentation

- [x] Allocation patterns documented (cached vs per-frame)
- [x] In-app metric fields documented
- [x] Benchmark results table
- [x] Cache effectiveness measured
- [x] Future optimizations listed

## Verification

```bash
npm run typecheck     # ✅ No new type errors (2 pre-existing in DebugMiniView.test.tsx)
npm run test          # ✅ 68 files, 1141 tests pass
npm run bench         # ✅ All benchmarks produce results
```

### Benchmark Highlights
- Cache hit: **1048x faster** than cache miss
- Contiguous subarray: **32x faster** than non-contiguous copy (500 instances)
- computeTopologyGroups: 105K ops/sec at 100 instances

## NOT in Scope (Confirmed)

- Per-instance size/rotation/scale2 at render level (topology parameterization instead)
- Block/compiler/IR changes
