# User Response: External Input System Plan

**Date:** 2026-01-25
**Status:** APPROVED

## Sprint Summary

| Sprint | Name | Items | Confidence | Status |
|--------|------|-------|------------|--------|
| 1 | Channel Infrastructure | 8 | HIGH | Ready for implementation |
| 2 | Block Surface | 4 | HIGH | Ready (depends on Sprint 1) |
| 3 | Mouse Migration | 6 | HIGH | Ready (depends on Sprint 2) |
| 4 | Keyboard Support | 3 | MEDIUM | Research needed first |

## Sprint Details

### Sprint 1: Channel Infrastructure
**Goal:** Build the core channel system that all external inputs will use.

Deliverables:
- ExternalWriteBus class (set/pulse/add methods)
- ExternalChannelSnapshot class (getFloat/getVec2)
- ExternalChannelSystem class (owns staging + committed)
- Commit lifecycle (drain → fold → swap → clear)
- IR changes: SigExprExternal.which → string
- IRBuilder.sigExternal(channel: string, type)
- SignalEvaluator simplification
- executeFrame calls external.commit() at frame start

### Sprint 2: Block Surface
**Goal:** Users can read external channels in patches via blocks.

Deliverables:
- ExternalInput block (channel → float)
- ExternalGate block (channel + threshold → bool)
- ExternalVec2 block (channelBase → vec2)
- Register blocks in block registry

### Sprint 3: Mouse Migration
**Goal:** Mouse input uses the new channel system, legacy code removed.

Deliverables:
- App writes smoothed mouse to channels: mouse.x, mouse.y, mouse.over
- Mouse button channels: mouse.button.left.down/held/up
- Mouse wheel channels: mouse.wheel.dx/dy (accum)
- Remove hardcoded ExternalInputs interface
- Delete mouse switch in evaluator
- Move smoothing to write-side only

### Sprint 4: Keyboard Support (MEDIUM confidence)
**Goal:** Keyboard input available as channels.

Deliverables:
- Add keyboard event listeners in app layer
- key.<code>.held/down/up channels
- key.axis.wasd.x/y computed channels

**Why MEDIUM:** DOM keyboard handling has quirks (focus scope, key repeat, browser differences). Needs research before implementation.

## Future Work (Not Planned)

Per the spec roadmap (Phases 5-8):
- MIDI writer module
- OSC writer module
- Audio/FFT writer module
- Channel registry + diagnostics
- Higher-level UX (mapping UI, learn mode)

These will be planned separately after Sprints 1-4 complete.

## Files Created

```
.agent_planning/external-input-system/
├── EVALUATION-20260125.md
├── SPRINT-20260125-channel-infra-PLAN.md
├── SPRINT-20260125-channel-infra-DOD.md
├── SPRINT-20260125-channel-infra-CONTEXT.md
├── SPRINT-20260125-block-surface-PLAN.md
├── SPRINT-20260125-block-surface-DOD.md
├── SPRINT-20260125-block-surface-CONTEXT.md
├── SPRINT-20260125-mouse-migration-PLAN.md
├── SPRINT-20260125-mouse-migration-DOD.md
├── SPRINT-20260125-mouse-migration-CONTEXT.md
├── SPRINT-20260125-keyboard-PLAN.md
├── SPRINT-20260125-keyboard-DOD.md
├── SPRINT-20260125-keyboard-CONTEXT.md
└── USER-RESPONSE-20260125.md
```

## Approval Options

1. **Approve all** — All 4 sprints approved, start with Sprint 1
2. **Approve HIGH only** — Approve Sprints 1-3, defer Sprint 4 for research
3. **Revise specific sprint** — Request changes to a sprint plan
4. **Reject and restart** — Reject all and provide new direction
