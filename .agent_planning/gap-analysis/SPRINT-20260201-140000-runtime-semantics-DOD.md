# Definition of Done: Runtime Semantic Upgrades

Generated: 2026-02-01T15:00:00Z
Plan: SPRINT-20260201-140000-runtime-semantics-PLAN.md
Status: DEFERRED — criteria defined for when sprint is activated

## Pre-Gate: Research Complete

Before implementation begins, these must be true:
- [ ] Research questions from CONTEXT file answered
- [ ] Data structure decisions documented
- [ ] Performance budget established (hot loop overhead target)
- [ ] Plan upgraded from LOW to HIGH confidence

## Gate: Lane Identity Tracking Complete

- [ ] `(ValueExprId, InstanceId, lane)` → slot mapping exists
- [ ] Field evaluation in ScheduleExecutor uses lane metadata
- [ ] Hot-swap correctly remaps lanes when instance count changes
- [ ] No regression in frame execution benchmark (±10%)
- [ ] StateMigration handles lane remapping

## Gate: Branch-Scoped State Complete

- [ ] Runtime state keyed by branch identity
- [ ] Branch isolation: writes to branch A don't affect branch B
- [ ] Branch creation/destruction lifecycle managed
- [ ] Memory budget documented and enforced
- [ ] v1+ branch axis values (P5 #16) implemented as prerequisite

## Gate: Event Stamp Buffers Complete

- [ ] `valueStamp[EventSlotId]` tracks last write frame/tick
- [ ] Consumers can query event freshness
- [ ] Frame-start clearing replaced with stamp-based semantics
- [ ] No regression in event evaluation performance

## Verification Commands

```bash
# Full suite
npm run typecheck && npm run test

# Performance
npm run bench

# No regression in existing enforcement tests
npm run test -- --include "**/forbidden-patterns*"
```
