# Sprint: invariant-guards - Debug-Mode Lifetime Enforcement

**Generated:** 2026-01-25
**Confidence:** MEDIUM: 2, HIGH: 1, LOW: 0
**Status:** PARTIALLY READY

## Sprint Goal

Add debug-mode invariant enforcement to mechanically detect buffer lifetime violations before they cause leaks.

## Scope

**Deliverables:**
- P0: Frame-boundary buffer poisoning in debug mode (HIGH)
- P1: Subarray view usage tracking (MEDIUM)
- P2: Pool exhaustion assertions (MEDIUM)

## Work Items

### P0: Frame-Boundary Buffer Poisoning (HIGH)

**Acceptance Criteria:**
- [ ] In debug mode, `releaseAll()` fills released buffers with NaN/sentinel values
- [ ] If stale buffer is read, produces obvious bad output (NaN renders as black/error)
- [ ] Poisoning is zero-cost in production (guarded by `__DEV__` or similar flag)

**Technical Notes:**
- Location: `src/runtime/BufferPool.ts`
- After releasing a buffer to pool, fill with `NaN` (Float32) or `0xFF` (Uint8)
- Reading stale data produces obviously wrong results
- Use `import.meta.env.DEV` or define a `__DEBUG__` constant

**Implementation Sketch:**
```typescript
releaseAll(): void {
  // Record stats first (Sprint 2)
  // ...

  // Poison in debug mode
  if (import.meta.env.DEV) {
    for (const buffers of this.inUse.values()) {
      for (const buf of buffers) {
        if (buf instanceof Float32Array || buf instanceof Float64Array) {
          buf.fill(NaN);
        } else if (buf instanceof Uint8ClampedArray) {
          buf.fill(0xFF);  // Bright magenta if interpreted as color
        } else if (buf instanceof Uint32Array) {
          buf.fill(0xDEADBEEF);
        }
      }
    }
  }

  // ... existing release logic ...
}
```

### P1: Subarray View Usage Tracking (MEDIUM)

**Acceptance Criteria:**
- [ ] In debug mode, track which subarrays have been created from pooled buffers
- [ ] At `releaseAll()`, warn if any subarray was not "consumed" (copied or rendered)
- [ ] Helps identify code paths that retain views

**Technical Notes:**
- This requires wrapping the returned subarrays or tracking them in a WeakSet
- More complex; may require proxy objects in debug mode

#### Unknowns to Resolve
- How to efficiently track subarray views without proxy overhead?
- Can WeakSet handle TypedArray subarrays?
- What does "consumed" mean in this context?

#### Exit Criteria
- Design document explaining tracking mechanism
- Performance impact measured (< 5% overhead in debug mode)

### P2: Pool Exhaustion Assertions (MEDIUM)

**Acceptance Criteria:**
- [ ] Assert if pool size exceeds threshold (e.g., 1000 buffers)
- [ ] Assert if single allocation is unusually large (e.g., > 10MB)
- [ ] Assertions fire in debug mode only

**Technical Notes:**
- Add thresholds in BufferPool
- Throw or warn when exceeded
- Helps catch accidental infinite loops or domain explosion

## Dependencies

- Sprint 2 (memory-instrumentation) should be done first for metrics

## Risks

- **Risk:** Debug overhead affects development experience
  - **Mitigation:** Only poison/track when explicitly enabled via flag
  - **Fallback:** Remove poisoning if too slow; keep assertions only
