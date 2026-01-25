# Definition of Done: invariant-guards

**Sprint:** Debug-Mode Lifetime Enforcement
**Generated:** 2026-01-25

## Completion Criteria

### P0: Buffer Poisoning

- [ ] `releaseAll()` fills released buffers with sentinel values in debug mode
- [ ] Poisoning is conditional on `import.meta.env.DEV` or similar flag
- [ ] Production build has zero poisoning overhead
- [ ] Reading stale buffer produces obviously wrong output

**Verification:** Intentionally read stale buffer in debug mode; verify NaN/garbage values

### P1: View Tracking (MEDIUM - may defer)

- [ ] Design document explains tracking mechanism
- [ ] Performance overhead < 5% in debug mode
- [ ] Warnings emitted for suspicious view retention

**Verification:** Intentionally retain view; verify warning logged

### P2: Pool Exhaustion Assertions

- [ ] Assertion fires if pool exceeds 1000 buffers (configurable)
- [ ] Assertion fires if single allocation > 10MB (configurable)
- [ ] Assertions are debug-mode only

**Verification:** Trigger each condition; verify assertion fires

## Testing Checklist

- [ ] `npm run build` passes (production build works)
- [ ] `npm run test` passes
- [ ] Manual test: Run in dev mode, verify poisoning works
- [ ] Manual test: Trigger exhaustion, verify assertion

## Exit Criteria Met When

P0 and P2 are complete. P1 may be deferred if design is complex.
