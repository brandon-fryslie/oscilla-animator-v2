---
command: /canonicalize-architecture ./design-docs design-docs/_new/renderer
files: design-docs/_new/renderer/8-before-render.md design-docs/_new/renderer/9-renderer.md design-docs/_new/renderer/10-multiple-backends.md design-docs/_new/renderer/11-svg.md
indexed: true
---

# Update Questions: Renderer Architecture Integration

**Date**: 2026-01-22
**Items requiring resolution**: 5

---

## Q1: GeometryRegistry String Keys vs Numeric Topology IDs

**Tag**: CONTRADICTION-T3
**Severity**: NORMAL (T3 - can change freely)

**Existing Canonical (Topic 06, "Asset Management" section)**:
```typescript
interface GeometryRegistry {
  builtIn: Map<string, GeometryAsset>;
  loaded: Map<string, GeometryAsset>;
  generated: Map<string, GeometryAsset>;
}
```

**New Sources (all 4 files)**:
Numeric topology IDs with O(1) array indexing. No string maps.
```
topologies[topologyId]  // array indexing, not hash map
```

**Assessment**: The "Asset Management" section is residual from an earlier spec that predates the PathGeometryTemplate model (D34). The canonical PathGeometryTemplate already uses `topologyId: number`. This section should be replaced.

**Proposed Resolution**: Remove the "Asset Management" section and replace with a "Topology Registry" section that uses numeric IDs and array lookup, consistent with PathGeometryTemplate.

**Status**: ACCEPTED

---

## Q2: RenderAssembler — Where Does It Live?

**Tag**: COMPLEMENT
**Severity**: MEDIUM (architectural placement decision)

**New Sources**: Source doc 8-before-render.md defines RenderAssembler as a runtime component that produces RenderFrameIR. It lives in runtime, NOT renderer.

**Current Canonical**: Topic 06 describes RenderFrameIR but doesn't specify who produces it. Topic 05 describes schedule execution but doesn't mention render assembly as a distinct stage.

**Proposed Resolution**: Add RenderAssembler to Topic 05 (Runtime) as the final stage of frame execution:
1. Schedule executes → fills scalar banks, evaluates fields
2. RenderAssembler walks render sinks → materializes fields, resolves shapes
3. RenderAssembler outputs RenderFrameIR → renderer consumes

This is architecturally significant because it enforces I15 (renderer is sink-only) by ensuring ALL interpretation happens before the renderer.

**Status**: ACCEPTED

---

## Q3: Backend Interface — Tier Classification

**Tag**: COMPLEMENT
**Severity**: LOW (tier decision)

**New Sources**: Define `RenderBackend<TTarget>` interface with `beginFrame/executePass/endFrame`.

**Question**: What tier should the backend interface be?

**Options**:
- **T2 (Structural)**: If we consider the backend abstraction as an architectural seam that many things depend on
- **T3 (Optional)**: If we consider it an implementation detail that can change freely

**Assessment**: The INTERFACE (generic backend contract) is T2 because it defines the seam between runtime and rendering. The SPECIFIC BACKENDS (Canvas2D, SVG, WebGL) are T3 because they can change freely.

**Proposed Resolution**: Add RenderBackend interface to Topic 06 as T2 content. SVG/WebGL/Canvas specifics remain T3 notes.

**Status**: ACCEPTED

---

## Q4: Per-Instance Shape Pass Kind

**Tag**: GAP
**Severity**: LOW (future feature)

**New Sources (9-renderer.md)**: Defines two explicit pass kinds:
- `'instances2d_uniformShape'` — All instances share one geometry
- `'instances2d_shapeField'` — Each instance has its own shape reference

**Current Canonical**: RenderPassIR only has one kind: `'drawPathInstances'`.

**Assessment**: Per-instance shapes are a future feature (Field<shape2d>). The current spec supports only uniform shape per pass. Adding the second pass kind is forward-looking.

**Proposed Resolution**: Add as T3 note in Topic 06 — "Future: per-instance shape pass kind will be added when Field<shape2d> is implemented."

**Status**: ACCEPTED

---

## Q5: PathTopologyDef Contents

**Tag**: GAP
**Severity**: MEDIUM (missing type definition)

**New Sources**: Topologies contain:
```typescript
type PathTopologyDef = {
  verbs: Uint8Array;           // moveTo, lineTo, quadTo, cubicTo, close
  pointsPerVerb: Uint8Array;   // arity of each verb
}
```

**Current Canonical**: PathGeometryTemplate has `topologyId: number` and `closed: boolean`, but the topology registry contents are never defined.

**Assessment**: This is a genuine gap — we define the ID but not what it points to. The new sources fill this gap.

**Proposed Resolution**: Add PathTopologyDef to Topic 06 (Renderer) and GLOSSARY. This is T2 content because topologies are a structural concept that renderer backends depend on.

**Status**: ACCEPTED

---

## Resolution Summary

| # | Tag | Severity | Description |
|---|-----|----------|-------------|
| Q1 | CONTRADICTION-T3 | NORMAL | GeometryRegistry → Topology Registry |
| Q2 | COMPLEMENT | MEDIUM | RenderAssembler placement in runtime |
| Q3 | COMPLEMENT | LOW | Backend interface tier classification |
| Q4 | GAP | LOW | Per-instance shape pass kind |
| Q5 | GAP | MEDIUM | PathTopologyDef type definition |

**Blockers**: 0
**Must resolve before integration**: Q1, Q2, Q5
**Can defer**: Q3, Q4
