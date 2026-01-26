# ExtrudeLite Implementation Plan

**Feature**: 2.5D Relief Projection for Shape Rendering
**Date**: 2026-01-25
**Status**: Ready for Implementation

---

## Overview

ExtrudeLite is a renderer-only visual effect that creates the illusion of 3D depth by projecting shapes into a "relief" style with:
- **Back face**: Shape translated by light offset (darker)
- **Side bands**: Quad strips connecting front and back edges (shaded)
- **Front face**: Original shape (original color)

This is NOT a geometry change—it's a render-time visual style applied to existing DrawOps.

---

## Architecture Constraints

Per the spec (`ExtrudeLite.md`), this feature must:

1. **Be renderer-only** - No changes to IR, payloads, or slot allocation
2. **Be cleanly removable** - When real mesh3d+ExtrudeBevel arrives, this deletes cleanly
3. **Not change semantic geometry** - Picking, physics, debug fields unchanged
4. **Use existing coordinate spaces** - Screen-space points normalized [0..1]

---

## Current State

### What Exists

1. **`ExtrudeLite.ts`** - Geometry builder (STUB - only passes through front face)
   - `buildExtrudeLite()` function defined but returns stub plan
   - Types defined: `ExtrudeLiteParams`, `ExtrudeLiteInput`, `ExtrudeLiteDrawPlan`
   - TODO comments outline the algorithm

2. **`canvas2dDrawExtrudeLite.ts`** - Canvas adapter (COMPLETE)
   - `drawExtrudeLite()` entry point
   - `fillPolygon()`, `fillQuadStrip()`, `strokePolygon()` helpers
   - Properly handles normalized → pixel conversion

3. **NOT integrated** - Neither file is imported by Canvas2DRenderer

### What's Missing

1. **`buildExtrudeLite()` implementation** - Currently a stub
2. **Renderer integration** - No way to trigger extrude rendering
3. **Style flag on DrawOp** - Need `depthStyle: 'flat' | 'extrudeLite'`
4. **Parameter flow** - How do heightPx, lightDir, etc. reach the renderer?

---

## Implementation Plan

### Phase 1: Complete `buildExtrudeLite()` Core Algorithm

**File**: `src/render/canvas/ExtrudeLite.ts`

**Tasks**:
1. Implement offset calculation: `d = normalize(lightDir2) * extrudeHeight`
2. Implement back face generation: `p2[i] = p[i] + d` with darker color
3. Implement side band generation:
   - For each edge (i → i+1), build quad: `[p[i], p[i+1], p2[i+1], p2[i]]`
   - Calculate edge normal: `n = perp(normalize(p[i+1] - p[i]))`
   - Calculate shading: `k = clamp01(0.5 + 0.5 * dot(n, normalize(lightDir2)))`
   - Apply shade: `sideColor = mix(baseColor * 0.6, baseColor * 1.0, k) * shadeStrength`
4. Implement front face passthrough (already done in stub)

**Output**: `ExtrudeLiteDrawPlan` with populated `backFaces`, `sideBands`, `frontFaces`

**Test**: Unit test that verifies:
- Correct number of back faces, side bands, front faces
- Side band geometry is valid quads
- Shading varies based on edge orientation

---

### Phase 2: Add Style Flag to DrawOp Types

**File**: `src/render/types.ts`

**Tasks**:
1. Add optional `depthStyle` field to `PathStyle`:
   ```typescript
   export interface PathStyle {
     // ... existing fields ...

     /** Depth style for 2.5D effects (default: 'flat') */
     readonly depthStyle?: 'flat' | 'extrudeLite';

     /** ExtrudeLite parameters (only when depthStyle === 'extrudeLite') */
     readonly extrudeLiteParams?: ExtrudeLiteParams;
   }
   ```

2. Export `ExtrudeLiteParams` type from `ExtrudeLite.ts` (already exported)

**Constraint**: This is additive—no existing code breaks because `depthStyle` is optional and defaults to `'flat'`.

---

### Phase 3: Integrate into Canvas2DRenderer

**File**: `src/render/canvas/Canvas2DRenderer.ts`

**Tasks**:
1. Import extrude functions:
   ```typescript
   import { drawExtrudeLite } from './canvas2dDrawExtrudeLite';
   import type { ExtrudeLiteInput } from './ExtrudeLite';
   ```

2. Modify `renderDrawPathInstancesOp()`:
   - Check `style.depthStyle === 'extrudeLite'`
   - If true, convert instances to `ExtrudeLiteInput[]` and call `drawExtrudeLite()`
   - If false (or undefined), use existing flat rendering

3. Convert DrawPathInstancesOp to ExtrudeLite inputs:
   - For each instance, extract screen-space polygon from geometry
   - Apply instance transforms (position, rotation, scale) to get screen-space points
   - Extract fill color as RGBA01
   - Call `drawExtrudeLite()` with collected inputs and params

**Key insight**: The conversion happens AFTER instance transforms are resolved, so we're working in screen space.

---

### Phase 4: Wire Up Parameters (Optional - Hardcoded First)

**Initial approach**: Hardcode sensible defaults in renderer:
```typescript
const defaultExtrudeParams: ExtrudeLiteParams = {
  extrudeHeight: 0.01,  // 1% of min dimension
  lightDir: [-0.6, -0.8],  // Top-left light
  shadeStrength: 0.25,
  sideAlpha: 0.9,
};
```

**Future approach**: Flow from graph signals through RenderAssembler.
This requires:
- New signal slots in IR for extrude params
- RenderAssembler to populate `style.extrudeLiteParams`
- Block or node to expose these signals to user

**Deferring param flow** keeps this phase simple. Hardcoded values can be adjusted via constants.

---

### Phase 5: Testing & Verification

**Unit Tests**:
1. `ExtrudeLite.test.ts` - Test `buildExtrudeLite()`:
   - Triangle input produces 1 back face, 3 side quads, 1 front face
   - Quad input produces 1 back face, 4 side quads, 1 front face
   - Side shading varies by edge orientation
   - Edge cases: degenerate polygons, single point

2. `canvas2dDrawExtrudeLite.test.ts` - Already has structure, may need updates

**Integration Tests**:
1. Render a graph with `depthStyle: 'extrudeLite'` and verify visual output
2. Compare flat vs. extrudeLite rendering of same geometry
3. Verify no regression in existing flat rendering

**Manual Verification**:
1. Load dev environment
2. Create shape with extrude style enabled
3. Verify visual appearance matches spec (back/side/front layers visible)
4. Verify no console errors

---

## Files Modified

| File | Change Type | Description |
|------|-------------|-------------|
| `src/render/canvas/ExtrudeLite.ts` | MODIFY | Complete `buildExtrudeLite()` implementation |
| `src/render/types.ts` | MODIFY | Add `depthStyle` and `extrudeLiteParams` to PathStyle |
| `src/render/canvas/Canvas2DRenderer.ts` | MODIFY | Add extrude rendering path |
| `src/render/canvas/__tests__/ExtrudeLite.test.ts` | CREATE | Unit tests for geometry builder |

---

## Definition of Done

1. **`buildExtrudeLite()` produces correct geometry**
   - Back face: translated by offset, darker color
   - Side bands: valid quads, shaded by edge orientation
   - Front face: original points, original color

2. **`PathStyle.depthStyle` field exists**
   - Type is `'flat' | 'extrudeLite'`
   - Optional, defaults to `'flat'`

3. **Canvas2DRenderer respects `depthStyle`**
   - `'flat'`: existing behavior (unchanged)
   - `'extrudeLite'`: calls extrude rendering path

4. **Type check passes**: `npm run typecheck`

5. **Tests pass**: `npm run test`

6. **Build succeeds**: `npm run build`

7. **Visual verification**: Extrude effect visible in dev environment

8. **No regressions**: Existing flat rendering unchanged

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance regression in render loop | Medium | Medium | Only activate for `extrudeLite` style; flat path unchanged |
| Coordinate space confusion | Medium | High | Use existing screen-space normalization; test with known geometries |
| Complex paths (curves, holes) | Low | Medium | Start with polygon-only (closed rings); spec allows this limitation |
| Side band winding issues | Medium | Medium | Test with clockwise/counterclockwise polygons; ensure consistent winding |

---

## Future Work (Out of Scope)

1. **Signal-based parameters** - Flow heightPx, lightDir, etc. from graph
2. **Bevel hint stroke** - Light 1px stroke on front face top-left edges
3. **Complex paths** - Extend beyond simple polygon rings
4. **SVG renderer support** - Equivalent implementation for SVG output
5. **Per-edge shading** - More sophisticated lighting model

These are deferred to keep this implementation focused and cleanly removable.

---

## Sign-Off

**Feature**: ExtrudeLite 2.5D Relief Rendering
**Prepared by**: Claude Code
**Date**: 2026-01-25
**Status**: Ready for implementation

