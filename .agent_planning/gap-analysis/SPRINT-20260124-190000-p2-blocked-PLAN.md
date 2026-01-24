# Sprint: P2-Blocked — Remaining Critical Items (2 Blocked, 1 Actionable)

Generated: 2026-01-24T19:00:00Z
Updated: 2026-01-25T22:05:00Z
Confidence: HIGH: 1, MEDIUM: 0, LOW: 2
Status: PARTIALLY READY (C-9 unblocked, C-8/C-12 still blocked)

## Sprint Goal

Resolve remaining 3 critical gap-analysis items. C-9 is now actionable (ms5.4/5/7 resolved). C-8 and C-12 remain blocked.

## Work Items

### C-9: RenderPassIR → DrawPathInstancesOp Migration [HIGH] — UNBLOCKED
**Previously blocked by**: ms5 epic sub-tasks (ms5.4, ms5.5, ms5.7, ms5.15)
**All blockers resolved**: ms5.4 (commit 99913ac), ms5.5 (commit dac2f95), ms5.7 (commits 2a84fd1+), ms5.15/C-13 (commit c7206be)
**What**: Switch ScheduleExecutor from v1 assembleRenderPass to v2 assembleRenderFrame_v2, update consumers, remove v1 path.
**Tracked as**: oscilla-animator-v2-ms5.8 in beads

**Concrete Steps** (see EVALUATION-20260125-220500.md):
1. Add DrawPrimitiveInstancesOp support to SVGRenderer
2. Wire v2 into ScheduleExecutor (switch executeFrame)
3. Update all consumers of RenderFrameIR
4. Remove v1 assembly path
5. Rename RenderFrameIR_Future → RenderFrameIR

**Acceptance Criteria:**
- [ ] v2 assembly is the only path (v1 removed)
- [ ] All backends (Canvas2D, SVG) consume DrawOp[] directly
- [ ] No regressions in rendering output (all tests pass)
- [ ] No regressions in performance

---

### C-8: EventPayload Design [LOW] — BLOCKED
**Blocked by**: Architectural design decision (no existing event payload model)
**What**: Replace boolean event flags (Uint8Array) with `Map<number, EventPayload[]>` for data-carrying events
**Blocks**: U-6 (SampleAndHold block)

#### Unknowns to Resolve
- EventPayload type design: what fields? (value, timestamp, source, type?)
- Integration with ScheduleExecutor: how do event-producing blocks emit payloads?
- Memory allocation: pre-allocate vs dynamic for event arrays?
- Frame semantics: events fire for exactly one tick (spec §6.1) — does this still hold for payload events?

#### Exit Criteria
- EventPayload type defined in canonical-types
- Runtime can emit and consume EventPayload arrays
- SampleAndHold block can be implemented using the new event model

---

### C-12: PathStyle Blend/Layer Fields [LOW] — BLOCKED
**Blocked by**: U-21 (Layer system design)
**What**: Add `blend: BlendMode` and `layer: LayerId` fields to PathStyle
**Blocks**: Nothing directly (cosmetic until layer system exists)

#### Unknowns to Resolve
- BlendMode enum: what modes to support? (normal, multiply, screen, overlay, ...)
- LayerId type: string or number? How are layers ordered?
- Layer system architecture: per-frame layer list or static declaration?

#### Exit Criteria
- BlendMode type defined
- LayerId type defined
- PathStyle extended with both fields
- At least 'normal' blend mode renders correctly

## Dependencies

```
C-9 ──UNBLOCKED──> ms5.8 (v1→v2 switchover)
Architectural design ──blocks──> C-8
U-21 layer system design ──blocks──> C-12
```

## Risks

- C-9/ms5.8: All-or-nothing switchover has regression risk; consider render parity tests before switching
- C-8 is the most uncertain — requires fresh architectural design before implementation
- C-12 is low priority until layer system is designed — no functional impact until then

## Recommendation

C-9 is now actionable. Next step: implement ms5.8 (v1→v2 render pipeline switchover). Start with SVG primitive support (smallest discrete step), then wire v2 into ScheduleExecutor. C-8 and C-12 remain blocked pending their respective design work.
