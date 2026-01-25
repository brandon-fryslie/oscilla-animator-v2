# Sprint: vec2-blocks - Migrate All vec2 Position Blocks to vec3

Generated: 2026-01-25
Confidence: HIGH: 6, MEDIUM: 1, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Eliminate all vec2 position types from the block system, standardizing on vec3 for all position data.

## Scope

**Deliverables:**
1. Delete CircularLayout (duplicate of CircleLayout)
2. Migrate PolarToCartesian to vec3
3. Migrate OffsetPosition to vec3 (rename to OffsetVec)
4. Migrate LayoutAlongPath to vec3 (positions, tangents, normals)
5. Update domain-registry position intrinsic to vec3
6. Update all affected kernels

**Explicitly NOT migrating (path control points stay vec2):**
- ProceduralPolygon.controlPoints
- ProceduralStar.controlPoints
- PathField control point operations
- Control point kernels (polygonVertex, starVertex)

## Work Items

### P0: Delete CircularLayout [HIGH]

**Rationale:** CircleLayout in instance-blocks.ts already outputs vec3. CircularLayout is redundant.

**Acceptance Criteria:**
- [ ] Remove CircularLayout block definition from geometry-blocks.ts
- [ ] Verify no usages in demo patches
- [ ] Verify no usages in tests
- [ ] Tests pass

**Technical Notes:**
- File: src/blocks/geometry-blocks.ts (lines ~71-131)
- Search for 'CircularLayout' to confirm no usages

---

### P1: Migrate PolarToCartesian to vec3 [HIGH]

**Current:** Takes angle, radius, centerX, centerY → outputs vec2 position
**Target:** Same inputs → outputs vec3 position (z=0)

**Acceptance Criteria:**
- [ ] Input ports unchanged (angle, radius, centerX, centerY)
- [ ] Output port `pos` changed from vec2 to vec3
- [ ] Kernel `polarToCartesian` updated to output stride 3
- [ ] Kernel signature updated
- [ ] Tests pass

**Technical Notes:**
- File: src/blocks/geometry-blocks.ts (lines ~15-65)
- Kernel: `polarToCartesian` in FieldKernels.ts or SignalKernels.ts
- Output z=0 always (2D polar in XY plane)

---

### P2: Migrate OffsetPosition to OffsetVec [HIGH]

**Current:** Takes vec2 posIn, amountX, amountY, rand → outputs vec2 posOut
**Target:** Takes vec3 posIn, amountX, amountY, amountZ, rand → outputs vec3 posOut

**Acceptance Criteria:**
- [ ] Rename block from OffsetPosition to OffsetVec
- [ ] Change posIn from vec2 to vec3
- [ ] Add amountZ input (default 0)
- [ ] Change posOut from vec2 to vec3
- [ ] Update kernel `offsetPosition` → `offsetVec` with stride 3
- [ ] Update kernel signature
- [ ] Tests pass

**Technical Notes:**
- File: src/blocks/geometry-blocks.ts (lines ~138-187)
- Similar pattern to JitterVec migration

---

### P3: Migrate LayoutAlongPath to vec3 [MEDIUM]

**Current:** Outputs vec2 positions, vec2 tangents
**Target:** Outputs vec3 positions, vec3 tangents, vec3 normals

**Acceptance Criteria:**
- [ ] positions output changed to vec3
- [ ] tangents output changed to vec3
- [ ] NEW normals output added (vec3)
- [ ] Kernel `circleLayout` updated for stride 3
- [ ] New kernel or logic for normal computation
- [ ] Tests pass

**Technical Notes:**
- File: src/blocks/path-operators-blocks.ts (lines ~133-235)
- Currently uses `circleLayout` kernel which outputs vec2
- Tangent for circle: perpendicular to radius (tangent.z = 0)
- Normal for 2D circle in XY plane: (0, 0, 1) or (0, 0, -1)

**Unknowns to Resolve:**
- Decide normal convention: always +Z, always -Z, or based on winding?

**Exit Criteria:**
- Normal convention documented in block description

---

### P4: Update domain-registry position intrinsic [HIGH]

**Current:** domain-registry.ts defines `position` intrinsic as vec2
**Target:** Change to vec3

**Acceptance Criteria:**
- [ ] position intrinsic type changed to vec3
- [ ] Materializer fillBufferIntrinsic updated for stride 3
- [ ] Any intrinsic consumers updated
- [ ] Tests pass

**Technical Notes:**
- File: src/compiler/domain-registry.ts
- Also affects: src/runtime/Materializer.ts (intrinsic buffer filling)

---

### P5: Update affected kernels [HIGH]

**Acceptance Criteria:**
- [ ] `polarToCartesian` kernel → vec3 output (stride 3)
- [ ] `offsetPosition` kernel → `offsetVec` (stride 3)
- [ ] `circleLayout` kernel → vec3 output (stride 3)
- [ ] All kernel signatures in kernel-signatures.ts updated
- [ ] Materializer comments updated
- [ ] Tests pass

**Technical Notes:**
- Files: src/runtime/FieldKernels.ts, src/runtime/kernel-signatures.ts
- SignalKernels.ts if scalar versions exist

---

### P6: Update demo patches if needed [HIGH]

**Acceptance Criteria:**
- [ ] Any demo patches using PolarToCartesian verified working
- [ ] Any demo patches using OffsetPosition updated to OffsetVec
- [ ] initial-compile-invariant.test.ts passes

**Technical Notes:**
- Check src/demo/*.ts for usages
- Most should "just work" since downstream blocks expect vec3

## Dependencies

- JitterVec already migrated (complete)
- GridLayout already outputs vec3 (no change needed)
- FieldPolarToCartesian already outputs vec3 (no change needed)

## Risks

1. **Kernel stride changes**: Ensure all stride calculations use `strideOf(type.payload)` not hardcoded values
2. **Intrinsic buffer size**: Position intrinsic buffer size changes from 2*N to 3*N floats
3. **Demo patch breakage**: Some patches may need wiring updates

## Verification

```bash
npm run typecheck
npm run test
npm run dev  # Verify demo patches render
```
