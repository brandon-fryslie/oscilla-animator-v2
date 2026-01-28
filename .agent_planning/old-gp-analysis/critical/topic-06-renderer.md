---
topic: 06
name: Renderer
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
audited: 2026-01-24T19:00:00Z
item_count: 1
priority_reasoning: C-9 (RenderPassIR migration) DONE. C-12 (PathStyle blend/layer) blocked by U-21 layer system design — deferred. C-11 and C-13 resolved.
---

# Topic 06: Renderer — Critical Gaps

## Remaining Items

### C-9: RenderPassIR → DrawPathInstancesOp Migration ✅
**Status**: DONE (commits 523a1d1..270d947)
**Resolution**: Full v1→v2 migration complete. assembleRenderPass/renderV1/RenderPassIR removed. RenderFrameIR_Future renamed to RenderFrameIR. All backends consume DrawOp[] directly. 1284 tests pass.

### C-12: PathStyle missing blend and layer fields
**Status**: DEFERRED (blocked by U-21 layer system design, no functional impact)
**Problem**: Spec requires PathStyle to have `blend: BlendMode` and `layer: LayerId`. Code PathStyle has fillColor/strokeColor, strokeWidth, lineJoin/lineCap/dashPattern/globalAlpha but no blend or layer.
**Evidence**: src/render/future-types.ts:50
**Obvious fix?**: Partially — add fields to type. But layer system (U-21) needs design first.
**Blocked by**: Layer system design (U-21)

## Resolved Items

### C-11: PathVerb constants disagree with spec ✅
**Status**: RESOLVED (spec needs update, code is canonical)
**Resolution**: Code is internally consistent. Spec should be updated to match code values. No code change needed.

### C-13: Per-instance rotation/scale2 not wired through v2 assembly ✅
**Status**: DONE (commit c7206be)
**Resolution**: rotation and scale2 wired through IR and v2 assembly path.
