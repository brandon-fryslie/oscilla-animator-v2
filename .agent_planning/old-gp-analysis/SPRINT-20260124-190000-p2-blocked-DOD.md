# Definition of Done: P2 Critical Items

Generated: 2026-01-24T19:00:00Z
Updated: 2026-01-25T01:39:00Z
Status: SPRINT COMPLETE (C-8 ✅, C-9 ✅, C-12 deferred→U-21)

## Acceptance Criteria

### C-8: EventPayload Design — DONE ✅
- [x] `EventPayload` type defined with key and value fields (spec-compliant)
- [x] Runtime event storage uses `Map<EventSlotId, EventPayload[]>` (not boolean flags)
- [x] Events clear after one tick (spec §6.1 semantics preserved)
- [x] Infrastructure ready for SampleAndHold block to read event payload values
- [x] Existing event-based blocks (Pulse, etc.) still work with new model (backward compat)

**Implementation Notes:**
- EventPayload: `{ key: string, value: number }` per spec §5
- Both `eventScalars: Uint8Array` (fast boolean path) and `events: Map` (data-carrying path) coexist
- Monotone OR semantics: clear at frame start, append only during frame
- Allocations reused (clear arrays with .length = 0)
- All 1284 tests pass (including 7 new EventPayload tests)

**Commits:**
- 1e75e00: feat(events): add EventPayload type and storage to RuntimeState
- 46f26b9: test(events): add EventPayload infrastructure tests

### C-9: RenderPassIR Migration — DONE ✅
- [x] SVGRenderer handles DrawPrimitiveInstancesOp
- [x] `assembleRenderFrame()` is the only assembly path (renamed from _v2)
- [x] ScheduleExecutor.executeFrame() calls v2 assembly
- [x] Legacy `kind: 'instances2d'` format removed (RenderPassIR deleted)
- [x] All backends consume `DrawOp[]` directly (path + primitive)
- [x] Visual rendering output matches pre-migration state (1277 tests pass)
- [x] No performance regression
- [x] `RenderFrameIR_Future` renamed to `RenderFrameIR`

### C-12: PathStyle Blend/Layer
- [ ] `BlendMode` type defined (at minimum: 'normal')
- [ ] `LayerId` type defined
- [ ] PathStyle extended with `blend?: BlendMode` and `layer?: LayerId`
- [ ] Default blend mode ('normal') renders correctly
- [ ] Type checking passes with new fields

## Verification

- `npm run typecheck` passes ✅
- `npm run test` passes (all tests) ✅
- For C-9: visual comparison of rendered output before/after migration ✅

## Blocker Resolution Status

1. C-8: DONE ✅ — EventPayload infrastructure complete (2026-01-24T21:30:00Z)
2. C-9: DONE ✅ — v1→v2 migration complete, v1 code removed
3. C-12: DEFERRED — Layer system (U-21) not yet designed. No action possible. Deferred to future sprint.
