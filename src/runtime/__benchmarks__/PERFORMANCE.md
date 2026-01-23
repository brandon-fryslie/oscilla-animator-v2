# RenderAssembler Performance

## Allocation Patterns

### Per-Frame (Cached — Static Scenes)
- **Topology grouping**: Zero allocations after first frame (WeakMap cache hit)
- **Buffer slicing (contiguous)**: Zero allocations (TypedArray.subarray views)
- **Buffer slicing (non-contiguous)**: 2 allocations per group (Float32Array + Uint8ClampedArray)

### Per-Frame (Uncached — Dynamic Scenes)
- **Topology grouping**: 1 Map + N group objects + N arrays
- **Buffer slicing**: Same as above based on contiguity

### Cache Invalidation
- WeakMap keyed on buffer identity (same reference = cache hit)
- Count check: same buffer but different instance count = cache miss
- Buffer GC'd → entry automatically released (no manual invalidation)

## In-App Metrics (HealthMetrics Fields)

| Field | Type | Description |
|-------|------|-------------|
| `assemblerGroupingMs` | Ring buffer (10) | Time spent in topology grouping per frame |
| `assemblerSlicingMs` | Ring buffer (10) | Time spent in buffer slicing per frame |
| `assemblerTotalMs` | Ring buffer (10) | Total assembly time per frame |
| `topologyGroupCacheHits` | Counter | Cache hits in current snapshot window |
| `topologyGroupCacheMisses` | Counter | Cache misses in current snapshot window |

These feed into the existing HealthMonitor snapshot system and are visible through debug UI.

## Benchmark Results

Environment: vitest bench, Node.js, Apple Silicon

### computeTopologyGroups (uncached)

| Scale | ops/sec | Mean (µs) |
|-------|---------|-----------|
| 100 instances / 5 topologies | 105,105 | 9.5 |
| 500 instances / 10 topologies | 13,193 | 75.8 |
| 1000 instances / 50 topologies | 8,509 | 117.5 |

### sliceInstanceBuffers

| Scale | Path | ops/sec | Mean (µs) |
|-------|------|---------|-----------|
| 100 instances | contiguous (subarray) | 5,316,280 | 0.2 |
| 100 instances | non-contiguous (copy) | 227,380 | 4.4 |
| 500 instances | contiguous (subarray) | 2,197,375 | 0.5 |
| 500 instances | non-contiguous (copy) | 46,866 | 21.3 |

### Cache Effectiveness

| Scenario | ops/sec | Speedup |
|----------|---------|---------|
| Cache hit | 3,893,079 | — |
| Cache miss | 5,135 | 758x slower |

## Key Findings

1. **Cache hit eliminates grouping cost entirely** (~758x speedup). Static scenes benefit most.
2. **Subarray views eliminate allocation** for contiguous groups (23-113x faster than copies).
3. **Grouping is O(N)** and scales linearly with instance count.
4. **Copy path cost** is dominated by allocation, not data movement.

## Future Optimization Opportunities

- **Pre-allocated scratch buffers**: Reuse fixed-size buffers for non-contiguous copies
- **Sorted emission**: Sort instances by topology at block level to maximize contiguity
- **SIMD copy**: Use SIMD intrinsics for non-contiguous buffer copies (WebAssembly path)
- **Shared topology groups across render steps**: If multiple steps share the same shape buffer
