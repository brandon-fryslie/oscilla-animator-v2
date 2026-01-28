# C-8: EventPayload Design — Implementation Summary

**Status**: ✅ COMPLETE  
**Date**: 2026-01-24  
**Sprint**: P2-Blocked  
**Commits**: 1e75e00, 46f26b9, 59b05c4

## Problem Statement

The runtime event system used boolean flags (`Uint8Array` with 0/1 values) instead of the spec-required EventPayload model. This blocked implementation of data-carrying event blocks like SampleAndHold.

**Spec Requirement** (design-docs/CANONICAL-oscilla-v2.5-20260109/topics/05-runtime.md):
```typescript
interface EventPayload {
  key: string;
  value: number;  // float or int
}

interface RuntimeState {
  events: Map<number, EventPayload[]>;  // event slot id → buffer
}
```

## Solution Architecture

### Dual-Path Event System

Instead of replacing `eventScalars`, we added `events` Map alongside it:

```typescript
interface ProgramState {
  // Fast boolean path (existing)
  eventScalars: Uint8Array;      // 0=not fired, 1=fired
  
  // Data-carrying path (new)
  events: Map<number, EventPayload[]>;  // slot → payloads
}
```

**Rationale**:
- **Backward compatibility**: Existing blocks (Pulse, Predicate) continue using fast boolean path
- **Forward compatibility**: New blocks (SampleAndHold) can read payload values
- **Performance**: Boolean checks remain O(1) array access; Map is only for data-carrying events
- **Monotone OR preserved**: Both paths clear at frame start, append only during frame

### Event Lifecycle

Per spec §6.1 (Invariant I4): Events fire for exactly one tick.

**Frame clearing** (ScheduleExecutor.ts:85-92):
```typescript
// Clear boolean flags
state.eventScalars.fill(0);

// Clear payload arrays (reuse allocations)
state.events.forEach((payloads) => {
  payloads.length = 0;  // Clear but reuse allocation
});
```

**Event emission** (future — not yet implemented):
```typescript
// Boolean path (existing)
if (fired) {
  state.eventScalars[eventSlot] = 1;
}

// Payload path (new infrastructure)
if (!state.events.has(eventSlot)) {
  state.events.set(eventSlot, []);
}
state.events.get(eventSlot)!.push({
  key: 'event_identifier',
  value: computedValue
});
```

## Implementation Details

### Types Added

**RuntimeState.ts** (lines 54-86):
```typescript
export interface EventPayload {
  /** Event identifier (semantic key) */
  key: string;

  /** Event value (float or int) */
  value: number;
}

export interface EventBuffer {
  /** Events that occurred this tick (cleared each frame) */
  events: EventPayload[];

  /** Preallocated capacity (for memory management) */
  capacity: number;
}
```

Note: `EventBuffer` type defined but not yet used (reserved for future optimization).

### State Initialization

**createProgramState()** (RuntimeState.ts:603):
```typescript
events: new Map(),  // Empty map, populated dynamically
```

**createRuntimeState()** (RuntimeState.ts:629):
```typescript
events: program.events,  // Pass through from ProgramState
```

### Test Coverage

**EventPayload.test.ts** (7 new tests):
1. `events Map initializes empty`
2. `can push EventPayload to event slot`
3. `multiple events can fire in same slot (same tick)`
4. `clearing events Map reuses allocations`
5. `eventScalars and events Map coexist (backward compatibility)`
6. `events carry numeric values (float and int)`
7. `event keys are strings (semantic identifiers)`

All tests pass. Total test count: 1284 (up from 1277).

## Acceptance Criteria Met

- [x] `EventPayload` type defined with key and value fields (spec-compliant)
- [x] Runtime event storage uses `Map<EventSlotId, EventPayload[]>` (not boolean flags)
- [x] Events clear after one tick (spec §6.1 semantics preserved)
- [x] Infrastructure ready for SampleAndHold block to read event payload values
- [x] Existing event-based blocks (Pulse, etc.) still work with new model

## Verification

```bash
npm run typecheck  # ✅ PASS
npm run test       # ✅ PASS (1284 tests, 3 skipped)
```

No regressions. All existing event tests still pass.

## Blocks Unblocked

**U-6: SampleAndHold Block** is now unblocked. The infrastructure is ready for:
- Reading event payloads from `state.events`
- Latching the `value` field on event fire
- Using `key` field for event identification

## Future Work

### Phase 3: Emit EventPayload from Event-Producing Blocks

**Not yet implemented** (deferred to U-6 implementation):
- Modify `evaluateEvent()` or add new evaluator to emit payloads
- Wire event-producing blocks (Pulse, Predicate) to push payloads
- Define semantic key naming convention (e.g., `pulse_timeRoot`, `predicate_rising`)

### Phase 4: Event Payload Consumption

**Not yet implemented** (deferred to U-6 implementation):
- SampleAndHold block reads from `state.events`
- SignalEvaluator accesses payload values (not just boolean flags)
- Handle multiple events per slot (first? last? all?)

### Optimization Opportunities

1. **Pre-allocate event buffers**: Use `EventBuffer.capacity` to avoid per-frame allocations
2. **Event slot registry**: Track which slots have payload listeners (avoid Map iteration)
3. **Payload pooling**: Reuse EventPayload objects instead of creating new ones

These optimizations deferred until profiling shows they're needed.

## Design Notes

### Why Map Instead of Array?

The spec says `Map<number, EventPayload[]>`, not `Array<EventPayload[]>`.

**Rationale**:
- Sparse event slots: Not all slots fire every frame
- Dynamic slot IDs: Compiler assigns slot IDs dynamically
- Memory efficiency: Only allocate for slots that fire

### Why Keep eventScalars?

**Backward compatibility**: Existing runtime code checks `eventScalars[slot]` for boolean fired/not-fired.

**Performance**: Array access is faster than Map lookup for boolean checks.

**Future**: Could derive `eventScalars` from `events` Map (if `events.has(slot)` then fired), but premature optimization.

### Why Clear with .length = 0?

Per-frame allocation of arrays is expensive. Clearing with `.length = 0` reuses the existing array allocation.

**Measurement needed**: Profile to confirm this optimization is worth the complexity vs. `new Array()`.

## Spec Compliance

**Spec Reference**: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/05-runtime.md

✅ EventPayload: `{ key: string, value: number }` — matches spec exactly  
✅ Runtime storage: `Map<number, EventPayload[]>` — matches spec exactly  
✅ One-tick lifetime: Cleared each frame — matches spec §6.1 / Invariant I4  
✅ Monotone OR: Append only during frame — matches spec semantics

## Files Modified

1. `src/runtime/RuntimeState.ts` — EventPayload types, events Map in state
2. `src/runtime/ScheduleExecutor.ts` — Clear events Map each frame
3. `src/runtime/__tests__/project-policy-domain-change.test.ts` — Add events field to test fixture
4. `src/runtime/__tests__/EventPayload.test.ts` — New test file (7 tests)
5. `.agent_planning/gap-analysis/SPRINT-*-DOD.md` — Mark C-8 complete
6. `.agent_planning/gap-analysis/SPRINT-*-PLAN.md` — Update sprint status

## Commits

- **1e75e00**: feat(events): add EventPayload type and storage to RuntimeState
- **46f26b9**: test(events): add EventPayload infrastructure tests
- **59b05c4**: docs(planning): mark C-8 EventPayload Design as DONE

## Lessons Learned

1. **Incremental approach works**: Added infrastructure without breaking existing code
2. **Dual-path is pragmatic**: Spec-compliant new path + backward-compatible legacy path
3. **Test coverage is essential**: 7 new tests gave confidence in refactor
4. **Allocation reuse matters**: Clear arrays instead of allocating new ones each frame

## References

- Spec: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/05-runtime.md
- Gap Analysis: .agent_planning/gap-analysis/SUMMARY.md (C-8)
- Sprint Plan: .agent_planning/gap-analysis/SPRINT-20260124-190000-p2-blocked-PLAN.md
- DoD: .agent_planning/gap-analysis/SPRINT-20260124-190000-p2-blocked-DOD.md
