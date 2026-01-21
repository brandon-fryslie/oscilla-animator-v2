# Debug Probe Feature - Sprint Planning

This directory contains comprehensive sprint planning for the Debug Probe feature implementation.

## Overview

The Debug Probe feature enables runtime value inspection through edge hover in the ReactFlow graph editor. Implementation is broken into 3 incremental sprints:

1. **Sprint 1: Minimal Debug Panel** (12 hours, HIGH confidence)
2. **Sprint 2: Full Data Layer** (25 hours, MEDIUM confidence)
3. **Sprint 3: UX Polish** (19 hours, HIGH confidence)

**Total Estimated Effort**: ~56 hours (7 working days)

---

## File Organization

Each sprint has 3 files:
- **PLAN.md**: Implementation steps, effort estimates, files changed
- **DOD.md**: Definition of Done (acceptance criteria, verification protocol)
- **CONTEXT.md**: Architectural decisions, rationale, lessons learned

---

## Sprint 1: Minimal Debug Panel + Basic Runtime Instrumentation

**Goal**: Establish the foundation for observation system (Compiler → Runtime → Service → UI)

**Files**:
- `SPRINT-20260120-170000-minimal-debug-panel-PLAN.md`
- `SPRINT-20260120-170000-minimal-debug-panel-DOD.md`
- `SPRINT-20260120-170000-minimal-debug-panel-CONTEXT.md`

**Key Deliverables**:
- Simple bottom-right panel showing edge values (text-only)
- Basic DebugService (Map-based storage for current values)
- DebugTap interface in runtime (recordSlotValue)
- Edge-to-slot resolution in compiler
- ReactFlow edge hover handlers

**Status**: PLANNED
**Confidence**: HIGH
**Effort**: 12 hours (1.5 days)

**Notes**:
- This sprint establishes **foundation patterns** (DebugTap, DebugService, instrumentation points)
- Proves DebugTap pattern works (<1% performance overhead)
- SimpleDebugPanel replaced in Sprint 3, but useDebugProbe hook pattern reused
- Edge-to-slot map enriched with DebugGraph topology in Sprint 2

---

## Sprint 2: Full Data Layer (DebugGraph + Ring Buffers)

**Goal**: Extend Sprint 1 foundation with complete observation infrastructure matching the spec

**Files**:
- `SPRINT-20260120-170100-full-data-layer-PLAN.md`
- `SPRINT-20260120-170100-full-data-layer-DOD.md`
- `SPRINT-20260120-170100-full-data-layer-CONTEXT.md`

**Key Deliverables**:
- DebugGraph builder (buses, publishers, listeners, pipelines, byPort)
- ValueSummary tagged union (all 7 payload types)
- DebugService extensions (ring buffers, enriched query API)
- DebugSnapshot emission at 15Hz
- probePort, probeBus, getBusSeries methods

**Status**: PLANNED
**Confidence**: MEDIUM
**Effort**: 25 hours (3-4 days)

**Notes**:
- This sprint **extends Sprint 1** (not replaces)
- DebugGraph is compile-time only (immutable)
- Ring buffers store 10 seconds of history per bus (150 samples @ 15Hz)
- Enriches Sprint 1's simple Map with spec-compliant structures

---

## Sprint 3: UX Polish (DebugProbePopover + Type-Specific Renderers)

**Goal**: Replace SimpleDebugPanel with polished, spec-compliant UI

**Files**:
- `SPRINT-20260120-170200-ux-polish-PLAN.md`
- `SPRINT-20260120-170200-ux-polish-DOD.md`
- `SPRINT-20260120-170200-ux-polish-CONTEXT.md`

**Key Deliverables**:
- DebugProbePopover component (four-section layout)
- Identity badge (port name, type badge, role badge)
- Type-specific renderers (7 components):
  - NumberRenderer (horizontal meter)
  - PhaseRenderer (circular ring)
  - ColorRenderer (swatch + hex)
  - Vec2Renderer (XY plot)
  - BoolRenderer (checkmark)
  - TriggerRenderer (pulse lamp)
  - UnitRenderer (placeholder)
- TraceSummary (pipeline chip display)
- Popover positioning (Radix UI)
- Remove SimpleDebugPanel

**Status**: PLANNED
**Confidence**: HIGH
**Effort**: 19 hours (2.5 days)

**Notes**:
- This sprint completes **MVP** for Debug Probe feature
- Renderers are "functional, not fancy" (polish later)
- FixesSection is placeholder (diagnostics integration post-MVP)
- Replaces SimpleDebugPanel but reuses data-fetching patterns from Sprint 1

---

## Supporting Documents

### EVALUATION-20260120-163500.md
Initial feature evaluation answering:
- What exists in the codebase?
- What's missing?
- What needs changes?
- Ambiguities and unknowns
- Verdict: CONTINUE with conditions

**Key Findings**:
- Edge hover infrastructure exists (ReactFlow API)
- ValueStore exists but no query API
- HealthMonitor pattern proven (throttled sampling)
- Observation system specified but not implemented
- Slot resolution is two-level (Edge → Bus → Slot)

---

## Spec References

All implementation must conform to:
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/08-observation-system.md` (data layer)
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/09-debug-ui-spec.md` (UI spec)

---

## Implementation Order

**Recommended sequence**:
1. Read EVALUATION-20260120-163500.md (understand current state)
2. Execute Sprint 1 (establish foundation patterns)
3. Review Sprint 1 retrospective (update CONTEXT.md with learnings)
4. Execute Sprint 2 (extend with complete data layer)
5. Review Sprint 2 retrospective (log DebugGraph structure insights)
6. Execute Sprint 3 (polish UI)
7. Final demo and handoff

**Do NOT skip Sprint 1**. It establishes foundation patterns and proves DebugTap works. Sprint 2 builds upon this foundation.

---

## Success Metrics

### Sprint 1 Complete
- [ ] Edge hover displays current value (text-only)
- [ ] Frame time unchanged (<1% overhead)
- [ ] All edges resolve to slot values

### Sprint 2 Complete
- [ ] DebugGraph builds with all fields
- [ ] Ring buffers store 10 seconds history
- [ ] ValueSummary supports all 7 types
- [ ] probePort returns complete PortProbeResult

### Sprint 3 Complete
- [ ] Popover appears on edge hover (near edge, not corner)
- [ ] All 7 type-specific renderers work
- [ ] TraceSummary displays pipeline stages
- [ ] SimpleDebugPanel removed

### Feature Complete (All 3 Sprints)
- [ ] Hover any edge → see current value with type-specific renderer
- [ ] Trace summary shows transformation pipeline
- [ ] No performance regression (60fps maintained)
- [ ] Memory bounded (~150KB for ring buffers)
- [ ] Spec-compliant observation infrastructure

---

## Post-MVP Enhancements (Not in These Sprints)

**Phase 2 Features** (from spec, deferred):
- Global Probe mode toggle (spec 09-debug-ui-spec.md Part 1)
- Expanded trace view panel (spec Part 3)
- Diagnostics integration (spec Part 4)
- Keyboard shortcuts (spec Part 6)

**Polish Sprint** (future):
- Renderer animations (phase ring rotation, pulse lamp glow)
- Timeseries sparklines in renderers
- Dark mode support
- Pin/unpin popover
- Drag to reposition

**Advanced Features** (power users):
- Multi-popover (inspect multiple edges simultaneously)
- Popover history (recently inspected ports)
- Export popover data (screenshot, JSON)

---

## Risk Summary

### Sprint 1 Risks
- **Slot resolution unclear**: MITIGATED (investigation step included)
- **Performance impact**: LOW (HealthMonitor pattern proven)
- **Edge IDs unstable**: ACCEPTABLE (recompile updates map)

### Sprint 2 Risks
- **DebugGraph builder complexity**: MEDIUM (break into phases)
- **ValueSummary type mismatches**: LOW (SignalType available)
- **Ring buffer memory**: VERY LOW (bounded at 150KB)

### Sprint 3 Risks
- **Popover positioning**: LOW (use Radix UI)
- **Renderer scope creep**: MEDIUM (define "functional, not fancy")
- **TraceSummary overflow**: LOW (horizontal scroll fallback)

---

## Contact / Questions

**For implementation questions**, consult:
1. CONTEXT.md for architectural decisions
2. EVALUATION.md for unknowns resolved
3. Spec documents (08-observation-system.md, 09-debug-ui-spec.md)

**For scope questions**, consult:
1. DOD.md for acceptance criteria
2. PLAN.md for what's included/excluded

---

**Last Updated**: 2026-01-20
**Status**: All sprints PLANNED, ready for implementation
