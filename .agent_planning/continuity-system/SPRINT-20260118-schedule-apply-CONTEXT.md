# Sprint: schedule-apply - Implementation Context

> **Sprint**: schedule-apply
> **Generated**: 2026-01-18

---

## Canonical Spec References

### Primary
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/11-continuity-system.md`
  - §2.3: Canonical default policies
  - §2.5: Additive gauge implementation
  - §4.1: First-order low-pass filter
  - §4.2: Canonical time constants
  - §5.1: Where continuity runs (schedule steps)
  - §6.4: Export integration

### Supporting
- `design-docs/CANONICAL-oscilla-v2.5-20260109/INVARIANTS.md`
  - I30: Continuity is deterministic
  - I31: Export matches playback

---

## Existing Code Locations

### Dependencies from Previous Sprints
```
src/compiler/ir/types.ts          # ContinuityPolicy, DomainInstance
src/runtime/ContinuityState.ts    # StableTargetId, MappingState, ContinuityState
src/runtime/ContinuityMapping.ts  # detectDomainChange(), buildMappingById()
src/runtime/RuntimeState.ts       # RuntimeState with continuity field
```

### Files to Modify
```
src/compiler/ir/types.ts              # Add Step types
src/compiler/passes-v2/pass7-schedule.ts  # Emit continuity steps
src/runtime/ScheduleExecutor.ts       # Execute continuity steps
```

### Files to Create
```
src/runtime/ContinuityDefaults.ts
src/runtime/ContinuityApply.ts
src/runtime/__tests__/ContinuityApply.test.ts
src/compiler/__tests__/continuity-integration.test.ts
```

---

## Key Design Decisions

### 1. Slew Filter Formula

**Decision**: Use first-order exponential filter.

**Formula** (spec §4.1):
```
α = 1 - exp(-dt / τ)
y = y + α * (target - y)
```

**Rationale**:
- Exponential convergence feels natural
- τ (tau) controls responsiveness
- Frame-rate independent (uses dt)

### 2. Schedule Phase Order

**Decision**: Continuity steps run between materialize and render.

**Order** (spec §5.1):
1. `evalSig` - signal computation
2. `materialize` - field computation
3. `continuityMapBuild` - rare, on domain change
4. `continuityApply` - per-frame
5. `render` - output
6. `stateWrite` - persist

**Rationale**:
- Materialize produces base values
- Continuity transforms base → effective
- Render sees final effective values

### 3. In-Place vs Copy

**Decision**: Support both in-place (baseSlot === outputSlot) and separate output.

**Rationale**:
- In-place saves memory and is simpler
- Separate output needed when base must be preserved
- Let IR decide based on usage

### 4. Crossfade as TODO

**Decision**: Crossfade returns passthrough for MVP.

**Rationale**:
- Crossfade is complex (needs two frame buffers)
- Other policies cover most use cases
- Document as known limitation

---

## Constraints

1. **Use t_model_ms only** - Never wall time (I30)
2. **No per-frame allocations** - Buffers from pool
3. **Deterministic** - Export matches playback (I31)
4. **Vectorizable** - Simple loops, no branching inside

---

## Canonical Time Constants (spec §4.2)

| Target | τ (ms) | Response |
|--------|--------|----------|
| opacity | 80 | Fast |
| radius | 120 | Medium |
| position | 120 | Medium |
| color | 150 | Slow |

---

## Out of Scope

- Crossfade full implementation (future)
- UI policy overrides (future)
- Per-element policy variation (future)
- SIMD optimization (future)
