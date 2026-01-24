# Definition of Done: P2-Remaining Critical Items

Generated: 2026-01-24T13:00:00Z
Status: RESEARCH REQUIRED (all items blocked)

## Acceptance Criteria

### C-2: vec3/shape2d PayloadType
- [ ] PayloadType includes `'vec3'` with stride 3
- [ ] PayloadType renames `'shape'` to `'shape2d'` (or confirms shape2d not needed as separate from shape)
- [ ] All layout blocks output vec3 (stride 3) position buffers
- [ ] `executeFrame()` with layout blocks produces Float32Array(N*3) positions
- [ ] All 1259+ existing tests pass (with appropriate vec3 updates)

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
