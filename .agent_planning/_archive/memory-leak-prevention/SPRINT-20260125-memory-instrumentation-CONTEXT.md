# Implementation Context: memory-instrumentation

**Sprint:** Add Memory Observability
**Generated:** 2026-01-25

## Health Monitor Architecture

### Current Flow
```
AnimationLoop.executeAnimationFrame()
  → executeFrame()
  → recordFrameTime(state, frameTime)
  → shouldEmitSnapshot(state) → emitHealthSnapshot()
  → pool.releaseAll()
```

### Proposed Flow
```
AnimationLoop.executeAnimationFrame()
  → executeFrame()
  → recordFrameTime(state, frameTime)
  → recordPoolStats(state, pool)  // NEW
  → shouldEmitSnapshot(state) → emitHealthSnapshot()  // Now includes memory
  → pool.releaseAll()
```

## Key Files

### src/runtime/BufferPool.ts

Add instrumentation counters:

```typescript
export class BufferPool {
  // ... existing pools/inUse maps ...

  // Instrumentation
  private allocsThisFrame = 0;
  private totalPooledBytes = 0;

  // Frame stats (recorded before reset)
  private lastStats = { allocs: 0, releases: 0, pooledBytes: 0, poolKeys: 0 };

  alloc(format: BufferFormat, count: number): ArrayBufferView {
    this.allocsThisFrame++;
    // ... existing logic ...
    const buffer = allocateBuffer(format, count);
    this.totalPooledBytes += buffer.byteLength;  // Track new allocations
    return buffer;
  }

  releaseAll(): void {
    // Snapshot stats before reset
    let releasedCount = 0;
    for (const buffers of this.inUse.values()) {
      releasedCount += buffers.length;
    }

    this.lastStats = {
      allocs: this.allocsThisFrame,
      releases: releasedCount,
      pooledBytes: this.computeTotalBytes(),
      poolKeys: this.pools.size,
    };

    this.allocsThisFrame = 0;
    // ... existing release logic ...
  }

  getFrameStats(): PoolFrameStats {
    return { ...this.lastStats };
  }

  private computeTotalBytes(): number {
    let total = 0;
    for (const buffers of this.pools.values()) {
      for (const buf of buffers) {
        total += buf.byteLength;
      }
    }
    for (const buffers of this.inUse.values()) {
      for (const buf of buffers) {
        total += buf.byteLength;
      }
    }
    return total;
  }
}

export interface PoolFrameStats {
  allocs: number;
  releases: number;
  pooledBytes: number;
  poolKeys: number;
}
```

### src/runtime/RuntimeState.ts

Add memory metrics to HealthMetrics:

```typescript
export interface HealthMetrics {
  // ... existing fields ...

  // Memory instrumentation (Sprint 2)
  poolAllocs: number;
  poolReleases: number;
  pooledBytes: number;
  poolKeyCount: number;
}
```

### src/runtime/HealthMonitor.ts

Record pool stats:

```typescript
export function recordPoolStats(state: RuntimeState, pool: BufferPool): void {
  const stats = pool.getFrameStats();
  state.health.poolAllocs = stats.allocs;
  state.health.poolReleases = stats.releases;
  state.health.pooledBytes = stats.pooledBytes;
  state.health.poolKeyCount = stats.poolKeys;
}
```

### src/services/AnimationLoop.ts

Call recordPoolStats:

```typescript
// After executeFrame, before releaseAll
recordPoolStats(currentState, pool);
// ... health snapshot emission ...
pool.releaseAll();
```

## Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| poolAllocs != poolReleases | Any imbalance | 10+ imbalance |
| pooledBytes | > 50MB | > 100MB |
| poolKeyCount | > 50 | > 100 |

These can be surfaced in DiagnosticsStore for debug UI display.

## Testing

1. **Unit test:** Verify counters increment correctly
2. **Integration test:** Run frame, check stats
3. **Leak test:** Intentionally leak, verify imbalance detected
