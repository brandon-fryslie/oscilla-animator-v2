# Sprint: P2-Remaining — Blocked Critical Items

Generated: 2026-01-24T13:00:00Z
Confidence: HIGH: 0, MEDIUM: 2, LOW: 2
Status: RESEARCH REQUIRED

## Sprint Goal

Resolve remaining 4 critical gap-analysis items. All are blocked by dependencies that must be resolved first.

## Work Items

### C-2: vec3/shape2d PayloadType additions [MEDIUM]
**Blocked by**: 3D DoD Level 1 (vec3 data shape) — already in progress on branch
**What**: Add vec3 and shape2d to PayloadType union, with stride lookups
**Status**: Partially done — vec3 already added to PayloadType and PAYLOAD_STRIDE. Working dir has vec2→vec3 layout migration in progress.

#### Unknowns to Resolve
- shape→shape2d rename: is this a breaking change or purely cosmetic?
- Are there consumers of `'shape'` string literal that would break?

#### Exit Criteria
- 3D DoD Level 1 invariant verified (Float32Array stride-3 positions from Materializer)
- All layout blocks emit vec3 output
- Tests updated for vec3

---

### C-8: EventPayload design [LOW]
**Blocked by**: Architectural design decision
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

### C-9: RenderPassIR → DrawPathInstancesOp migration [MEDIUM]
**Blocked by**: ms5 epic in beads (oscilla-animator-v2-ms5)
**What**: Migrate from `kind: 'instances2d'` flat buffer format to spec-compliant `DrawPathInstancesOp` with separated geometry/instances/style
**Status**: v2 assembly path already exists (`assembleRenderFrame_v2`). The migration is about making v2 the primary path and removing v1.

#### Unknowns to Resolve
- When to cut over: v1 and v2 paths currently coexist
- Backend compatibility: do both Canvas2D and future WebGL backends support v2 format?
- Performance: is the separated structure faster or slower for Canvas2D?

#### Exit Criteria
- v2 assembly is the only path (v1 removed)
- All backends consume DrawPathInstancesOp directly
- No regressions in rendering output

---

### C-12: PathStyle blend/layer fields [LOW]
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
3D DoD Level 1 ──blocks──> C-2
C-8 (event design) ──blocks──> U-6 (SampleAndHold)
ms5 epic ──blocks──> C-9
U-21 (layer system) ──blocks──> C-12
```

## Risks

- C-2 is nearly complete (vec3 work in progress) — risk is test migration, not implementation
- C-8 is the most uncertain — requires fresh architectural design
- C-9 is large but well-understood — tracked separately in beads
- C-12 is low priority until layer system is designed
