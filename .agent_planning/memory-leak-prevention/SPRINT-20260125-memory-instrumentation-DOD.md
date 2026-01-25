# Definition of Done: memory-instrumentation

**Sprint:** Add Memory Observability
**Generated:** 2026-01-25

## Completion Criteria

### P0: Pool Allocation Tracking

- [ ] BufferPool has `allocsThisFrame` counter incremented in `alloc()`
- [ ] BufferPool records frame stats before reset in `releaseAll()`
- [ ] `getFrameStats()` method returns allocs/releases for last frame

**Verification:** Call `pool.getFrameStats()` after frame, verify counts match expectations

### P1: Total Pooled Bytes

- [ ] BufferPool tracks total pooled byte size
- [ ] Metric exposed via `getStats()` or dedicated method
- [ ] Value matches sum of all pooled buffer `byteLength`

**Verification:** Allocate known buffers, verify byte count is correct

### P2: Health Snapshot Integration

- [ ] `HealthMetrics` interface includes memory fields
- [ ] `emitHealthSnapshot()` populates memory metrics
- [ ] DiagnosticsStore receives and stores memory stats

**Verification:** Check diagnostics store after health snapshot emission

## Testing Checklist

- [ ] `npm run build` passes
- [ ] `npm run test` passes
- [ ] Memory stats visible in console/debug output after running animation

## Definition of NOT Done

The sprint is NOT complete if:
- Pool stats are not tracked
- Memory metrics are not in health snapshot
- Instrumentation causes measurable performance regression

## Exit Criteria Met When

All checkboxes above are checked and memory metrics are observable.
