# Definition of Done: P2 Critical Items

Generated: 2026-01-24T19:00:00Z
Updated: 2026-01-24T16:16:00Z
Status: C-9 DONE, C-8/C-12 still BLOCKED

## Acceptance Criteria

### C-8: EventPayload Design
- [ ] `EventPayload` type defined with value, timestamp, and source fields
- [ ] Runtime event storage uses `Map<EventSlotId, EventPayload[]>` (not boolean flags)
- [ ] Events clear after one tick (spec §6.1 semantics preserved)
- [ ] SampleAndHold block can read event payload values
- [ ] Existing event-based blocks (Pulse, etc.) still work with new model

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

- `npm run typecheck` passes
- `npm run test` passes (all tests)
- For C-9: visual comparison of rendered output before/after migration

## Blocker Resolution Status

1. C-8: STILL BLOCKED — EventPayload architectural design not yet started
2. C-9: DONE ✅ — v1→v2 migration complete, v1 code removed
3. C-12: STILL BLOCKED — Layer system (U-21) not yet designed
