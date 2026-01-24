# Sprint: P2-Blocked — Remaining Critical Items (All Blocked)

Generated: 2026-01-24T19:00:00Z
Confidence: HIGH: 0, MEDIUM: 1, LOW: 2
Status: BLOCKED (all items have unresolved dependencies)

## Sprint Goal

Resolve remaining 3 critical gap-analysis items. All are blocked by external dependencies that must be designed or implemented first.

## Work Items

### C-8: EventPayload Design [LOW]
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

### C-9: RenderPassIR → DrawPathInstancesOp Migration [MEDIUM]
**Blocked by**: ms5 epic in beads (oscilla-animator-v2-ms5)
**What**: Migrate from `kind: 'instances2d'` flat buffer format to spec-compliant `DrawPathInstancesOp` with separated geometry/instances/style
**Status**: v2 assembly path exists (`assembleRenderFrame_v2`). Migration is about making v2 the primary path and removing v1.

#### Unknowns to Resolve
- When to cut over: v1 and v2 paths currently coexist
- Backend compatibility: do both Canvas2D and future WebGL backends support v2 format?
- Performance: is the separated structure faster or slower for Canvas2D?

#### Exit Criteria
- v2 assembly is the only path (v1 removed)
- All backends consume DrawPathInstancesOp directly
- No regressions in rendering output

---

### C-12: PathStyle Blend/Layer Fields [LOW]
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
Architectural design ──blocks──> C-8
ms5 epic completion ──blocks──> C-9
U-21 layer system design ──blocks──> C-12
```

## Risks

- C-8 is the most uncertain — requires fresh architectural design before implementation
- C-9 is large but well-understood — tracked separately in beads as a multi-task epic
- C-12 is low priority until layer system is designed — no functional impact until then

## Recommendation

None of these items are actionable until their blockers resolve. The next actionable work is in the ms5 render pipeline epic (C-9's dependency), which has sub-tasks ready in beads.
