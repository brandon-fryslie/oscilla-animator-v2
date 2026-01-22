# Implementation Context: Per-Instance Shapes
Generated: 2026-01-22-031548
Plan: SPRINT-2026-01-22-031548-per-instance-shapes-PLAN.md
DOD: SPRINT-2026-01-22-031548-per-instance-shapes-DOD.md

## Overview

This document provides comprehensive context for implementing per-instance shape support (`Field<shape>`). An implementer with ONLY this document should be able to complete the work without additional research.

## Architectural Background

### Coordinate Space Model

Oscilla uses three coordinate spaces:

1. **Local Space (L)**: Where geometry lives
   - Origin at (0,0) is shape's logical center
   - Typical magnitude |L| ≈ O(1)
   - Examples: Unit circle (radius 1.0), unit pentagon vertices at radius 1.0
   - Independent of viewport or world coordinates

2. **World Space (W)**: Where instances are placed
   - Normalized coordinates [0, 1] × [0, 1]
   - Resolution-independent scene coordinates
   - Examples: Center (0.5, 0.5), top-left (0, 0), bottom-right (1, 1)

3. **Viewport Space (V)**: Backend render coordinates
   - Canvas: pixel coordinates (xPx, yPx)
   - SVG: viewBox coordinates
   - Mapping: `xPx = xW * canvasWidth`, `yPx = yW * canvasHeight`

### Transform Model

For each instance:
```
ctx.translate(position.x * width, position.y * height);  // World → Viewport
ctx.rotate(rotation);                                     // World space rotation
ctx.scale(size * scale2.x, size * scale2.y);            // World space scale
drawPath(localSpaceGeometry);                            // Local space geometry
```

This makes all shapes respond uniformly to position/size/rotation modulators.

### RenderAssembler Role

**Purpose**: Transform IR slot references into concrete render data.

**Current State (v1)**: Produces `RenderPassIR` with `ShapeDescriptor`
**Target State (v2)**: Produces `DrawPathInstancesOp` with resolved geometry/instances/style

**Key Responsibility**: Renderer is sink-only. NO shape interpretation in renderer.

### Uniform vs Per-Instance Shapes

**Uniform shapes** (`Signal<shape>`):
- One topology for all instances
- Parameterized (e.g., all ellipses with varying rx/ry)
- Current implementation: `{ k: 'sig', topologyId, paramSignals }`

**Per-instance shapes** (`Field<shape>`):
- Each instance can have different topology
- Examples: mix circles, squares, triangles in same render pass
- Target implementation: `{ k: 'slot', slot }` → Shape2D buffer

## Key Files and Modules

### Files to Modify

#### 1. `src/runtime/RenderAssembler.ts`
**Current**: Lines 142-175 `resolveShape()`, Lines 224-270 `resolveShapeFully()`
**Change**: Handle `{ k: 'slot' }` case, implement topology grouping, emit multiple ops

**Key Functions**:
- `resolveShape()`: Extract shape spec from StepRender
- `resolveShapeFully()`: Resolve topology and params
- `assembleDrawPathInstancesOp()`: Build DrawPathInstancesOp structure
- `assembleRenderFrame_v2()`: Collect all ops into frame

**Current Limitation** (line 228-233):
```typescript
// Per-particle shape buffer (Field<shape>) - not yet implemented
if (!isShapeDescriptor(shape)) {
  throw new Error(
    'Per-particle shapes (Field<shape>) are not yet implemented. ' +
    'Use a uniform shape signal (Signal<shape>) instead.'
  );
}
```

**Target**: Remove error, implement grouping logic.

#### 2. `src/render/future-types.ts`
**Current**: Type definitions for v2 rendering (lines 1-202)
**Change**: No type changes needed, all types already defined

**Key Types**:
- `DrawPathInstancesOp`: Operation structure (line 135-147)
- `PathGeometry`: Local-space control points + topology (line 73-88)
- `InstanceTransforms`: World-space placement (line 101-116)
- `PathStyle`: Explicit styling (line 46-61)

#### 3. `src/render/Canvas2DRenderer.ts`
**Current**: Expects one op per render step
**Change**: Loop over multiple ops (minimal change)

**Key Function**: `executeFrame()` or equivalent render loop

### Files to Reference (Read-Only)

#### 1. `src/compiler/ir/types.ts`
**Lines 464-479**: `StepRender` interface

**Key Fields**:
```typescript
export interface StepRender {
  readonly kind: 'render';
  readonly instanceId: string;
  readonly positionSlot: ValueSlot;
  readonly colorSlot: ValueSlot;
  readonly scale?: { readonly k: 'sig'; readonly id: SigExprId };
  readonly shape?:
    | { readonly k: 'sig'; readonly topologyId: TopologyId; readonly paramSignals: readonly SigExprId[] }
    | { readonly k: 'slot'; readonly slot: ValueSlot };  // ← This case is target
  readonly controlPoints?: { readonly k: 'slot'; readonly slot: ValueSlot };
}
```

**Note**: `shape.k === 'slot'` is the per-instance case.

#### 2. `.agent_planning/_future/9-renderer.md`
**Section 5**: Per-instance shapes design (lines 130-143)

**Key Insight**: Renderer should receive distinct pass kinds:
- `instances2d_uniformShape`: One shape for all instances (current)
- `instances2d_shapeField`: Shape buffer per instance (target)

#### 3. `.agent_planning/_future/3-local-space-spec-deeper.md`
**Section 4.2**: Shape2D packed layout (lines 195-220)

**Buffer Format**:
```typescript
const SHAPE2D_WORDS = 8;

enum Shape2DWord {
  TopologyId      = 0, // u32
  PointsFieldSlot = 1, // u32 (field slot id for control points)
  PointsCount     = 2, // u32
  StyleRef        = 3, // u32 (optional style table id or scalar slot)
  Flags           = 4, // u32 (closed, fillRule, etc.)
  Reserved5       = 5, // u32
  Reserved6       = 6, // u32
  Reserved7       = 7, // u32
}
```

**Buffer Layout**:
For N instances, buffer is `Uint32Array` of length `N * SHAPE2D_WORDS`:
```
[instance0: topologyId, pointsSlot, pointsCount, styleRef, flags, r5, r6, r7,
 instance1: topologyId, pointsSlot, pointsCount, styleRef, flags, r5, r6, r7,
 ...]
```

#### 4. `src/shapes/types.ts` and `src/shapes/registry.ts`
**Current**: Topology definitions and registry

**Key Functions**:
- `getTopology(topologyId: TopologyId): TopologyDef`
- `isPathTopology(topology: TopologyDef): topology is PathTopologyDef`

**Note**: TopologyId is currently `string`, spec recommends `number`. Casting needed.

## Implementation Algorithm

### Step 1: Shape Buffer Resolution

In `resolveShape()`, handle `{ k: 'slot' }` case:

```typescript
function resolveShape(
  shapeSpec: StepRender['shape'],
  signals: readonly SigExpr[],
  state: RuntimeState
): ShapeDescriptor | ArrayBufferView {
  if (shapeSpec === undefined) {
    throw new Error('RenderAssembler: shape is required.');
  }

  if (shapeSpec.k === 'slot') {
    // NEW: Per-instance shape buffer
    const shapeBuffer = state.values.objects.get(shapeSpec.slot) as ArrayBufferView;
    if (!shapeBuffer) {
      throw new Error(`RenderAssembler: Shape buffer not found in slot ${shapeSpec.slot}`);
    }

    // Validate buffer is Uint32Array
    if (!(shapeBuffer instanceof Uint32Array)) {
      throw new Error(
        `RenderAssembler: Shape buffer must be Uint32Array, got ${shapeBuffer.constructor.name}`
      );
    }

    return shapeBuffer;
  } else {
    // Existing: Uniform shape (Signal<shape>)
    const { topologyId, paramSignals } = shapeSpec;
    const params: Record<string, number> = {};

    for (let i = 0; i < paramSignals.length; i++) {
      const value = evaluateSignal(paramSignals[i], signals, state);
      params[`param${i}`] = value;
    }

    return {
      topologyId,
      params,
    };
  }
}
```

### Step 2: Topology Grouping

New function in `RenderAssembler.ts`:

```typescript
const SHAPE2D_WORDS = 8;

enum Shape2DWord {
  TopologyId      = 0,
  PointsFieldSlot = 1,
  PointsCount     = 2,
  StyleRef        = 3,
  Flags           = 4,
}

interface Shape2DRef {
  topologyId: number;
  pointsFieldSlot: number;
  pointsCount: number;
  styleRef: number;
  flags: number;
}

function readShape2DFromBuffer(buffer: Uint32Array, instanceIndex: number): Shape2DRef {
  const offset = instanceIndex * SHAPE2D_WORDS;
  return {
    topologyId: buffer[offset + Shape2DWord.TopologyId],
    pointsFieldSlot: buffer[offset + Shape2DWord.PointsFieldSlot],
    pointsCount: buffer[offset + Shape2DWord.PointsCount],
    styleRef: buffer[offset + Shape2DWord.StyleRef],
    flags: buffer[offset + Shape2DWord.Flags],
  };
}

interface TopologyGroup {
  topologyId: number;
  controlPointsSlot: number;
  pointsCount: number;
  flags: number;
  instanceIndices: number[];
}

function groupInstancesByTopology(
  shapeBuffer: Uint32Array,
  instanceCount: number
): Map<string, TopologyGroup> {
  // Validate buffer length
  const expectedLength = instanceCount * SHAPE2D_WORDS;
  if (shapeBuffer.length < expectedLength) {
    throw new Error(
      `RenderAssembler: Shape buffer length mismatch. Expected >=${expectedLength}, got ${shapeBuffer.length}`
    );
  }

  const groups = new Map<string, TopologyGroup>();

  for (let i = 0; i < instanceCount; i++) {
    const shapeRef = readShape2DFromBuffer(shapeBuffer, i);

    // Group key: topologyId + controlPointsSlot
    // Instances with same topology AND same control points buffer can batch
    const key = `${shapeRef.topologyId}:${shapeRef.pointsFieldSlot}`;

    if (!groups.has(key)) {
      groups.set(key, {
        topologyId: shapeRef.topologyId,
        controlPointsSlot: shapeRef.pointsFieldSlot,
        pointsCount: shapeRef.pointsCount,
        flags: shapeRef.flags,
        instanceIndices: [],
      });
    }

    groups.get(key)!.instanceIndices.push(i);
  }

  return groups;
}
```

**Complexity**: O(N) where N = instanceCount. Single pass, constant-time map operations.

### Step 3: Buffer Slicing

New function in `RenderAssembler.ts`:

```typescript
interface SlicedBuffers {
  position: Float32Array;
  color: Uint8ClampedArray;
}

function sliceInstanceBuffers(
  fullPosition: Float32Array,
  fullColor: Uint8ClampedArray,
  instanceIndices: number[]
): SlicedBuffers {
  const N = instanceIndices.length;

  // Allocate sliced buffers
  const position = new Float32Array(N * 2);  // vec2 per instance
  const color = new Uint8ClampedArray(N * 4); // RGBA per instance

  // Copy data for selected instances
  for (let i = 0; i < N; i++) {
    const srcIdx = instanceIndices[i];

    // Position (x, y)
    position[i * 2]     = fullPosition[srcIdx * 2];
    position[i * 2 + 1] = fullPosition[srcIdx * 2 + 1];

    // Color (R, G, B, A)
    color[i * 4]     = fullColor[srcIdx * 4];
    color[i * 4 + 1] = fullColor[srcIdx * 4 + 1];
    color[i * 4 + 2] = fullColor[srcIdx * 4 + 2];
    color[i * 4 + 3] = fullColor[srcIdx * 4 + 3];
  }

  return { position, color };
}
```

**Performance**: O(N) copy per group. For M groups with avg N/M instances each, total is still O(N).

### Step 4: Multi-Op Emission

Modify `assembleDrawPathInstancesOp()` to return array:

```typescript
export function assembleDrawPathInstancesOp(
  step: StepRender,
  context: AssemblerContext
): DrawPathInstancesOp[] {  // ← Changed return type
  const { signals, instances, state } = context;

  // ... existing validation (instance, count, position, color) ...

  const scale = resolveScale(step.scale, signals, state);
  const shape = resolveShape(step.shape, signals, state);

  // Check if per-instance shapes
  if (shape instanceof Uint32Array) {
    // Per-instance shapes: group by topology
    return assemblePerInstanceShapes(
      step,
      shape,
      positionBuffer,
      colorBuffer,
      scale,
      count,
      state
    );
  } else {
    // Uniform shape: existing path (single op)
    const controlPointsBuffer = resolveControlPoints(step.controlPoints, state);
    const resolvedShape = resolveShapeFully(shape, controlPointsBuffer);

    if (resolvedShape.mode !== 'path') {
      return []; // Not yet supported
    }

    if (!controlPointsBuffer || !(controlPointsBuffer instanceof Float32Array)) {
      throw new Error(
        'RenderAssembler: Path topology requires control points buffer (Float32Array)'
      );
    }

    const geometry = buildPathGeometry(resolvedShape, controlPointsBuffer);
    const instanceTransforms = buildInstanceTransforms(
      count,
      positionBuffer,
      scale,
      undefined, // rotation
      undefined  // scale2
    );
    const style = buildPathStyle(colorBuffer, 'nonzero');

    return [{
      kind: 'drawPathInstances',
      geometry,
      instances: instanceTransforms,
      style,
    }];
  }
}
```

New function for per-instance case:

```typescript
function assemblePerInstanceShapes(
  step: StepRender,
  shapeBuffer: Uint32Array,
  fullPosition: Float32Array,
  fullColor: Uint8ClampedArray,
  scale: number,
  count: number,
  state: RuntimeState
): DrawPathInstancesOp[] {
  // Group instances by topology
  const groups = groupInstancesByTopology(shapeBuffer, count);

  const ops: DrawPathInstancesOp[] = [];

  for (const [key, group] of groups) {
    // Skip empty groups
    if (group.instanceIndices.length === 0) {
      continue;
    }

    // Validate topology exists
    const topologyIdStr = String(group.topologyId); // Cast number → string
    const topology = getTopology(topologyIdStr as TopologyId);
    if (!topology) {
      throw new Error(
        `RenderAssembler: Topology ${group.topologyId} not found ` +
        `(referenced by instances: ${group.instanceIndices.join(', ')})`
      );
    }

    if (!isPathTopology(topology)) {
      console.warn(
        `RenderAssembler: Non-path topology ${group.topologyId} not yet supported ` +
        `(instances: ${group.instanceIndices.join(', ')})`
      );
      continue; // Skip non-path topologies
    }

    // Get control points buffer for this group
    const controlPointsBuffer = state.values.objects.get(
      group.controlPointsSlot as ValueSlot
    ) as Float32Array;

    if (!controlPointsBuffer || !(controlPointsBuffer instanceof Float32Array)) {
      throw new Error(
        `RenderAssembler: Control points buffer not found for topology ${group.topologyId} ` +
        `(slot ${group.controlPointsSlot}, instances: ${group.instanceIndices.join(', ')})`
      );
    }

    // Slice instance buffers for this group
    const { position, color } = sliceInstanceBuffers(
      fullPosition,
      fullColor,
      group.instanceIndices
    );

    // Build geometry
    const geometry: PathGeometry = {
      topologyId: group.topologyId,
      verbs: new Uint8Array(topology.verbs),
      points: controlPointsBuffer,
      pointsCount: group.pointsCount,
      flags: group.flags,
    };

    // Build instance transforms
    const instanceTransforms: InstanceTransforms = {
      count: group.instanceIndices.length,
      position,
      size: scale, // Uniform scale
      // rotation: undefined,  // Not yet wired
      // scale2: undefined,    // Not yet wired
    };

    // Build style
    const style: PathStyle = {
      fillColor: color,
      fillRule: 'nonzero',
    };

    ops.push({
      kind: 'drawPathInstances',
      geometry,
      instances: instanceTransforms,
      style,
    });
  }

  return ops;
}
```

### Step 5: Frame Assembly

Modify `assembleRenderFrame_v2()` to flatten ops:

```typescript
export function assembleRenderFrame_v2(
  renderSteps: readonly StepRender[],
  context: AssemblerContext
): RenderFrameIR_Future {
  const ops: DrawPathInstancesOp[] = [];

  for (const step of renderSteps) {
    const stepOps = assembleDrawPathInstancesOp(step, context);
    ops.push(...stepOps);  // ← Flatten array of ops
  }

  return {
    version: 2,
    ops,
  };
}
```

### Step 6: Renderer Integration

In `Canvas2DRenderer.ts`, ensure loop handles all ops:

```typescript
function executeFrame(frame: RenderFrameIR_Future) {
  for (const op of frame.ops) {
    if (op.kind === 'drawPathInstances') {
      renderPathInstances(op);
    }
    // ... future op types
  }
}
```

**Note**: Renderer likely already does this. Just verify loop is over `frame.ops`, not `frame.passes`.

## Testing Strategy

### Unit Tests

#### Test 1: Shape Buffer Reading
```typescript
test('readShape2DFromBuffer extracts correct fields', () => {
  const buffer = new Uint32Array([
    42, 7, 12, 0, 1,  0, 0, 0,  // instance 0
    99, 3,  8, 0, 0,  0, 0, 0,  // instance 1
  ]);

  const shape0 = readShape2DFromBuffer(buffer, 0);
  expect(shape0.topologyId).toBe(42);
  expect(shape0.pointsFieldSlot).toBe(7);
  expect(shape0.pointsCount).toBe(12);

  const shape1 = readShape2DFromBuffer(buffer, 1);
  expect(shape1.topologyId).toBe(99);
  expect(shape1.pointsFieldSlot).toBe(3);
});
```

#### Test 2: Topology Grouping
```typescript
test('groupInstancesByTopology groups correctly', () => {
  // 10 instances: 5 circles (topology 1), 3 squares (topology 2), 2 circles (topology 1)
  const buffer = new Uint32Array(10 * SHAPE2D_WORDS);
  // Fill buffer with alternating topologies...

  const groups = groupInstancesByTopology(buffer, 10);
  expect(groups.size).toBe(2);

  const circleGroup = groups.get('1:0');
  expect(circleGroup).toBeDefined();
  expect(circleGroup!.instanceIndices.length).toBe(7); // 5 + 2

  const squareGroup = groups.get('2:0');
  expect(squareGroup).toBeDefined();
  expect(squareGroup!.instanceIndices.length).toBe(3);
});
```

#### Test 3: Buffer Slicing
```typescript
test('sliceInstanceBuffers copies correct values', () => {
  const fullPosition = new Float32Array([
    0.0, 0.1,  // instance 0
    0.2, 0.3,  // instance 1
    0.4, 0.5,  // instance 2
    0.6, 0.7,  // instance 3
  ]);

  const fullColor = new Uint8ClampedArray([
    255, 0, 0, 255,  // instance 0: red
    0, 255, 0, 255,  // instance 1: green
    0, 0, 255, 255,  // instance 2: blue
    255, 255, 0, 255,// instance 3: yellow
  ]);

  const { position, color } = sliceInstanceBuffers(
    fullPosition,
    fullColor,
    [0, 2]  // Select instances 0 and 2
  );

  expect(position).toEqual(new Float32Array([0.0, 0.1, 0.4, 0.5]));
  expect(color).toEqual(new Uint8ClampedArray([
    255, 0, 0, 255,   // red
    0, 0, 255, 255,   // blue
  ]));
});
```

### Integration Tests

#### Test 4: End-to-End Render
```typescript
test('per-instance shapes render without errors', () => {
  // Create patch with mixed shapes
  const b = new GraphBuilder();

  // Create 3 circles, 2 squares
  const circleShape = b.addBlock('Ellipse', { rx: 0.05, ry: 0.05 });
  const squareShape = b.addBlock('Rect', { width: 0.1, height: 0.1 });

  // ... create Field<shape> with mixed topologies ...
  // ... compile, execute, render ...

  const frame = assembleRenderFrame_v2(renderSteps, context);

  // Expect 2 ops (one per topology)
  expect(frame.ops.length).toBe(2);

  // Verify no errors during render
  expect(() => renderer.executeFrame(frame)).not.toThrow();
});
```

#### Test 5: Performance Benchmark
```typescript
test('performance: 100 instances, 5 topologies < 33ms', () => {
  // ... setup 100 instances across 5 topologies ...

  const start = performance.now();
  const frame = assembleRenderFrame_v2(renderSteps, context);
  renderer.executeFrame(frame);
  const elapsed = performance.now() - start;

  expect(elapsed).toBeLessThan(33); // 30fps target
  expect(frame.ops.length).toBeLessThanOrEqual(5);
});
```

## Dependencies and Prerequisites

### BLOCKING
- **Bead oscilla-animator-v2-583**: RenderAssembler v2 MUST be complete
  - Status: in_progress (as of 2026-01-22)
  - Check: `bd show oscilla-animator-v2-583`
  - This sprint cannot start until that bead is closed

### RECOMMENDED (not blocking)
- **Bead oscilla-animator-v2-4h6**: Convert topology IDs to numeric
  - Status: open
  - Impact: Avoids string→number casting in assembler
  - Workaround: Cast in assembler (already present in code)

### REQUIRED FROM MATERIALIZER
- **Shape2D buffer production**: Materializer must produce packed Shape2D buffers
  - Check: Does materializer handle `FieldExprShapeRef`?
  - If not: Add mock data or implement materializer support first

## Risk Mitigation

### Risk: Shape2D Format Mismatch
**Mitigation**: Document canonical format FIRST, review with user before implementation.

### Risk: Performance Degradation
**Mitigation**: Profile with realistic scenarios, document performance characteristics, add warnings for extreme cases (>20 topologies).

### Risk: Buffer Memory Overhead
**Mitigation**: Acceptable for initial implementation, document as future optimization opportunity.

## Success Criteria

Implementation is complete when:
1. All acceptance criteria in DOD checked
2. Unit tests pass (coverage >80%)
3. Integration tests pass (compile → execute → render)
4. Performance targets met (see DOD)
5. Visual regression tests pass (no artifacts)
6. User demo successful (mixed topology instances render correctly)

## Related Beads and Future Work

**Dependencies**:
- oscilla-animator-v2-583: RenderAssembler v2 (blocking)
- oscilla-animator-v2-4h6: Numeric topology IDs (recommended)

**Dependents**:
- oscilla-animator-v2-02h: Stroke rendering
- oscilla-animator-v2-0uk: SVG renderer with defs/use

**Future Enhancements**:
- Per-instance size/rotation/scale2
- Grouping optimization (spatial sorting, style sorting)
- Buffer view optimization (avoid copying)
- Topology group caching

## Contact Points

For questions during implementation:
- **Shape2D format**: See `.agent_planning/_future/3-local-space-spec-deeper.md` section 4.2
- **RenderAssembler architecture**: See `src/runtime/RenderAssembler.ts` header comments
- **Coordinate spaces**: See `.agent_planning/_future/3-local-space-spec-deeper.md` section 1
- **Performance requirements**: Ask user (current targets in DOD are estimates)
