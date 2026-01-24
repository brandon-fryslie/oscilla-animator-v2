# Definition of Done: P2 Critical Items

Generated: 2026-01-24T19:00:00Z
Updated: 2026-01-25T22:05:00Z
Status: PARTIALLY READY (C-9 unblocked, C-8/C-12 still blocked)

## Acceptance Criteria

### C-8: EventPayload Design
- [ ] `EventPayload` type defined with value, timestamp, and source fields
- [ ] Runtime event storage uses `Map<EventSlotId, EventPayload[]>` (not boolean flags)
- [ ] Events clear after one tick (spec §6.1 semantics preserved)
- [ ] SampleAndHold block can read event payload values
- [ ] Existing event-based blocks (Pulse, etc.) still work with new model

### C-9: RenderPassIR Migration — UNBLOCKED (ms5.8)
- [ ] SVGRenderer handles DrawPrimitiveInstancesOp (gap: currently skips)
- [ ] `assembleRenderFrame_v2()` is the only assembly path
- [ ] ScheduleExecutor.executeFrame() calls v2 assembly
- [ ] Legacy `kind: 'instances2d'` format removed from RenderPassIR
- [ ] All backends consume `DrawOp[]` directly (path + primitive)
- [ ] Visual rendering output matches pre-migration state
- [ ] No performance regression (frame time within 10% of pre-migration)
- [ ] `RenderFrameIR_Future` renamed to `RenderFrameIR`

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
2. C-9: UNBLOCKED — ms5 sub-tasks (ms5.4, ms5.5, ms5.7) all resolved. ms5.8 switchover ready.
3. C-12: STILL BLOCKED — Layer system (U-21) not yet designed
