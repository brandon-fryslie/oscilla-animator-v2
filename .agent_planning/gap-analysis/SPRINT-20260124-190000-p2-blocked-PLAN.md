# Sprint: P2-Blocked — Remaining Critical Items (2 Blocked, 1 DONE)

Generated: 2026-01-24T19:00:00Z
Updated: 2026-01-24T16:16:00Z
Confidence: HIGH: 0 (done), MEDIUM: 0, LOW: 2
Status: BLOCKED (C-9 complete, C-8/C-12 still blocked by design decisions)

## Sprint Goal

Resolve remaining 3 critical gap-analysis items. C-9 is now actionable (ms5.4/5/7 resolved). C-8 and C-12 remain blocked.

## Work Items

### C-9: RenderPassIR → DrawPathInstancesOp Migration [DONE] ✅
**Completed**: 2026-01-24T16:16:00Z
**Commits**: 523a1d1, df39229, 9dcf3cc, 9e4a4c4, d6b3510, e688b80, 270d947

**What was done**:
1. Added 3D projection support to v2 assembler (camera → screen-space)
2. Added DrawPrimitiveInstancesOp support to SVGRenderer
3. Wired v2 into ScheduleExecutor (assembleRenderFrame replaces assembleRenderPass)
4. Migrated all tests from v1 (frame.passes) to v2 (frame.ops) format
5. Removed all v1 code (assembleRenderPass, renderV1, RenderPassIR)
6. Renamed RenderFrameIR_Future → RenderFrameIR, future-types.ts → types.ts

**Acceptance Criteria:**
- [x] v2 assembly is the only path (v1 removed)
- [x] All backends (Canvas2D, SVG) consume DrawOp[] directly
- [x] No regressions in rendering output (all 1277 tests pass)
- [x] No regressions in performance

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
