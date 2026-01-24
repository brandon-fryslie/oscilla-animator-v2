# Definition of Done: P2-Blocked Critical Items

Generated: 2026-01-24T19:00:00Z
Status: BLOCKED (all items have unresolved dependencies)

## Acceptance Criteria

### C-8: EventPayload Design
- [ ] `EventPayload` type defined with value, timestamp, and source fields
- [ ] Runtime event storage uses `Map<EventSlotId, EventPayload[]>` (not boolean flags)
- [ ] Events clear after one tick (spec §6.1 semantics preserved)
- [ ] SampleAndHold block can read event payload values
- [ ] Existing event-based blocks (Pulse, etc.) still work with new model

### C-9: RenderPassIR Migration
- [ ] `assembleRenderFrame_v2()` is the only assembly path
- [ ] Legacy `kind: 'instances2d'` format removed from RenderPassIR
- [ ] All backends consume `DrawPathInstancesOp[]` directly
- [ ] Visual rendering output matches pre-migration state
- [ ] No performance regression (frame time within 10% of pre-migration)

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

## Blocker Resolution Required

These items cannot be implemented until:
1. C-8: EventPayload architectural design is completed
2. C-9: ms5 epic sub-tasks are resolved (see beads)
3. C-12: Layer system (U-21) is designed
