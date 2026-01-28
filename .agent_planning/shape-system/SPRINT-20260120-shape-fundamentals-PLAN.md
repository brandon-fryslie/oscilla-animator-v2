# Sprint: shape-fundamentals - Shape System Fundamentals

**Generated:** 2026-01-20
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Implement proper Ellipse and Rect shapes with multi-channel parameter passing (shapeType + param1 + param2) through the full pipeline to renderer.

## Scope

**Deliverables:**
1. Shape encoding as 3 channels (type, param1, param2) flowing through pipeline
2. Ellipse block outputs proper shape descriptor (type=0, rx, ry)
3. Rect block outputs proper shape descriptor (type=1, width, height)
4. Renderer draws ellipses and rectangles using actual parameters

## Work Items

### P0: Define Shape Representation

**Files:** `src/core/canonical-types.ts`, `src/compiler/ir/types.ts`

**Acceptance Criteria:**
- [ ] Shape type documented: 3-channel representation (shapeType: int, param1: float, param2: float)
- [ ] ShapeType enum defined: ELLIPSE=0, RECT=1, PATH=2 (reserved)
- [ ] Shape maps to Canvas API: ellipse(rx, ry), rect(width, height)

**Technical Notes:**
- shapeType: 0=ellipse, 1=rect, 2=path (future)
- param1/param2 meaning depends on shapeType
- Circle = ellipse with param1=param2, Square = rect with param1=param2

### P1: Update Shape Block Lowering

**Files:** `src/blocks/primitive-blocks.ts`

**Acceptance Criteria:**
- [ ] Ellipse.lower() outputs 3 signals: shapeType=0, param1=rx, param2=ry
- [ ] Rect.lower() outputs 3 signals: shapeType=0, param1=width, param2=height
- [ ] Shape output port produces all 3 channels (not just a single float)
- [ ] Default values work correctly (rx=ry=0.02 for Ellipse, width=0.04/height=0.02 for Rect)

**Technical Notes:**
- May need to change output from single 'shape' port to 3 ports, OR
- Create a composite output mechanism, OR
- Bundle into vec3 (shapeType, param1, param2)

### P2: Update Render IR and Schedule

**Files:** `src/compiler/passes-v2/pass7-schedule.ts`, `src/runtime/ScheduleExecutor.ts`

**Acceptance Criteria:**
- [ ] RenderStepIR includes shapeType, shapeParam1, shapeParam2 (or equivalent)
- [ ] Schedule executor passes all 3 shape channels to render pass
- [ ] Both uniform (single shape) and per-particle (Field<shape>) modes work

**Technical Notes:**
- Current render step has `shape?: SignalExprId | FieldExprId`
- Need to expand to 3 channels or use structured representation
- Maintain backward compatibility where possible

### P3: Update Canvas Renderer

**Files:** `src/render/Canvas2DRenderer.ts`

**Acceptance Criteria:**
- [ ] Renderer reads shapeType to determine drawing method
- [ ] Ellipse rendered with `ctx.ellipse(x, y, param1, param2, 0, 0, 2*PI)`
- [ ] Rect rendered with `ctx.fillRect(x - param1/2, y - param2/2, param1, param2)`
- [ ] Per-particle shape variation works (different rx/ry per particle)
- [ ] Hardcoded shape switch replaced with param-driven rendering

**Technical Notes:**
- Remove hardcoded 0=circle, 1=square, 2=triangle
- Use actual param1/param2 values from shape channels
- Rotation support can be deferred (always 0 for now)

### P4: Update RenderInstances2D Block

**Files:** `src/blocks/render-blocks.ts`

**Acceptance Criteria:**
- [ ] RenderInstances2D accepts shape as Signal<shape> or Field<shape>
- [ ] Shape input wired to 3-channel representation
- [ ] Remove old `canonicalType('int')` shape input
- [ ] Size input becomes optional (shape params provide dimensions)

**Technical Notes:**
- Decision: Keep separate size input for uniform scaling, OR derive from shape params
- Consider: size as multiplier on shape params

## Dependencies

- None (foundational work)

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking existing patches | Update demo patches in main.ts simultaneously |
| Performance regression from 3 channels vs 1 | Profile; shape data is small relative to position/color |
| Type system changes ripple widely | Careful incremental changes; run typecheck frequently |

## Test Plan

- [ ] Unit test: Ellipse block outputs correct 3 channels
- [ ] Unit test: Rect block outputs correct 3 channels
- [ ] Integration test: steel-thread compiles with Ellipse
- [ ] Visual test: Ellipses render with correct aspect ratio (rx≠ry)
- [ ] Visual test: Rectangles render with correct dimensions (width≠height)
