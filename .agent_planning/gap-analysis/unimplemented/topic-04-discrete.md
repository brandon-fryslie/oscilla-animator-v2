---
topic: 04
name: Discrete Temporality Runtime
spec_file: design-docs/canonical-types/01-CanonicalTypes.md
category: unimplemented
audited: 2026-01-29T00:03:26Z
item_count: 1
blocks_critical: []
---

# Topic 04: Discrete Temporality Runtime — Unimplemented

## Items

### U-2: Implement tickIndex/stamps for discrete temporality

**Spec requirement**: Section 5 specifies runtime semantics for discrete temporality:

```
5.1 Storage is keyed by (ValueExprId, lane)
- For discrete temporality, allocate stamp buffer:
  valueStamp[ValueExprId, lane] = lastTickOrFrameWritten
- Value is considered "present" only if stamp == currentTick

5.2 Evaluation has two clocks
- frameIndex (continuous)
- tickIndex (discrete / event step)
- Discrete expressions evaluated only on ticks, continuous on every frame
```

**Scope**: new runtime infrastructure

**Evidence of absence**: 
- No `tickIndex` in RuntimeState — `grep -r "tickIndex" src/` returns nothing
- No stamp buffer — current event storage is `eventScalars: Uint8Array` (binary fired/not-fired)
- Events cleared every frame, no multi-tick holding — `src/runtime/ScheduleExecutor.ts:158`

**Current workaround**: The spec allows "tick == frame" as v0. This is effectively what exists today.

**Contract requirement**: Even if tick==frame today, define Clock/Tick concepts early:

```typescript
// In RuntimeState (or similar)
interface ClockState {
  frameIndex: number;  // Continuous clock
  tickIndex: number;   // Discrete clock (may equal frameIndex in v0)
}
```

This prevents "discrete-ness" from being re-threaded through random places later. The storage + stamp semantics must be expressed in types (or at minimum in a single runtime API boundary).

**When needed**: When implementing:
- Event sequences/patterns
- Multi-tick hold semantics
- Rate-limited event propagation
