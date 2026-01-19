# User Response Required: Continuity System Planning

> **Generated**: 2026-01-18
> **Status**: AWAITING APPROVAL

---

## Summary

The existing PLAN-continuity-system-20260118.md has been evaluated against the recently updated canonical specification. The plan is **well-aligned** with minor adjustments made for terminology and spec compliance.

---

## Sprints Created

| Sprint | Confidence | Deliverables | Dependencies |
|--------|------------|--------------|--------------|
| **identity-foundation** | HIGH | DomainInstance type, InstanceDecl extension, DomainIdentity module | None |
| **state-mapping** | HIGH | ContinuityState, MappingState, mapping algorithms, RuntimeState integration | identity-foundation |
| **schedule-apply** | HIGH | Step types, schedule integration, gauge/slew implementation, tests | state-mapping |

---

## Key Alignments with Canonical Spec

### From 01-type-system.md
- ✅ Domain vs Instance distinction preserved
- ✅ InstanceRef correctly references domainType + instanceId
- ✅ Three-stage architecture (Primitive → Array → Layout) respected

### From 02-block-system.md
- ✅ Array block identified as cardinality transform (creates instances)
- ✅ Primitive blocks create single elements (cardinality: one)
- ✅ identityMode added to InstanceDecl

### From INVARIANTS.md
- ✅ I2: Gauge invariance (implemented via phase offset, value reconciliation)
- ✅ I11: Stable element identity (elementId in DomainInstance)
- ✅ I30: Continuity is deterministic (t_model_ms only)
- ✅ I31: Export matches playback (same schedule steps)

### From 11-continuity-system.md
- ✅ DomainInstance type matches §3.1
- ✅ MappingState types match §3.3
- ✅ byId algorithm matches §3.4
- ✅ Slew filter formula matches §4.1
- ✅ Schedule steps match §5.1
- ⚠️ GaugeSpec added (was missing from original plan)
- ⚠️ CurveSpec added to crossfade (was missing from original plan)

---

## Files to be Created/Modified

### New Files (6)
```
src/runtime/DomainIdentity.ts
src/runtime/ContinuityState.ts
src/runtime/ContinuityMapping.ts
src/runtime/ContinuityApply.ts
src/runtime/ContinuityDefaults.ts
```

### Modified Files (4+)
```
src/compiler/ir/types.ts           # Types, InstanceDecl, Steps
src/runtime/RuntimeState.ts        # Add continuity field
src/compiler/passes-v2/pass7-schedule.ts  # Emit continuity steps
src/runtime/ScheduleExecutor.ts    # Execute continuity steps
src/blocks/array.ts (or equiv)     # Set identityMode
```

### Test Files (3)
```
src/runtime/__tests__/DomainIdentity.test.ts
src/runtime/__tests__/ContinuityMapping.test.ts
src/runtime/__tests__/ContinuityApply.test.ts
```

---

## Sprint Documents Location

All sprint documents are in `.agent_planning/continuity-system/`:

```
.agent_planning/continuity-system/
├── EVALUATION-20260118.md
├── SPRINT-20260118-identity-foundation-PLAN.md
├── SPRINT-20260118-identity-foundation-DOD.md
├── SPRINT-20260118-identity-foundation-CONTEXT.md
├── SPRINT-20260118-state-mapping-PLAN.md
├── SPRINT-20260118-state-mapping-DOD.md
├── SPRINT-20260118-state-mapping-CONTEXT.md
├── SPRINT-20260118-schedule-apply-PLAN.md
├── SPRINT-20260118-schedule-apply-DOD.md
├── SPRINT-20260118-schedule-apply-CONTEXT.md
└── USER-RESPONSE-20260118.md
```

---

## Next Steps

Upon approval:
1. Start with **identity-foundation** sprint
2. Proceed sequentially through sprints
3. Use `/do:it continuity-system` to begin implementation

---

## Questions for User

None - all ambiguities resolved through spec alignment.
