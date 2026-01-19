# Sprint: schedule-apply - Definition of Done

> **Sprint**: schedule-apply
> **Generated**: 2026-01-18

---

## Acceptance Criteria Checklist

### Step Types (src/compiler/ir/types.ts)

- [ ] `StepContinuityMapBuild` interface defined
  - `kind: 'continuityMapBuild'`
  - `instanceId: string`
  - `outputMapping: string`

- [ ] `StepContinuityApply` interface defined
  - `kind: 'continuityApply'`
  - `targetKey: string` (StableTargetId)
  - `instanceId: string`
  - `policy: ContinuityPolicy`
  - `baseSlot: ValueSlot`
  - `outputSlot: ValueSlot`
  - `semantic: string`

- [ ] `Step` union includes both new types

### Continuity Defaults (src/runtime/ContinuityDefaults.ts)

- [ ] File exists and is properly typed
- [ ] `CANONICAL_CONTINUITY_POLICIES` record exported
- [ ] `getPolicyForSemantic()` function exported
- [ ] Policies match spec §2.3:
  - position: project + slew(120ms)
  - radius: slew(120ms)
  - opacity: slew(80ms)
  - color: slew(150ms)
  - custom: crossfade(150ms)

### Continuity Apply (src/runtime/ContinuityApply.ts)

- [ ] File exists and is properly typed
- [ ] `applyAdditiveGauge()` exported
- [ ] `applySlewFilter()` exported
- [ ] `initializeGaugeOnDomainChange()` exported
- [ ] `initializeSlewBuffer()` exported
- [ ] `applyContinuity()` exported
- [ ] `finalizeContinuityFrame()` exported

### Schedule Pass (src/compiler/passes-v2/pass7-schedule.ts)

- [ ] Continuity steps emitted after materialize steps
- [ ] Order: evalSig → materialize → continuityMapBuild → continuityApply → render

### Schedule Executor

- [ ] `continuityMapBuild` step handled
- [ ] `continuityApply` step handled

### Algorithm Correctness

- [ ] Slew: After τ ms, value is ~63% of way to target (α = 1 - e^(-1) ≈ 0.632)
- [ ] Gauge: Mapped elements preserve effective value
- [ ] Gauge: New elements start at Δ = 0

### Tests

- [ ] Unit tests at `src/runtime/__tests__/ContinuityApply.test.ts`
- [ ] Integration tests at `src/compiler/__tests__/continuity-integration.test.ts`
- [ ] All tests pass: `npm test`
- [ ] Type check passes: `npm run typecheck`

---

## Verification Commands

```bash
# Type check
npm run typecheck

# Run continuity tests
npm test -- --testPathPattern=Continuity

# Verify slew convergence
npm test -- --testPathPattern=applySlewFilter

# Verify integration
npm test -- --testPathPattern=continuity-integration
```

---

## Exit Criteria

Sprint is complete when:
1. All checklist items above are checked
2. `npm run typecheck` passes with zero errors
3. `npm test` passes with zero failures
4. Export parity verified (same output live vs export)
