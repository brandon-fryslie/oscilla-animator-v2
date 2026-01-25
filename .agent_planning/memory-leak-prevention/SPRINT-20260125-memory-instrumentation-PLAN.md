# Sprint: memory-instrumentation - Add Memory Observability

**Generated:** 2026-01-25
**Confidence:** HIGH: 3, MEDIUM: 0, LOW: 0
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Add memory instrumentation to HealthMonitor so leaks can be detected, diagnosed, and alerted on automatically.

## Scope

**Deliverables:**
- P0: Track pool allocation/release counts per frame (HIGH)
- P1: Track total pooled buffer bytes (HIGH)
- P2: Emit memory metrics in health snapshot (HIGH)

## Work Items

### P0: Track Pool Allocation/Release Counts

**Acceptance Criteria:**
- [ ] BufferPool tracks `allocsThisFrame` and `releasesThisFrame` counters
- [ ] Counters are reset at `releaseAll()` after being recorded
- [ ] Imbalance (allocsThisFrame != releasesThisFrame) indicates leak

**Technical Notes:**
- Location: `src/runtime/BufferPool.ts`
- Add two counters, increment in `alloc()`, record and reset in `releaseAll()`

**Implementation Sketch:**
```typescript
export class BufferPool {
  // ... existing ...

  // Instrumentation
  private allocsThisFrame = 0;
  private lastFrameAllocs = 0;
  private lastFrameReleases = 0;

  alloc(...): ArrayBufferView {
    this.allocsThisFrame++;
    // ... existing ...
  }

  releaseAll(): void {
    // Record for health monitor
    this.lastFrameAllocs = this.allocsThisFrame;
    this.lastFrameReleases = this.inUse.size; // Actually count released
    this.allocsThisFrame = 0;
    // ... existing ...
  }

  getFrameStats(): { allocs: number; releases: number } {
    return { allocs: this.lastFrameAllocs, releases: this.lastFrameReleases };
  }
}
```

### P1: Track Total Pooled Buffer Bytes

**Acceptance Criteria:**
- [ ] BufferPool tracks total bytes across all pools
- [ ] Metric exposed via `getStats()` or new method
- [ ] Useful for detecting pool bloat after domain changes

**Technical Notes:**
- Sum `buffer.byteLength` across all pools
- Expose in health metrics
- Alert threshold: > 100MB pooled is suspicious

### P2: Emit Memory Metrics in Health Snapshot

**Acceptance Criteria:**
- [ ] `emitHealthSnapshot()` includes memory metrics
- [ ] DiagnosticsStore receives and displays memory stats
- [ ] Visible in debug UI (if present)

**Technical Notes:**
- Location: `src/runtime/HealthMonitor.ts`
- Pass pool to health snapshot emitter
- Add to `RuntimeHealthMetrics` interface

## Dependencies

- None (builds on existing health infrastructure)

## Risks

- **Risk:** Performance overhead from instrumentation
  - **Mitigation:** Counters are O(1), negligible overhead
  - **Fallback:** Make instrumentation debug-only via flag

## Files to Modify

1. `src/runtime/BufferPool.ts` - Add counters
2. `src/runtime/HealthMonitor.ts` - Record memory metrics
3. `src/runtime/RuntimeState.ts` - Add to HealthMetrics interface
4. `src/stores/DiagnosticsStore.ts` - Receive/display metrics
