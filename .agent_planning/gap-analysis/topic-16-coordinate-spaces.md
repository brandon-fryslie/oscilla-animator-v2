---
topic: 16
name: Coordinate Spaces & Transforms
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/16-coordinate-spaces.md
audited: 2026-01-23T00:00:00Z
has_gaps: true
counts: { done: 9, partial: 2, wrong: 0, missing: 2, na: 3 }
---

# Topic 16: Coordinate Spaces & Transforms

## DONE

- Three-space model defined (Local/World/Viewport): Renderer comments clearly document all three spaces and their roles — src/render/Canvas2DRenderer.ts:13-16, src/render/future-types.ts:17-24
- Local space: Geometry centered at (0,0), magnitude O(1): PathGeometry invariant documented, polygon/star vertices at unit circle — src/render/future-types.ts:82-88, src/runtime/FieldKernels.ts:510-514
- World space: Normalized [0,1]: Layout kernels produce positions in [0,1]x[0,1], InstanceTransforms position is normalized — src/runtime/FieldKernels.ts:461, src/render/future-types.ts:121-122
- Viewport space: Backend-specific: Canvas renderer multiplies by (width, height). SVG uses viewBox — src/render/Canvas2DRenderer.ts:177, src/render/SVGRenderer.ts:178
- Transform chain (scale then translate): ctx.translate for world->viewport, ctx.scale for local->viewport — src/render/Canvas2DRenderer.ts:183-191
- Scale semantics (isotropic, min dimension): Uses D = min(width, height) for sizePx = size * D — src/render/Canvas2DRenderer.ts:240-241, src/render/future-types.ts:148
- scale2 (anisotropic) support: Optional per-instance vec2 scale in InstanceTransforms — src/render/future-types.ts:130-131
- Convention-based enforcement (naming): Positions are "position" (world), control points are "controlPoints" (local) — src/render/future-types.ts:82-88, 107-115
- World->Viewport only in renderer: Patch logic works in world space, renderer handles the final mapping — src/render/Canvas2DRenderer.ts:19-21

## PARTIAL

- Transform order (Scale, Rotate, Translate, Map): Canvas2D applies translate first then rotate then scale (via ctx operations). This produces equivalent geometric result but the conceptual order differs from spec's mathematical formula. The spec formula `pW = positionW + R(theta) * (scale * pL)` is equivalent to the canvas `translate(posW), rotate(theta), scale(s)` sequence — src/render/Canvas2DRenderer.ts:183-204
- Combination rule (scale * scale2): Implementation applies scale2 separately from size via ctx.scale(scale2.x, scale2.y) but does not multiply by `size` to get `S_effective = (size * scale2.x, size * scale2.y)`. In v2 renderer it does correctly: `scale(sizePx * scale2[i*2], sizePx * scale2[i*2+1])` in SVG but just `scale(scale2)` separately from `scale(sizePx)` in Canvas2D — src/render/Canvas2DRenderer.ts:191-192 (v1), 414-416 (v2 separate), SVGRenderer.ts:242-243 (combined)

## WRONG

(none)

## MISSING

- 3D extension (z coordinate): World space is defined as [0,1]^3 in spec but implementation only handles 2D positions. No depth (z) support, no vec3 positions, no positionZSlot — spec: "z is optional and defaults to 0.0"
- Camera projection (world->screen): Spec defines `pScreen = projectWorldToScreen(pW, cameraParams)` step between world and viewport. No projection kernel or camera params exist — spec: relates to Topic 18

## N/A

- Type-level axis (coordSpace on Extent): Spec explicitly defers this as "Future: Type-Level Axis (Deferred)" — spec: "Deferred because convention + block contracts are sufficient for v2"
- Camera projection with non-default params: Depends on Topic 18, not required for z=0 identity property — spec: Topic 18 dependency
- Depth fields (Field<float> for z): Depends on 3D extension implementation — spec: Future extension
