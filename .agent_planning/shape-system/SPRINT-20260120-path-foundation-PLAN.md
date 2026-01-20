# Sprint: path-foundation - Path Foundation

**Generated:** 2026-01-20
**Confidence:** HIGH (all research tasks verified 2026-01-20)
**Status:** READY FOR IMPLEMENTATION
**Depends On:** unified-shape-foundation (must complete first)

## Sprint Goal

Implement path support using the unified shape model: paths as TopologyDef with control points as Field<vec2> over DOMAIN_CONTROL. Enable procedural polygon creation with control point modulation (stretch, joint angles).

## User Requirements Captured

From user input:
- **Use case:** Both layout source AND renderable shape
- **Topology ops:** Compile-time only (changing point count = recompile)
- **SVG:** Procedural only for v1
- **Scope:** Moderate (polygon + PathField + control point modulation + Trim)

From earlier conversation:
- Must be able to **stretch paths** (non-uniform scale)
- Must be able to **change joint angles** (move control points)
- Both operations preserve topology (same point count)

## Core Design

### Path Topology Format

```typescript
interface PathTopologyDef extends TopologyDef {
  id: TopologyId;
  verbs: PathVerb[];           // [MOVE, LINE, LINE, LINE, CLOSE] for triangle
  pointsPerVerb: number[];     // [1, 1, 1, 1, 0] - how many control points each verb needs
  totalControlPoints: number;  // sum of pointsPerVerb = 4 for triangle
  closed: boolean;             // true for polygon, false for open path

  // Inherited from TopologyDef:
  params: ParamDef[];          // strokeWidth, fillColor, etc.
  render: (ctx, controlPoints, params) => void;
}

enum PathVerb {
  MOVE = 0,   // 1 point
  LINE = 1,   // 1 point
  CUBIC = 2,  // 3 points (control1, control2, end)
  QUAD = 3,   // 2 points (control, end)
  CLOSE = 4,  // 0 points
}
```

### Control Points as Field<vec2>

```typescript
// ProceduralPolygon block creates:
// 1. Instance over DOMAIN_CONTROL with N control points
// 2. Field<vec2> for control point positions
// 3. ShapeRef pointing to path topology

interface PathShapeRef extends ShapeRef {
  topologyId: TopologyId;        // 'polygon-5' for pentagon
  controlPointInstance: InstanceId;  // Instance over DOMAIN_CONTROL
  controlPositions: FieldExprId;     // Field<vec2> of control point positions
  paramSlots: SlotRef[];             // strokeWidth, etc.
}
```

### Stretch and Joint Angle Operations

These are **field operations**, not topology changes:

```typescript
// Stretch horizontally by 2x:
const stretched = fieldMap(controlPositions, (p) => vec2(p.x * 2, p.y));

// Change joint angle by moving a specific point:
// This happens through the instance system - each control point is independently modulatable
```

## Scope

**Deliverables:**
1. PathTopologyDef type extending TopologyDef
2. PathVerb enum
3. ProceduralPolygon block (creates N-sided polygon)
4. Control point instance creation over DOMAIN_CONTROL
5. Path rendering in Canvas2DRenderer
6. Control point modulation (via existing field ops)

**Not in scope:**
- SVG loading
- Bezier curves (only LINE segments for v1)
- Boolean operations
- Path operators (separate sprint)

## Work Items

### P0: Define Path Types

**Files:** `src/shapes/types.ts`

**Acceptance Criteria:**
- [ ] PathVerb enum defined (MOVE, LINE, CUBIC, QUAD, CLOSE)
- [ ] PathTopologyDef interface extending TopologyDef
- [ ] verbs[], pointsPerVerb[], totalControlPoints, closed fields
- [ ] Types exported and documented

**Technical Notes:**
```typescript
export enum PathVerb {
  MOVE = 0,
  LINE = 1,
  CUBIC = 2,
  QUAD = 3,
  CLOSE = 4,
}

export interface PathTopologyDef extends TopologyDef {
  verbs: readonly PathVerb[];
  pointsPerVerb: readonly number[];
  totalControlPoints: number;
  closed: boolean;
}
```

### P1: Extend DOMAIN_CONTROL

**Files:** `src/core/domain-registry.ts`

**Acceptance Criteria:**
- [ ] DOMAIN_CONTROL intrinsics defined (index, position)
- [ ] Instance creation works for control point domains
- [ ] Control point count tracked per instance

**Technical Notes:**
- DOMAIN_CONTROL already exists, just needs intrinsics
- 'position' intrinsic returns the control point's current position
- 'index' intrinsic returns 0, 1, 2, ... for each control point

### P2: ProceduralPolygon Block

**Files:** `src/blocks/path-blocks.ts` (new)

**Acceptance Criteria:**
- [ ] ProceduralPolygon block registered
- [ ] Inputs: sides (int, compile-time), radiusX (float), radiusY (float)
- [ ] Creates PathTopologyDef with N LINE verbs
- [ ] Creates instance over DOMAIN_CONTROL with N control points
- [ ] Outputs PathShapeRef with topology + control point field
- [ ] Control points computed as regular polygon vertices

**Technical Notes:**
```typescript
registerBlock({
  type: 'ProceduralPolygon',
  label: 'Polygon',
  category: 'shape',
  inputs: {
    sides: { type: signalType('int'), value: 5 },  // Compile-time constant
    radiusX: { type: signalType('float'), value: 0.1 },
    radiusY: { type: signalType('float'), value: 0.1 },
  },
  outputs: {
    shape: { type: signalType('shape') },
    controlPoints: { type: signalTypeField('vec2', 'control') },
  },
  lower: ({ ctx, config }) => {
    const sides = config.sides as number;

    // Create topology (compile-time)
    const topology = createPolygonTopology(sides);
    ctx.b.registerTopology(topology);

    // Create control point instance
    const controlInstance = ctx.b.createInstance(DOMAIN_CONTROL, sides);

    // Create control point positions field
    const controlPositions = ctx.b.fieldIntrinsic(controlInstance, 'position', vec2Type);

    // Initialize positions to regular polygon
    const initialPositions = computePolygonVertices(sides, radiusX, radiusY);
    // ... bind initial positions to field

    return {
      outputsById: {
        shape: { k: 'pathRef', topology, controlInstance, controlPositions },
        controlPoints: { k: 'field', id: controlPositions },
      },
    };
  },
});
```

### P3: Control Point Field Operations

**Files:** `src/blocks/field-operations-blocks.ts`

**Acceptance Criteria:**
- [ ] Existing FieldMap works with control point fields
- [ ] Can apply scale transform to control points (stretch)
- [ ] Can offset individual control points (joint angle change)
- [ ] Control point modifications flow through to rendering

**Technical Notes:**
- Most of this should "just work" with existing field infrastructure
- May need to verify DOMAIN_CONTROL fields work with FieldMap
- Stretch = `fieldMap(cp, (p) => vec2(p.x * scaleX, p.y * scaleY))`

### P4: Path Rendering

**Files:** `src/render/Canvas2DRenderer.ts`

**Acceptance Criteria:**
- [ ] Renderer handles PathTopologyDef
- [ ] Iterates verbs and draws corresponding Canvas commands
- [ ] LINE verb draws ctx.lineTo()
- [ ] MOVE verb draws ctx.moveTo()
- [ ] CLOSE verb draws ctx.closePath()
- [ ] Supports both stroke and fill
- [ ] Control point positions read from field buffer

**Technical Notes:**
```typescript
function renderPath(ctx: CanvasRenderingContext2D, topology: PathTopologyDef, controlPoints: Float32Array) {
  ctx.beginPath();

  let pointIndex = 0;
  for (let i = 0; i < topology.verbs.length; i++) {
    const verb = topology.verbs[i];
    const pointCount = topology.pointsPerVerb[i];

    switch (verb) {
      case PathVerb.MOVE: {
        const x = controlPoints[pointIndex * 2];
        const y = controlPoints[pointIndex * 2 + 1];
        ctx.moveTo(x, y);
        pointIndex += 1;
        break;
      }
      case PathVerb.LINE: {
        const x = controlPoints[pointIndex * 2];
        const y = controlPoints[pointIndex * 2 + 1];
        ctx.lineTo(x, y);
        pointIndex += 1;
        break;
      }
      case PathVerb.CLOSE:
        ctx.closePath();
        break;
      // CUBIC, QUAD deferred to path operators sprint
    }
  }

  ctx.fill();  // or stroke based on params
}
```

### P5: Schedule and Executor Integration

**Files:** `src/compiler/passes-v2/pass7-schedule.ts`, `src/runtime/ScheduleExecutor.ts`

**Acceptance Criteria:**
- [ ] Schedule tracks path topology + control point field
- [ ] Executor evaluates control point field each frame
- [ ] Control point buffer passed to renderer
- [ ] Per-particle paths work (multiple paths with different control points)

**Technical Notes:**
- Control points are Field<vec2>, evaluated like any other field
- Topology is compile-time constant, passed to renderer by reference
- May need new RenderPassIR fields for path data

## Dependencies

- **HARD:** unified-shape-foundation sprint must complete first
- **SOFT:** Field system must support DOMAIN_CONTROL (likely already does)

## Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Control point binding complexity | MEDIUM | Start with simplest case (polygon), validate architecture |
| Performance with many paths | LOW | Profile after basic implementation; paths are rare vs particles |
| DOMAIN_CONTROL not working | LOW | Domain system is tested; just need to wire it up |

## Research Tasks (COMPLETED - 2026-01-20)

All verified in EVALUATION-path-foundation-20260120-fresh.md:
- [x] Verify DOMAIN_CONTROL instance creation works ✅
- [x] Verify Field<vec2> can be created over DOMAIN_CONTROL ✅
- [x] Prototype renderPath() function standalone ✅ (pattern established)

## Test Plan

- [ ] Unit test: PathTopologyDef created correctly for N-gon
- [ ] Unit test: ProceduralPolygon outputs correct topology
- [ ] Unit test: Control point field has correct element count
- [ ] Integration test: Polygon compiles and renders
- [ ] Visual test: Pentagon renders as 5-sided shape
- [ ] Visual test: Stretch polygon horizontally changes aspect ratio
- [ ] Visual test: Move one control point changes shape

## Success Criteria

A user can:
1. Create a ProceduralPolygon(5) block
2. Connect it to a renderer
3. See a pentagon on screen
4. Apply a FieldMap to stretch it horizontally
5. See an elongated pentagon
6. Animate control point positions
7. See the shape deform smoothly
