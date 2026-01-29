# Definition of Done - ExtrudeLite

**Feature**: 2.5D Relief Projection for Shape Rendering
**Date**: 2026-01-25

---

## Acceptance Criteria

### Core Algorithm (buildExtrudeLite)

- [ ] **Back face generation works**
  - Input polygon points are translated by `offset = normalize(lightDir) * extrudeHeight`
  - Back face color is darkened (e.g., `baseColor * 0.6`)
  - One back face per input instance

- [ ] **Side band generation works**
  - For each edge (i → i+1), a quad is generated connecting front and back vertices
  - Quad vertices: `[p[i], p[i+1], p2[i+1], p2[i]]` where p2 = p + offset
  - Quads are stored in `Float32Array` format (8 floats per quad)

- [ ] **Side band shading works**
  - Edge normal calculated: `n = perp(normalize(edge))`
  - Shading intensity: `k = clamp01(0.5 + 0.5 * dot(n, normalize(lightDir)))`
  - Side color varies by edge orientation
  - `shadeStrength` parameter controls shading intensity

- [ ] **Front face passthrough works**
  - Original points and color passed through unchanged
  - Front face drawn last (on top)

### Type System

- [ ] **`PathStyle.depthStyle` field exists**
  - Type: `'flat' | 'extrudeLite'`
  - Optional (defaults to `'flat'`)
  - Located in `src/render/types.ts`

- [ ] **`PathStyle.extrudeLiteParams` field exists**
  - Type: `ExtrudeLiteParams` (from ExtrudeLite.ts)
  - Optional (only used when `depthStyle === 'extrudeLite'`)

- [ ] **No breaking changes to existing types**
  - All fields are optional/additive
  - Existing code compiles without modification

### Renderer Integration

- [ ] **Canvas2DRenderer handles `depthStyle: 'flat'`**
  - Existing behavior unchanged
  - Default behavior when `depthStyle` is undefined

- [ ] **Canvas2DRenderer handles `depthStyle: 'extrudeLite'`**
  - Converts DrawPathInstancesOp to ExtrudeLiteInput format
  - Calls `drawExtrudeLite()` with correct parameters
  - Draws back faces, then side bands, then front faces

- [ ] **Instance transforms are applied correctly**
  - Position, rotation, scale applied before extrude calculation
  - Points are in screen-space [0,1] when passed to buildExtrudeLite

### Build & Tests

- [ ] **Type check passes**: `npm run typecheck`

- [ ] **All tests pass**: `npm run test`

- [ ] **Build succeeds**: `npm run build`

- [ ] **Unit tests exist for `buildExtrudeLite()`**
  - Triangle test: 3 vertices → 3 side quads
  - Quad test: 4 vertices → 4 side quads
  - Shading test: different edges have different colors
  - Edge case test: degenerate input handling

### Visual Verification

- [ ] **Dev environment loads**: `npm run dev`

- [ ] **Flat rendering unchanged**
  - Existing shapes render correctly
  - No visual regression

- [ ] **Extrude effect visible** (when enabled via code)
  - Back face visible behind front face
  - Side bands visible between front and back
  - Shading creates depth illusion

- [ ] **No console errors**

### Code Quality

- [ ] **One focused commit** with descriptive message

- [ ] **No unrelated changes**

- [ ] **Code follows existing patterns**
  - Matches Canvas2DRenderer style
  - Uses existing coordinate space conventions

---

## How to Test

### Automated

```bash
# Type check
npm run typecheck

# Unit tests
npm run test

# Build
npm run build
```

### Manual Visual Test

1. Start dev server: `npm run dev`
2. Load a graph with shapes
3. Temporarily modify code to force `depthStyle: 'extrudeLite'`:
   ```typescript
   // In Canvas2DRenderer.ts, temporarily add:
   const style = { ...op.style, depthStyle: 'extrudeLite' as const };
   ```
4. Verify extrude effect is visible
5. Revert temporary change

### Unit Test Commands

```bash
# Run ExtrudeLite tests specifically
npx vitest run src/render/canvas/__tests__/ExtrudeLite.test.ts
```

---

## Success Criteria Summary

✅ `buildExtrudeLite()` produces valid draw plan with back/side/front
✅ `PathStyle` has optional `depthStyle` and `extrudeLiteParams` fields
✅ Canvas2DRenderer renders extrude style when requested
✅ Flat rendering is unchanged (no regression)
✅ All automated tests pass
✅ Visual verification confirms effect works
✅ Clean, focused commit

---

## Out of Scope (Explicitly NOT Required)

- Signal-based parameter flow from graph
- Bevel hint stroke effect
- Complex paths with curves or holes
- SVG renderer support
- DrawPrimitiveInstancesOp support (paths only)

