# Sprint: continuity-logging - Domain Change Logging

Generated: 2026-01-18
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Add logging for domain changes so users can see continuity system activity in the LogPanel.

## Scope

**Deliverables:**
1. Log domain change events with mapping statistics
2. Log continuity policy application
3. Throttle logs to avoid flooding (max 5/sec per target)

## Work Items

### P0: Implement continuity step handlers in ScheduleExecutor

**Acceptance Criteria:**
- [ ] `continuityMapBuild` step calls real mapping logic (not placeholder)
- [ ] `continuityApply` step calls real gauge/slew logic (not placeholder)
- [ ] Domain changes are detected per-frame

**Technical Notes:**
- Currently ScheduleExecutor has placeholder handlers
- Need to wire in ContinuityMapping.detectDomainChange
- Need to wire in ContinuityApply.applyContinuity

### P1: Add domain change logging

**Acceptance Criteria:**
- [ ] When domain changes, log: "Domain change: {instanceId} {oldCount}→{newCount}"
- [ ] Log mapping stats: "Mapped: {n}, New: {m}, Removed: {r}"
- [ ] Logs appear in LogPanel

**Technical Notes:**
- Use DiagnosticsStore or emit events
- Include instanceId for filtering
- Color-code: info for changes, warn for large unmapped counts

### P2: Throttle continuity logs

**Acceptance Criteria:**
- [ ] No more than 5 domain change logs per second per instance
- [ ] Coalesce rapid changes into summary
- [ ] Slew progress NOT logged per-frame (too noisy)

**Technical Notes:**
- Track last log time per instanceId
- Batch rapid changes: "Domain changed 3x in 200ms"

## Dependencies

- ScheduleExecutor (exists with placeholders)
- ContinuityMapping, ContinuityApply (exists)
- DiagnosticsStore (exists)

## Risks

| Risk | Mitigation |
|------|------------|
| Log flooding | Throttle to 5/sec |
| Performance overhead | Only log on actual changes |
