# Definition of Done: path-foundation

**Sprint:** Path Foundation
**Confidence:** HIGH (research tasks verified 2026-01-20)
**Depends On:** unified-shape-foundation ✅ COMPLETE

## Acceptance Criteria

### 1. Path Types Defined

- [ ] PathVerb enum with MOVE, LINE, CUBIC, QUAD, CLOSE
- [ ] PathTopologyDef interface with verbs, pointsPerVerb, totalControlPoints, closed
- [ ] Types exported from `src/shapes/types.ts`
- [ ] Types documented with JSDoc

### 2. DOMAIN_CONTROL Extended

- [ ] DOMAIN_CONTROL has 'index' intrinsic (int)
- [ ] DOMAIN_CONTROL has 'position' intrinsic (vec2)
- [ ] Instance creation works: `createInstance(DOMAIN_CONTROL, n)`
- [ ] Field creation works: `fieldIntrinsic(instance, 'position', vec2)`

### 3. ProceduralPolygon Block

- [ ] Block registered with type 'ProceduralPolygon'
- [ ] Input: sides (int, compile-time constant)
- [ ] Input: radiusX (float, modulatable)
- [ ] Input: radiusY (float, modulatable)
- [ ] Output: shape (PathShapeRef)
- [ ] Output: controlPoints (Field<vec2>)
- [ ] Creates correct PathTopologyDef for N-gon
- [ ] Creates instance over DOMAIN_CONTROL with N points
- [ ] Compiles without errors

### 4. Control Point Modulation

- [ ] FieldMap works on control point fields
- [ ] Stretch: `fieldMap(cp, scale)` changes shape dimensions
- [ ] Joint angle: moving individual points changes angles
- [ ] Modifications visible in rendered output
- [ ] No topology change (point count stays same)

### 5. Path Rendering

- [ ] Canvas2DRenderer handles PathTopologyDef
- [ ] MOVE verb → ctx.moveTo()
- [ ] LINE verb → ctx.lineTo()
- [ ] CLOSE verb → ctx.closePath()
- [ ] Path fills correctly (closed paths)
- [ ] Control point positions read from buffer
- [ ] Visual: Pentagon renders as 5-sided shape
- [ ] Visual: Different radiusX/radiusY shows elliptical polygon

### 6. Pipeline Integration

- [ ] Schedule includes path topology reference
- [ ] Schedule includes control point field
- [ ] Executor evaluates control point field each frame
- [ ] Executor passes data to renderer correctly
- [ ] Works with existing instance system

### 7. Tests

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] Unit test: PathTopologyDef creation
- [ ] Unit test: ProceduralPolygon block lowering
- [ ] Integration test: path compiles end-to-end

### 8. Demo

- [ ] Demo patch with ProceduralPolygon
- [ ] Polygon visible and correctly shaped
- [ ] Can modify radiusX/radiusY and see changes

## Research Tasks (COMPLETED 2026-01-20)

- [x] Verify DOMAIN_CONTROL instance creation in existing codebase ✅
- [x] Verify Field<vec2> over DOMAIN_CONTROL ✅
- [x] Prototype standalone path rendering function ✅

## Verification Commands

```bash
npm run typecheck
npm test
npm run dev  # Visual verification
```

## Not In Scope

- Bezier curves (CUBIC, QUAD verbs)
- SVG path loading
- PathField block (separate sprint)
- Trim operator (separate sprint)
- Instance-along-path layout (separate sprint)
- Boolean path operations

## Exit Criteria to HIGH Confidence

Research tasks above must complete successfully. If any fail, reassess approach before full implementation.
