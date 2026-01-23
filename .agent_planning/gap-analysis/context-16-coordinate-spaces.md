---
topic: 16
name: Coordinate Spaces & Transforms
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/16-coordinate-spaces.md
generated: 2026-01-23T00:00:00Z
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: []
---

# Context: Topic 16 — Coordinate Spaces & Transforms

## What the Spec Requires

1. Three-space model: Local (geometry, centered at origin), World (normalized [0,1]^3), Viewport (pixels/viewBox)
2. Local space: control points near origin, magnitude O(1), per geometry template not per instance
3. World space: [0,1]^3 cube. xy for 2D layout, z for depth (defaults to 0). Layout blocks produce xy positions.
4. Viewport space: backend-specific (pixels for canvas, viewBox for SVG, clip for WebGL)
5. Transform chain: pW = positionW + R(theta) * (scale * pL), then project world->screen, then pV = pScreen * viewportDimensions
6. Transform order: Scale local, Rotate, Translate to world, Project (camera), Map to viewport
7. Scale is isotropic local->world factor. scalePx = scale * min(viewportWidth, viewportHeight)
8. Reference dimension: min(viewportWidth, viewportHeight) ensures aspect-independent sizing
9. scale2 is optional anisotropic vec2. Combination: S_effective = (scale * scale2.x, scale * scale2.y)
10. Convention-based enforcement: controlPoints/vertices/path = Local, position/offset/center = World
11. World->Viewport conversion happens ONLY in renderer (patches work in world space)
12. 3D extension: z in [0,1], depth is optional, layout kernels produce xy, depth authored separately
13. Identity property at z=0: With default orthographic, screenX=worldX, screenY=worldY (exact IEEE 754)

## Current State (Topic-Level)

### How It Works Now

The three-space model is well-established in practice. Local-space geometry (control points for paths, polygon vertices) is defined centered at origin with unit magnitude. World-space positions are normalized [0,1]x[0,1] produced by layout kernels. The renderer performs the only world-to-viewport mapping via `position * (width, height)` and `size * D` where D = min(width, height). The transform chain in Canvas2D uses ctx.translate for world->viewport, ctx.rotate for rotation, and ctx.scale for local->viewport scaling. The SVGRenderer handles the same model with transform attributes. The z-dimension (depth) is not yet implemented.

### Patterns to Follow

- Geometry definition in `src/shapes/` (topologies.ts defines local-space shapes)
- Layout kernels in `src/runtime/FieldKernels.ts` produce world-space [0,1] positions
- Renderer in `src/render/Canvas2DRenderer.ts` performs viewport mapping
- Future types in `src/render/future-types.ts` document coordinate space invariants clearly

## Work Items

### WI-1: Add 3D Extension (z coordinate)

**Status**: MISSING
**Spec requirement**: "World space is [0,1]^3. z is optional, defaults to 0.0. Depth authored separately via positionZSlot."
**Files involved**:
| File | Role |
|------|------|
| src/render/future-types.ts | Add z to InstanceTransforms (optional Float32Array) |
| src/compiler/ir/types.ts | Add positionZSlot to StepRender |
| src/runtime/RenderAssembler.ts | Resolve z buffer |
| src/render/Canvas2DRenderer.ts | Use z for draw order (when no camera) |

**Current state**: Only 2D positions (vec2). No z-coordinate support anywhere in the pipeline.
**Required state**: Optional z field (Float32Array) in instance transforms, used for depth ordering at minimum.
**Suggested approach**:
1. Add optional `depthZ?: Float32Array` to InstanceTransforms
2. Add optional `positionZSlot?: ValueSlot` to StepRender
3. When z is present without camera, use for z-sorting instances within a pass
4. When camera is added (Topic 18), z feeds into projection kernel
**Risks**: Performance impact of depth sorting; interaction with layer system
**Depends on**: Topic 06 WI-2 (DrawPathInstancesOp unification)

### WI-2: Fix scale2 Combination Rule in Canvas2D v2

**Status**: PARTIAL
**Spec requirement**: "S_effective = (scale * scale2.x, scale * scale2.y)"
**Files involved**:
| File | Role |
|------|------|
| src/render/Canvas2DRenderer.ts | Fix v2 scale application |

**Current state**: In the v2 Canvas2D renderer (renderDrawPathInstancesOp), scale2 is applied as a separate ctx.scale(scale2.x, scale2.y) BEFORE the ctx.scale(sizePx, sizePx). Due to canvas transform stacking, this produces `sizePx * scale2.x` and `sizePx * scale2.y` which is correct (transforms multiply). However, the code order is unintuitive: scale2 is applied first (line 414-416) then size (line 423).
In the v1 path, scale2 (line 191-192) is applied before the path render which has its own scale(sizePx, sizePx) call, so they also compose correctly.
**Required state**: Correct combination. Current state is actually correct mathematically due to canvas transform composition. The concern is readability.
**Suggested approach**:
- Verify the actual pixel output matches spec formula
- If correct, add comment explaining the transform order
- The SVGRenderer (line 242-243) does it explicitly: `scale(sizePx * scale2.x, sizePx * scale2.y)`
**Risks**: None if behavior is verified correct
**Depends on**: none
