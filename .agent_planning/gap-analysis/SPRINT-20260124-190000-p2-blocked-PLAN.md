# Sprint: P2-Blocked — Remaining Critical Items (1 Blocked, 2 DONE)

Generated: 2026-01-24T19:00:00Z
Updated: 2026-01-24T21:30:00Z
Confidence: HIGH: 2 (done), MEDIUM: 0, LOW: 1 (blocked)
Status: MOSTLY COMPLETE (C-8 and C-9 complete, C-12 still blocked)

## Sprint Goal

Resolve remaining 3 critical gap-analysis items. C-9 and C-8 are now complete. C-12 remains blocked pending layer system design.

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

### C-8: EventPayload Design [DONE] ✅
**Completed**: 2026-01-24T21:30:00Z
**Commits**: 1e75e00, 46f26b9

**What was done**:
1. Added EventPayload type: `{ key: string, value: number }` per spec §5
2. Added `events: Map<number, EventPayload[]>` to ProgramState and RuntimeState
3. Initialize events Map in createProgramState()
4. Clear events Map each frame in ScheduleExecutor (alongside eventScalars)
5. Wrote comprehensive EventPayload infrastructure tests (7 tests)
6. Maintained backward compatibility with eventScalars Uint8Array

**Architecture Decision**:
- **Dual-path approach**: eventScalars (fast boolean) + events Map (data-carrying)
- **Monotone OR preserved**: clear at frame start, append only during frame
- **Allocation reuse**: clear arrays with .length = 0 (no per-frame allocation)
- **Spec compliance**: Events clear after one tick (spec §6.1 / Invariant I4)

**Acceptance Criteria:**
- [x] EventPayload type defined with key and value fields
- [x] Runtime event storage uses Map<EventSlotId, EventPayload[]>
- [x] Events clear after one tick (spec §6.1 semantics preserved)
- [x] Infrastructure ready for SampleAndHold block
- [x] Existing event-based blocks (Pulse, etc.) still work (1284 tests pass)

**Blocks Resolved**: U-6 (SampleAndHold block) is now unblocked

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
C-9 ──DONE──> ms5.8 (v1→v2 switchover) ✅
C-8 ──DONE──> U-6 (SampleAndHold block) ✅
U-21 layer system design ──blocks──> C-12
```

## Risks

- ~~C-9/ms5.8: All-or-nothing switchover has regression risk~~ ✅ MITIGATED: 1277 tests pass, no regressions
- ~~C-8 is the most uncertain~~ ✅ RESOLVED: Dual-path approach preserves backward compat
- C-12 is low priority until layer system is designed — no functional impact until then

## Recommendation

**Sprint Status**: 2/3 complete (66% done). C-12 remains blocked pending U-21 design work.

**Next Steps**:
1. C-12 can wait until layer system design (U-21) is prioritized
2. U-6 (SampleAndHold block) is now unblocked and can be implemented
3. Consider closing this sprint and opening a new one for U-6 implementation

**Achievement**: Critical event system infrastructure (C-8) and render pipeline migration (C-9) are both complete with full test coverage and no regressions.
