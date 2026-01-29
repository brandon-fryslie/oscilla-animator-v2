# ExtrudeLite 3D Renderer Implementation Plan

**Topic**: extrudelite-renderer
**Status**: READY FOR DECISION
**Created**: 2026-01-25
**Confidence Level**: HIGH (architecture clear, decisions needed)

---

## Executive Summary

ExtrudeLite is a pseudo-3D polygon extrusion effect renderer that creates depth perception on flat shapes. The codebase has skeleton code in place (`ExtrudeLite.ts` and `canvas2dDrawExtrudeLite.ts`), but implementation is blocked on **5 critical architectural decisions**.

This plan outlines a 5-phase implementation approach (19-27 hours) with clear success criteria and risk mitigation.

---

## What is ExtrudeLite?

### Visual Effect
- **Input**: 2D closed polygons + extrusion parameters (height, light direction, shading strength)
- **Output**: 3D pseudo-extrusion effect (depth perception on flat canvas)
- **Rendering**: Three layers painted back-to-front:
  1. Back faces (offset copies, solid color)
  2. Side bands (connecting edges with lighting)
  3. Front faces (original polygons)

### Example
A circle with extrusion height 0.02 and light from top-right appears as a flat disk with visible depth and shading on the sides—like looking at a 3D cylinder from above.

---

## Current Code State

### Existing Files
- `src/render/canvas/ExtrudeLite.ts` (~81 lines)
  - Interfaces: `ExtrudeLiteParams`, `ExtrudeLiteInput`, `ExtrudeLiteDrawPlan`
  - Main function: `buildExtrudeLite()` (currently a stub returning empty results)
  - TODO comments for: offsetting algorithm, side band construction, shading

- `src/render/canvas/canvas2dDrawExtrudeLite.ts`
  - Renderer functions: `fillPolygon()`, `fillQuadStrip()`, `drawPlan()`
  - Canvas2D rendering plumbing (status unknown, needs review)

### Integration Status
- **Never called from production code** (dead code per audit)
- **No RenderAssembler connection** (unclear where it fits in pipeline)
- **No UI controls** (users can't enable extrusion)

---

## PHASE 1: Architecture & Design Analysis

### Phase 1.1: Confirm Integration Points

**5 Critical Questions That Must Be Answered**:

#### Q1: Pipeline Insertion Point
- **Option A**: Canvas2D-only preprocessor (simplest)
  - Called before standard render ops, produces canvas output directly
  - Pros: Quick to implement, isolated feature
  - Cons: Canvas2D-only (no future multi-backend support)

- **Option B**: New DrawOp type (`DrawExtrudedInstancesOp`)
  - Adds to IR, dispatcher in Canvas2DRenderer
  - Pros: Multi-backend capable, spec-aligned
  - Cons: More IR plumbing needed

- **Option C**: Style modifier on existing ops
  - Extrusion as a flag/style on `DrawPathInstancesOp`
  - Pros: Minimal IR changes
  - Cons: Less explicit, could get messy

**Recommendation**: Defer decision to implementation phase. Start with Option A (preprocessor) as MVP, design so it can be promoted to Option B later.

#### Q2: User Workflow
- **Option A**: Property on RenderInstances2D block
  - Extrusion params set per render step
  - Pros: Directly tied to rendering, simple UI
  - Cons: All instances in step get same extrusion

- **Option B**: Separate DepthStyle block
  - Chained before RenderInstances2D
  - Pros: Flexible, reusable across steps
  - Cons: Adds new block type, more graph complexity

- **Option C**: Global canvas setting
  - Extrusion applied to all RenderInstances2D
  - Pros: Simple
  - Cons: Inflexible (can't mix extruded/flat on same canvas)

**Recommendation**: Option A (property on RenderInstances2D) is simplest for v2-now. Option B can be explored in future if per-group control is needed.

#### Q3: Per-Instance Variation
- **v1 Scope**: Uniform parameters across all instances in a group
  - All polygons get same height, light direction, shading
  - Simplest to implement

- **v2 Enhancement**: Per-instance parameters
  - Each polygon can have different extrusion
  - Requires signal/field branching in block
  - More complex buffer layout

**Recommendation**: v2-now uses uniform parameters (v1 scope). Per-instance is deferred work (v2-later).

#### Q4: Projection Interaction
- **Option A**: Extrude in screen space (normalized coords)
  - Current stub assumes this
  - Works with orthographic projection
  - Doesn't work correctly with 3D perspective

- **Option B**: Extrude in world space (before projection)
  - Requires 3D math, camera integration
  - Complex but correct for 3D scenes

**Recommendation**: Option A (screen space) for v2-now. Document as limitation. WebGL + 3D extrusion is future work.

#### Q5: Fallback Behavior
- **Option A**: Render without extrusion (fallback to flat)
- **Option B**: Skip rendering entirely
- **Option C**: Log error and crash

**Recommendation**: Option A (graceful fallback). Invalid extrusion parameters should not break rendering.

---

### Phase 1.2: Algorithmic Design & Memory Model

**Polygon Offsetting**
```
For each vertex p in polygon:
  offset = lightDir * extrudeHeight
  backP = p + offset
```
- Simple vector addition
- Offset is uniform (same for all vertices)

**Side Band Construction**
```
For each edge (pi, pj) in polygon:
  Create quad: [pi, pj, pj+offset, pi+offset]
  Compute normal: rotate edge 90° in screen space
  Compute shade: dot(normal, lightDir) clamped to [0,1]
  Blend side color: mix(baseColor, shadeColor, shadeFactor)
```
- One quad per edge (n polygons × m-sided = n×m quads)
- Winding order critical (CCW for front-facing)

**Shading Calculation**
```
edge_normal = rotate(pj - pi, 90°)
shade_factor = clamp(dot(edge_normal, lightDir), 0, 1)
side_color = lerp(baseColor, shadeColor, shadeStrength * shade_factor)
side_color.a *= sideAlpha
```

**Memory Model**
- Input: Instance array (each has pointsXY buffer and base color)
- Output: Three separate arrays (backFaces, sideBands, frontFaces)
- Allocation strategy: **Allocate fresh each frame** (simpler than pooling for now, revisit if perf issue)
- Buffer layout: `Float32Array` for all geometry (matches Canvas2D expectation)

**Success Criteria**:
- Pseudocode for all algorithms reviewed and validated
- Math examples with actual numbers (triangle case, square case)
- Memory budget: ~200 bytes per polygon (worst case, depends on vertex count)
- Decision made on allocation strategy (fresh vs. pooled)

---

### Phase 1.3: Test Strategy & Fixtures

**Unit Test Fixtures** (in `__tests__/fixtures/extrude-lite-fixtures.ts`):
```typescript
simpleTriangle()    // 3 vertices, known output
simpleSquare()      // 4 vertices, axis-aligned
starShape()         // 6+ vertices, concave (catch winding bugs)
largeRandomPolygons()  // 100+ polygons for perf
```

**Test Coverage Matrix**:
- Happy path: Simple inputs, expected outputs
- Edge cases: 0-2 vertices, collinear points
- Extreme params: height=0, negative (invalid), very large
- Light direction: normalized, non-normalized, zero vector

**Integration Tests**:
- Verify Canvas2D rendering order (back → sides → front)
- Verify colors apply correctly
- Mock CanvasRenderingContext2D (jsdom) for CI

**Visual/Regression Tests**:
- Render simple scene to canvas
- Capture to PNG
- Compare against golden reference (manual first pass)

**Performance Tests**:
- Benchmark: build + render for 100, 1000, 10k polygons
- Target: <5ms per 1000 polygons
- Profile to identify hot loops

**Success Criteria**:
- Test plan document with test matrix (95%+ coverage target)
- Fixture functions created and documented
- Performance baseline established

---

## PHASE 2: Implementation - Geometry Builder

### Phase 2.1: Core Algorithm Implementation

**Implementation Tasks**:

1. **Input Validation**
   - Assert `instances.length > 0`
   - Assert each polygon has ≥3 vertices
   - Normalize `lightDir` (magnitude = 1)
   - Clamp extrusion parameters to sensible ranges
   - Throw descriptive errors

2. **Per-Instance Processing Loop**
   ```typescript
   for (const inst of instances) {
     const offset = { x: lightDir[0] * height, y: lightDir[1] * height };
     const backFace = offsetPolygon(inst.pointsXY, offset);
     const sideBands = constructSideBands(inst.pointsXY, offset, baseColor, ...);
     results.backFaces.push({ pointsXY: backFace, fill: backColor });
     results.sideBands.push(...sideBands);
     results.frontFaces.push({ pointsXY: inst.pointsXY, fill: inst.fill });
   }
   ```

3. **Color Computation**
   ```typescript
   // Front/back: use base color directly
   // Sides: compute shading blend per quad
   for (const quad of sideBands) {
     const edgeNormal = computeEdgeNormal(quad.edge);
     const shadeFactor = dot(edgeNormal, lightDir);
     quad.fill = blendColors(baseColor, shadeColor, shadeStrength * shadeFactor, sideAlpha);
   }
   ```

4. **Buffer Assembly**
   - Collect back faces (with shared back color)
   - Collect side quads (each with computed color)
   - Collect front faces (with base color)
   - Return `{ backFaces, sideBands, frontFaces }`

**Success Criteria**:
- Compiles without warnings or `any` casts
- All unit tests pass
- Handles 1-1000 instances without error
- Error cases return meaningful messages

---

### Phase 2.2: Helper Functions & Polish

**Geometry Helpers**:
- `computeOffset(lightDir, height)`: Vector scaling
- `computeEdgeNormal(p1, p2)`: 2D perpendicular
- `computeShading(normal, lightDir, strength)`: Shade factor
- `blendColors(base, shade, factor, alpha)`: RGBA blending
- `offsetPolygon(points, offset)`: Apply offset to all vertices
- `constructSideBands(points, offset, color, ...)`: Generate quads

**Buffer Management**:
- Decision: Allocate fresh each frame (no pooling for v2-now)
- Justification: Simpler code, avoid cache/invalidation bugs
- Future: Add pooling if profiling shows GC pressure

**Performance Optimizations**:
- Minimize allocations in per-quad loop
- Reuse intermediate vectors where possible
- Use `Float32Array` throughout (SIMD-friendly)

**Code Documentation**:
- Why for non-obvious calculations
- Assumptions (closed, non-self-intersecting)
- Coordinate space (normalized screen coords [0..1])

**Success Criteria**:
- All helpers exist, tested, documented with JSDoc
- Performance baseline: <2ms per 1000 polygons (just geometry, no rendering)
- No compiler warnings

---

## PHASE 3: Integration & Canvas2D Rendering

### Phase 3.1: Canvas2D Rendering Implementation

**Canvas Rendering Tasks**:

1. **Implement `fillPolygon()`**
   ```typescript
   function fillPolygon(ctx, points, fill, widthPx, heightPx) {
     ctx.fillStyle = rgbaToCSS(fill);
     ctx.beginPath();
     for (let i = 0; i < points.length; i += 2) {
       const x = points[i] * widthPx;
       const y = points[i+1] * heightPx;
       if (i === 0) ctx.moveTo(x, y);
       else ctx.lineTo(x, y);
     }
     ctx.closePath();
     ctx.fill();
   }
   ```

2. **Implement `fillQuadStrip()`**
   - Similar to `fillPolygon()` but for quads
   - For each quad (8 floats = 4 points):
     - Create path, fill with quad's color
   - Alternative: Use `fillRect()` if axis-aligned

3. **Implement `drawPlan()`**
   ```typescript
   function drawPlan(ctx, plan, widthPx, heightPx) {
     // Painter's algorithm: back → sides → front
     for (const face of plan.backFaces)
       fillPolygon(ctx, face.pointsXY, face.fill, widthPx, heightPx);
     for (const band of plan.sideBands)
       fillQuadStrip(ctx, band.quadsXY, band.fill, widthPx, heightPx);
     for (const face of plan.frontFaces)
       fillPolygon(ctx, face.pointsXY, face.fill, widthPx, heightPx);
   }
   ```

4. **Canvas State Management**
   - Save/restore context (don't pollute global state)
   - Set fillStyle per layer
   - Handle path setup/cleanup correctly

**Integration Point**:
- Called from `renderFrame()` in Canvas2DRenderer
- Called before/after standard ops depending on Phase 1 decision (MVP: separate pass)

**Success Criteria**:
- Visual output matches expected (back layer darker, front layer bright)
- Colors and shading render correctly
- Painter's algorithm ordering is correct (no depth fighting)
- No memory leaks or canvas state pollution

---

### Phase 3.2: RenderAssembler Integration (Deferred)

**Conditional on Phase 1.1 Decision**:

- If Option A (preprocessor): Skip this phase for v2-now
- If Option B (new DrawOp): Add dispatch to Canvas2DRenderer
- If Option C (style modifier): Add style parsing to DrawPathInstancesOp

**Success Criteria**:
- Chosen path documented with rationale
- No breaking changes to existing IR
- Tests pass with new integration

---

## PHASE 4: Testing & Validation

### Phase 4.1: Unit & Integration Tests

**Unit Test File**: `src/render/canvas/__tests__/ExtrudeLite.test.ts`

```typescript
describe('buildExtrudeLite', () => {
  it('produces correct structure for simple triangle', () => {
    const input = [{ pointsXY: simpleTriangle(), fill: [1,0,0,1] }];
    const result = buildExtrudeLite(input, params);

    expect(result.backFaces.length).toBe(1);
    expect(result.sideBands.length).toBe(3);  // 3 edges
    expect(result.frontFaces.length).toBe(1);
  });

  // 10+ more tests covering edge cases, params, colors, etc.
});
```

**Integration Test File**: `src/render/canvas/__tests__/canvas2dDrawExtrudeLite.test.ts`

```typescript
describe('Canvas2D ExtrudeLite rendering', () => {
  it('renders layers in correct order', () => {
    // Mock canvas context, verify fill() called in order
  });

  it('applies colors correctly', () => {
    // Verify fillStyle set to correct colors
  });
});
```

**Visual Regression Tests**:
- Render known scene to canvas
- Capture output to PNG
- Compare against reference image (pixel diff)
- Tolerance: <1% pixel difference (account for AA variations)

**Performance Tests**:
```typescript
bench('buildExtrudeLite - 1000 polygons', () => {
  const instances = generateRandomPolygons(1000);
  buildExtrudeLite(instances, defaultParams);
});
// Target: <5ms
```

**Coverage Target**: 95%+ for `ExtrudeLite.ts` and `canvas2dDrawExtrudeLite.ts`

**Success Criteria**:
- 95%+ code coverage achieved
- All tests pass locally and in CI
- Visual output matches golden references
- Performance baseline: <5ms per 1000 polygons (build + render)

---

### Phase 4.2: Spec Conformance & Invariants

**Architectural Laws Review** (from CLAUDE.md):

1. **ONE SOURCE OF TRUTH**: Extrusion geometry derived, not cached ✓
2. **SINGLE ENFORCER**: Logic lives in `buildExtrudeLite()` only ✓
3. **ONE-WAY DEPENDENCIES**: Renderer is sink, doesn't affect graph ✓
4. **ONE TYPE PER BEHAVIOR**: One `buildExtrudeLite()` function ✓
5. **GOALS VERIFIABLE**: Visual appearance testable ✓

**System Invariants**:
- ✓ No mutation of input buffers
- ✓ Deterministic (same input → same output)
- ✓ No side effects outside frame boundary
- ✓ Allocations cleared at frame end (pooling TBD)

**Spec Alignment**:
- ✓ Local-space offsets (screen-normalized)
- ✓ No creative logic in renderer (style only)
- ✓ Extrusion is visual, not motion

**Success Criteria**:
- Conformance checklist signed off
- No architectural violations
- Edge cases and limitations documented

---

## PHASE 5: Documentation & Future Work

### Phase 5.1: Code Documentation

**Deliverables**:

1. **Inline Code Comments**
   - Why for non-obvious calculations
   - Assumptions (closed, non-self-intersecting, normalized coords)
   - Edge cases and limitations

2. **JSDoc for Public APIs**
   ```typescript
   /**
    * Build pseudo-3D extrusion geometry for polygons.
    *
    * @param instances Array of closed polygons with base colors
    * @param params Extrusion parameters (height, light direction, shading)
    * @returns Draw plan with back faces, side bands, front faces
    *
    * @throws Error if input polygons invalid (< 3 vertices)
    *
    * @note Assumes non-self-intersecting polygons. Results undefined for self-intersecting.
    * @note Light direction should be normalized. Non-normalized vectors will produce wrong shading.
    */
   export function buildExtrudeLite(
     instances: readonly ExtrudeLiteInput[],
     params: ExtrudeLiteParams
   ): ExtrudeLiteDrawPlan
   ```

3. **DESIGN.md** (in `src/render/canvas/`)
   - Algorithm overview with pseudocode
   - Coordinate space model
   - Known limitations and assumptions
   - Future enhancement ideas

**Success Criteria**:
- All public functions have JSDoc with @param, @returns, @throws, @note
- DESIGN.md explains algorithm and rationale
- No orphaned TODOs in code

---

### Phase 5.2: Future Work & Deferred Items

**Potential Enhancements** (Catalog in Roadmap):

1. **Scope Expansion**
   - Per-instance extrusion parameters
   - Support for arbitrary paths (not just rings)
   - Stroke extrusion (thickened edge bands)

2. **Performance Optimization**
   - Buffer pooling with frame-to-frame reuse
   - Quad batching by color (reduce draw calls)
   - SIMD-friendly layout

3. **Visual Enhancements**
   - Specular highlights
   - Soft shadows on sides
   - Ambient occlusion on edges

4. **Multi-Backend**
   - SVG rendering
   - WebGL 3D extrusion (true 3D, not pseudo-3D)

5. **User Controls**
   - UI for extrusion parameters
   - Presets (light from top, left, etc.)
   - Real-time preview

**Tracking**:
- Create GitHub issues for each deferred item
- Tag with "extrudelite-future" or similar
- Set priority and owner (TBD)

**Success Criteria**:
- Deferred work catalogued and prioritized
- No surprise scope creep
- Clear path from v2-now to future enhancements

---

## Critical Architectural Decisions (MUST ANSWER FIRST)

Before implementation proceeds, **these 5 questions must be answered**:

| # | Question | Options | Recommendation | Blocker |
|---|----------|---------|---------------|----|
| 1 | Pipeline insertion? | Canvas2D preprocessor, new DrawOp, style modifier | Start with preprocessor (MVP) | Architecture |
| 2 | User controls? | RenderInstances2D property, separate block, global setting | RenderInstances2D property | Design |
| 3 | Per-instance params? | Uniform (v1), per-instance (v2-later) | Uniform for v2-now | Scope |
| 4 | Projection mode? | Screen-space (v2-now), world-space (3D, later) | Screen-space | Correctness |
| 5 | Invalid params? | Graceful fallback, skip rendering, error crash | Graceful fallback | Robustness |

**Status**: Questions 1-5 have recommendations but need user confirmation before Phase 2 starts.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Shading algorithm incorrect | Medium | High | Phase 1.2 math validation, Phase 4 visual tests |
| Memory leaks (per-frame buffers) | Low | High | Phase 2.2 buffer management review, Phase 4 perf tests |
| Incompatible with projection system | Medium | High | Phase 1.1 camera system alignment |
| Self-intersecting polygon crash | Medium | Medium | Phase 2.1 input validation, Phase 4.1 edge case tests |
| Performance (>5ms per 1k polygons) | Low | Medium | Phase 4 baseline established, Phase 2.2 optimization |
| User confusion (where to enable?) | High | Low | Phase 3 + UI changes + docs |

**Mitigation Strategy**: Phase 1 decisions reduce most high-impact risks. Phase 4 validation confirms correctness.

---

## Success Criteria (Overall)

Project is COMPLETE when:

- ✓ All 5 architectural questions answered and documented
- ✓ Unit tests pass with 95%+ coverage
- ✓ Visual output matches expected appearance
- ✓ Performance baseline: <5ms per 1000 polygons
- ✓ Zero architectural violations
- ✓ All public APIs documented with JSDoc
- ✓ Deferred work catalogued in roadmap
- ✓ Code review passes
- ✓ No blocking CI failures

---

## Estimated Complexity & Timeline

| Phase | Tasks | Estimate | Depends On |
|-------|-------|----------|-----------|
| Phase 1 | Arch analysis + decisions | 4-6 hours | User input |
| Phase 2 | Core algorithm + helpers | 6-8 hours | Phase 1 decisions |
| Phase 3 | Canvas2D rendering | 3-4 hours | Phase 1, 2 |
| Phase 4 | Tests + validation | 4-6 hours | Phase 2, 3 |
| Phase 5 | Docs + future planning | 2-3 hours | Phase 4 |
| **Total** | | **19-27 hours** | |

**Critical Path**: Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 (sequential)

**Recommended Pacing**:
- Day 1: Phase 1 (decisions)
- Day 2: Phase 2 (implementation)
- Day 3: Phase 3 + 4 (integration + testing)
- Day 4: Phase 5 (polish)

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/render/canvas/ExtrudeLite.ts` | Modify | Implement core algorithm |
| `src/render/canvas/__tests__/ExtrudeLite.test.ts` | Create | Unit tests |
| `src/render/canvas/canvas2dDrawExtrudeLite.ts` | Modify | Canvas rendering |
| `src/render/canvas/__tests__/canvas2dDrawExtrudeLite.test.ts` | Create | Integration tests |
| `src/render/canvas/__tests__/fixtures/extrude-lite-fixtures.ts` | Create | Test fixtures |
| `src/render/canvas/ExtrudeLite-DESIGN.md` | Create | Design documentation |

---

## Next Steps

**Immediate Action**: Schedule decision meeting to answer the 5 architectural questions (Phase 1.1).

**After Decisions**: Proceed with Phase 1.2-3 (algorithmic design + test strategy).

**Readiness Gate**: Phase 1 complete = green light to start Phase 2 implementation.

