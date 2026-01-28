# Definition of Done: vec2 to vec3 Migration

**Sprint**: SPRINT-20260125-vec2-blocks
**Status**: READY FOR IMPLEMENTATION
**Confidence**: HIGH

## Acceptance Criteria

### P0: Delete CircularLayout
- [ ] CircularLayout block removed from geometry-blocks.ts
- [ ] No compilation errors
- [ ] No test failures

### P1: PolarToCartesian → vec3
- [ ] Output `pos` type is `canonicalType('vec3')`
- [ ] Kernel outputs (x, y, 0) - z is always 0
- [ ] kernel-signatures.ts updated

### P2: OffsetPosition → OffsetVec
- [ ] Block renamed from OffsetPosition to OffsetVec
- [ ] Input `posIn` type is `canonicalType('vec3')`
- [ ] Input `amountZ` added with default 0
- [ ] Output `posOut` type is `canonicalType('vec3')`
- [ ] Kernel renamed and updated for stride 3

### P3: LayoutAlongPath → vec3
- [ ] Output `positions` type is `signalTypeField('vec3', 'default')`
- [ ] Output `tangents` type is `signalTypeField('vec3', 'default')`
- [ ] NEW output `normals` type is `signalTypeField('vec3', 'default')`
- [ ] Kernel updated for stride 3 positions
- [ ] Tangent computation outputs (tx, ty, 0)
- [ ] Normal computation outputs (0, 0, 1) for counter-clockwise, (0, 0, -1) for clockwise

### P4: Position Intrinsic → vec3
- [ ] domain-registry.ts position intrinsic type is vec3
- [ ] Materializer.ts fillBufferIntrinsic handles stride 3 for position
- [ ] Buffer allocation uses 3*N floats for position

### P5: Kernels Updated
- [ ] `polarToCartesian` → stride 3 output
- [ ] `offsetPosition` renamed to `offsetVec`, stride 3
- [ ] `circleLayout` → stride 3 output
- [ ] All kernel signatures updated in kernel-signatures.ts
- [ ] Materializer.ts header comments updated

### P6: Demo Patches Working
- [ ] initial-compile-invariant.test.ts passes
- [ ] npm run dev loads without errors
- [ ] All demo patches render correctly

## Global Success Criteria

- [ ] No vec2 types remain for position data in blocks (control points excepted)
- [ ] TypeScript compilation succeeds
- [ ] All tests pass
- [ ] Demo patches render

## Verification Commands

```bash
npm run typecheck
npm run test
npm run dev
```

## Out of Scope

- Path control points (ProceduralPolygon, ProceduralStar, PathField) - these stay vec2
- polygonVertex, starVertex kernels - these compute local-space control points
