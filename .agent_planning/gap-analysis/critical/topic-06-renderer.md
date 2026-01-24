---
topic: 06
name: Renderer
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
audited: 2026-01-23T12:00:00Z
item_count: 4
priority_reasoning: RenderPassIR uses instances2d format instead of DrawPathInstancesOp. PathVerb constants disagree with spec. PathStyle missing fields. Rotation/scale2 not wired through v2.
---

# Topic 06: Renderer — Critical Gaps

## Items

### C-9: RenderPassIR is instances2d, not DrawPathInstancesOp
**Problem**: Current RenderPassIR uses `kind: 'instances2d'` with flat buffer fields. Spec requires `DrawPathInstancesOp` with separated `geometry: PathGeometryTemplate`, `instances: PathInstanceSet`, `style: PathStyle`. The code acknowledges this in comments ("ROADMAP PHASE 6") and has future-types.ts defining the target.
**Evidence**: src/runtime/ScheduleExecutor.ts:99 — `kind: 'instances2d'`; src/render/future-types.ts exists with DrawPathInstancesOp
**Obvious fix?**: No — migration from instances2d to DrawPathInstancesOp requires refactoring RenderAssembler output and both renderers' input. This is tracked in beads as ms5.

### C-11: PathVerb constants disagree with spec
**Problem**: Spec says VERB_QUAD=2 (2 control points) and VERB_CUBIC=3 (3 control points). Code has CUBIC=2 and QUAD=3 (swapped). Code is internally consistent, so this works, but disagrees with spec.
**Evidence**: src/shapes/types.ts:118
**Obvious fix?**: Yes — update spec to match code (since code is internally consistent and working), OR rename in code. Recommend updating spec since all path logic uses code values.

### C-12: PathStyle missing blend and layer fields
**Problem**: Spec requires PathStyle to have `blend: BlendMode` and `layer: LayerId`. Code PathStyle has fillColor/strokeColor, strokeWidth, lineJoin/lineCap/dashPattern/globalAlpha but no blend or layer.
**Evidence**: src/render/future-types.ts:50
**Obvious fix?**: Partially — add fields to type. But layer system (U-21) needs design first.

### C-13: Per-instance rotation/scale2 not wired through v2 assembly
**Problem**: rotation and scale2 are defined in InstanceTransforms type but passed as undefined in assembleDrawPathInstancesOp(). Comments say "not yet wired through IR."
**Evidence**: src/runtime/RenderAssembler.ts:817
**Obvious fix?**: Yes — wire rotation and scale2 through StepRender to the v2 assembly path.
