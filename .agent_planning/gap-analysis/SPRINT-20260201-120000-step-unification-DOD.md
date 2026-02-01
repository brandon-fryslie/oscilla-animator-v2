# SUPERSEDED — See SPRINT-20260201-140000-step-format-DOD.md
# Definition of Done: Step-Unification

Generated: 2026-02-01T12:00:00Z
Status: RESEARCH REQUIRED
Plan: SPRINT-20260201-120000-step-unification-PLAN.md

## Acceptance Criteria

### Unified Step Dispatch Design
- [ ] Design document produced and reviewed
- [ ] At least 2 approaches evaluated (pros/cons/performance)
- [ ] Chosen approach has user sign-off
- [ ] Migration path documented (incremental, not big-bang)
- [ ] Performance impact assessed (benchmark or analysis)
- [ ] All current step kinds mapped to new model

### Lane Identity Tracking Design
- [ ] Data structure designed for (ValueExprId, lane) -> slot mapping
- [ ] Hot-swap lane remapping strategy documented
- [ ] Performance impact assessed
- [ ] Integration with step unification model described

### Branch-Scoped State (Deferred)
- [ ] Requirements and dependencies documented
- [ ] Effort estimate provided
- [ ] Explicitly marked as blocked on v1+ branch axis

### Research Output
- [ ] All unknowns from plan have been resolved or explicitly deferred with rationale
- [ ] Follow-up implementation sprint can be planned at HIGH confidence
- [ ] Decision records captured for user choices (#6, #9)

## Exit Criteria (to raise to HIGH confidence for implementation sprint)
- [ ] User decisions #6 and #9 resolved
- [ ] Step dispatch approach chosen and prototyped
- [ ] Lane identity approach chosen
- [ ] No remaining unknowns that would block implementation
