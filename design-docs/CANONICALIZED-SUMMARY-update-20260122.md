---
command: /canonicalize-architecture ./design-docs design-docs/_new/renderer
files: design-docs/_new/renderer/8-before-render.md design-docs/_new/renderer/9-renderer.md design-docs/_new/renderer/10-multiple-backends.md design-docs/_new/renderer/11-svg.md
indexed: true
source_files:
  - design-docs/_new/renderer/8-before-render.md
  - design-docs/_new/renderer/9-renderer.md
  - design-docs/_new/renderer/10-multiple-backends.md
  - design-docs/_new/renderer/11-svg.md
topics:
  - renderer
  - runtime
---

# Update Summary: Renderer Architecture Integration

**Date**: 2026-01-22
**Sources**: 4 files from `design-docs/_new/renderer/`
**Affected Topics**: 06-renderer, 05-runtime
**New Topics Proposed**: 0

---

## Source Analysis

| File | Content | Alignment |
|------|---------|-----------|
| `8-before-render.md` | RenderAssembler: the stage between schedule execution and rendering | COMPLEMENT to Topic 05/06 |
| `9-renderer.md` | Future-proof renderer contract, cleanup of shape interpretation | COMPLEMENT to Topic 06 |
| `10-multiple-backends.md` | Backend interface, capability negotiation, multi-target | COMPLEMENT to Topic 06 |
| `11-svg.md` | SVG-specific backend strategies (defs/use, caching, pooling) | COMPLEMENT to Topic 06 |

---

## Findings by Category

### T3 Contradiction (NORMAL): 1

1. **GeometryRegistry string keys** — Current Topic 06 "Asset Management" section describes `GeometryRegistry` with `Map<string, GeometryAsset>`. All new sources insist on numeric topology IDs with O(1) array indexing. The Asset Management section should be updated to reflect numeric IDs.

### Overlaps (Already Canonical): 5

All core concepts are already in canonical spec from Update 7 (Kernel Roadmap):

1. DrawPathInstancesOp (D34)
2. Local-space geometry (D31, Topic 16)
3. Renderer as sink (I15)
4. Numeric topology IDs (implied by D34, PathGeometryTemplate)
5. scale/transform semantics (D32, Topic 16)

### Complements (New Detail for Existing Topics): 6

1. **RenderAssembler** — New architectural component in runtime that:
   - Walks render sinks
   - Materializes required fields via Materializer
   - Reads scalar banks for uniforms
   - Resolves shape2d → (topologyId, pointsBuffer, flags/style)
   - Outputs RenderFrameIR with only concrete buffers
   - Lives in runtime, NOT renderer
   - Enforces "renderer is sink-only" invariant

2. **RenderBackend interface** — Generic backend contract:
   ```typescript
   interface RenderBackend<TTarget> {
     beginFrame(target: TTarget, frameInfo: FrameInfo): void;
     executePass(pass: RenderPassIR): void;
     endFrame(): void;
   }
   ```

3. **Backend capability negotiation** — BackendCaps type for optional lowering.

4. **SVG backend strategies** — `<defs>/<use>` pattern, `d` string caching, DOM pooling, stable element identity.

5. **Per-instance style** — Distinction between uniform style (PathStyle on DrawPathInstancesOp) and per-instance style fields (Float32Array / Uint8ClampedArray per instance).

6. **Pass-level prevalidation** — Validate once per pass (topology exists, points buffer exists, counts match), then loop instances with no checks.

### Gaps (Underspecified in Canonical): 3

1. **shape2d resolution** — How shape2d packed handle becomes PathGeometryTemplate
2. **Per-instance shape pass kind** — `'instances2d_shapeField'` vs `'instances2d_uniformShape'`
3. **PathTopologyDef** — What a topology contains (verbs, arities, closedness)

---

## Proposed Changes

### Topic 06 (Renderer) — Updates

1. Replace "Asset Management" section with **Topology Registry** section (numeric IDs, array lookup)
2. Add **Backend Interface** section with RenderBackend<TTarget>
3. Add **SVG Backend** notes as T3 implementation detail
4. Add **Per-Instance Shape** pass kind concept
5. Add **PathTopologyDef** type definition
6. Add pass-level prevalidation to error handling

### Topic 05 (Runtime) — Updates

1. Add **RenderAssembler** subsection explaining the assembly stage
2. Clarify that RenderFrameIR production is runtime responsibility (not renderer)
3. Add shape2d resolution path explanation

### GLOSSARY Updates

1. Add: RenderAssembler, RenderBackend, PathTopologyDef
2. Update: RenderFrameIR (note about who produces it)
3. Deprecate: GeometryAsset (already deprecated per D34), GeometryRegistry

---

## Alignment Assessment

**Overall alignment: VERY HIGH.** The new sources are deeply consistent with Update 7 (Kernel Roadmap) which already established the draw-op-centric model, local-space geometry, and coordinate spaces. These new sources fill in implementation-level detail that was left as gaps in D34.

**Recommendation**: Given zero CRITICAL/HIGH contradictions and strong alignment, these can be integrated immediately after user approval of T3 contradiction fix and complement integrations.
