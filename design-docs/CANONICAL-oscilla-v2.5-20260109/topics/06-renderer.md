---
parent: ../INDEX.md
topic: renderer
order: 6
---

# Renderer

> The renderer is a sink, not an engine. All creative logic comes from the patch.

**Related Topics**: [05-runtime](./05-runtime.md), [02-block-system](./02-block-system.md), [16-coordinate-spaces](./16-coordinate-spaces.md)
**Key Terms**: [RenderInstances2D](../GLOSSARY.md#renderinstances2d), [RenderFrameIR](../GLOSSARY.md#renderframeir), [RenderBackend](../GLOSSARY.md#renderbackend), [PathTopologyDef](../GLOSSARY.md#pathtopologydef)
**Relevant Invariants**: [I15](../INVARIANTS.md#i15-renderer-is-a-sink-not-an-engine), [I16](../INVARIANTS.md#i16-real-render-ir), [I17](../INVARIANTS.md#i17-planned-batching), [I18](../INVARIANTS.md#i18-temporal-stability-in-rendering)

---

## Overview

The renderer is the **output stage** of Oscilla. It receives render commands from the patch and produces visual output. Key principles:

- **Sink, not engine** (Invariant I15)
- **No creative logic** - All motion/layout/color from patch
- **Planned batching** (Invariant I17)
- **Temporal stability** (Invariant I18)

---

## Render Contract (Invariant I15)

### What the Renderer Does

- Accepts render commands/instances
- Batches by material/style
- Sorts by z/layer
- Culls offscreen content
- Rasterizes to target

### What the Renderer Does NOT Do

- **No "creative" motion** - Comes from patch
- **No layout calculations** - Comes from patch
- **No color decisions** - Comes from patch
- **No "wobble"/"spiral mode"** - Would become second patch system

If the renderer grows bespoke inputs like "radius," "wobble," "spiral mode," it turns into a second patch system.

---

## Render IR (Invariant I16)

### Draw-Op-Centric Model

The patch produces a `RenderFrameIR` — a sequence of draw operations, each combining a geometry template with instance transforms and style:

```typescript
interface RenderFrameIR {
  passes: RenderPassIR[];
}

type RenderPassIR =
  | { kind: 'drawPathInstances'; op: DrawPathInstancesOp };
```

### DrawPathInstancesOp

The primary render operation. Combines local-space geometry with world-space instance transforms:

```typescript
interface DrawPathInstancesOp {
  geometry: PathGeometryTemplate;  // Local-space points + topology
  instances: PathInstanceSet;       // World-space transforms per instance
  style: PathStyle;                 // Fill/stroke/opacity
}
```

### PathGeometryTemplate

Defines geometry in **local space** (see [Topic 16: Coordinate Spaces](./16-coordinate-spaces.md)):

```typescript
interface PathGeometryTemplate {
  topologyId: number;             // References PathTopologyDef by numeric ID
  points: Float32Array;           // Local-space control points (vec2[])
  pointCount: number;             // Number of control points
}
```

The `closed` property derives from the topology verbs (last verb = close).

### PathTopologyDef

Immutable structural definition of a path shape — what verbs it uses and how many points each verb consumes. Registered at compile/init time and referenced by numeric ID.

```typescript
interface PathTopologyDef {
  verbs: Uint8Array;             // Sequence of path verbs (moveTo, lineTo, quadTo, cubicTo, close)
  pointsPerVerb: Uint8Array;    // Number of control points each verb consumes
}
```

**Properties**:
- Immutable once registered — control points change per-frame, topology does not
- Registered in a topology registry with O(1) numeric array lookup
- The topology defines the shape structure; PathGeometryTemplate provides concrete points

**Verb constants** (T3 implementation detail):
```typescript
const VERB_MOVE = 0;    // 1 point
const VERB_LINE = 1;    // 1 point
const VERB_QUAD = 2;    // 2 points (control + end)
const VERB_CUBIC = 3;   // 3 points (2 controls + end)
const VERB_CLOSE = 4;   // 0 points
```

### PathInstanceSet

Per-instance world-space transforms. Parallel arrays (SoA layout) for efficient batching:

```typescript
interface PathInstanceSet {
  count: number;                    // Number of instances
  positionsWorld: Float32Array;     // vec2[] — world-space positions [0..1]
  rotations: Float32Array;          // float[] — rotation per instance (radians)
  scales: Float32Array;             // float[] — isotropic scale per instance
  scales2?: Float32Array;           // vec2[] — optional anisotropic scale
}
```

### PathStyle

Style specification for all instances sharing a geometry template:

```typescript
interface PathStyle {
  fill: FillSpec;
  stroke: StrokeSpec;
  opacity: number;
  blend: BlendMode;
  layer: LayerId;
}

type FillSpec =
  | { kind: 'none' }
  | { kind: 'solid'; color: Color }
  | { kind: 'gradient'; stops: GradientStop[] };

type StrokeSpec =
  | { kind: 'none' }
  | { kind: 'solid'; color: Color; width: number };
```

### Per-Instance Shapes (T3, Future)

When `Field<shape2d>` is implemented, a second pass kind will be added:

```typescript
type RenderPassIR =
  | { kind: 'drawPathInstances'; op: DrawPathInstancesOp }       // Uniform shape
  | { kind: 'drawPathInstancesField'; op: DrawPathFieldOp };     // Per-instance shapes (future)
```

This enables each instance to reference its own geometry template. Deferred until Field<shape2d> is implemented.

### Why Draw-Op-Centric?

The draw-op model (vs the previous instance-centric model) provides:

- **Natural batching**: Instances sharing geometry + style are already grouped in one op
- **Local-space geometry**: Explicit separation of shape definition from placement
- **SoA transforms**: Parallel arrays enable efficient iteration
- **Aligns with SVG**: Maps directly to `<defs>/<use>` pattern
- **Aligns with coordinate spaces**: Geometry in local space, transforms in world space

---

## RenderInstances2D Block

The primary render sink block:

```typescript
interface RenderInstances2DBlock {
  kind: 'RenderInstances2D';
  inputs: {
    positions: FieldSlot<vec2>;     // Per-instance position
    colors: FieldSlot<color>;       // Per-instance color
    sizes: FieldSlot<float>;        // Per-instance size
    rotations?: FieldSlot<float>;   // Per-instance rotation
    geometry?: ScalarSlot<GeometryRef>;  // Shared geometry
    layer?: ScalarSlot<LayerId>;    // Shared layer
  };
}
```

### Cardinality Requirements

- Input fields must share the same domain
- Output is N render instances where N = domain count

---

## Batching (Invariant I17)

### Why Batching Matters

Canvas/WebGL performance lives and dies by:
- Minimizing state changes
- Minimizing path building
- Minimizing draw calls
- Grouping by geometry+style

### Natural Batching in Draw-Op Model

Each `DrawPathInstancesOp` is inherently a batch — all instances sharing the same geometry template and style are already grouped. The renderer's job is to:

1. Sort passes by (layer, blend mode)
2. Execute each pass as a single draw operation
3. Minimize state changes between passes

### Batch Efficiency

The draw-op model eliminates the need for runtime batch key computation:

```
Traditional: N instances → compute batch keys → group → draw K batches
Draw-op:     K ops (pre-grouped) → sort → draw K ops
```

The compilation/materialization phase handles grouping before the renderer sees it.

---

## Temporal Stability (Invariant I18)

### No Flicker on Edits

When patches edit live:

1. **Old program continues** rendering until new is ready
2. **Swap is atomic** - Single frame transition
3. **No blank frames** during compile/swap

### Field Buffer Persistence

If compatible, field buffers can persist across hot-swap:

```typescript
interface BufferPersistence {
  oldSlot: FieldSlot;
  newSlot: FieldSlot;
  compatible: boolean;  // Same domain, same layout
  action: 'reuse' | 'copy' | 'recreate';
}
```

### Crossfade (Optional)

For smooth transitions on major changes:

```typescript
interface CrossfadeConfig {
  enabled: boolean;
  duration: number;  // ms
  easing: EasingFunction;
}
```

---

## Layer System

### Layer Ordering

Layers provide deterministic z-ordering:

```typescript
interface LayerConfig {
  id: LayerId;
  order: number;       // Sort key
  blend: BlendMode;    // Layer-level blend
  clip?: ClipRegion;   // Optional clipping
}
```

### Layer Priorities

1. Lower `order` renders first (background)
2. Higher `order` renders last (foreground)
3. Within layer, instance order from domain

---

## Culling

### View Frustum Culling

Instances outside the view are not rendered:

```typescript
function cullInstance(instance: RenderInstance, viewport: Viewport): boolean {
  const bounds = getInstanceBounds(instance);
  return !intersects(bounds, viewport);
}
```

### Performance Impact

- Culling happens before batching
- Culled instances don't count toward batch
- Early out for fully offscreen domains

---

## Backend Interface

### RenderBackend Contract

Each render target implements a generic backend interface. The backend is a pure consumer of RenderFrameIR — it performs rasterization, not interpretation.

```typescript
interface RenderBackend<TTarget> {
  beginFrame(target: TTarget, frameInfo: FrameInfo): void;
  executePass(pass: RenderPassIR): void;
  endFrame(): void;
}
```

**Non-negotiable rule**: Backends must not force changes to the meaning of RenderIR. If a backend can't draw something directly, the adaptation is either:
- A deterministic, cache-keyed lowering step (e.g., path → mesh for WebGL) in a backend-specific prepass
- A capability negotiation that causes compilation to choose different ops

But backend needs never leak into "what a shape is" in the patch.

### Canvas2D Backend

Primary render target (v0):
- Uses topology verbs + points to build a Path2D each instance
- Fills/strokes per instance (or per batch if style uniform)
- Reference implementation — simple and correct

### SVG Backend (T3 Implementation Notes)

SVG-specific strategies:
- **Geometry caching**: Convert topology+points to `d` string once per geometry key, reuse across instances
- **`<defs>/<use>` pattern**: Shared geometry in `<defs>`, instances as `<use>` with per-instance transforms/styles
- **DOM pooling**: Maintain stable element identity across frames; update attributes, don't recreate nodes
- **Cache key**: `topologyId + ':' + pointsFieldId + ':' + fieldStamp`

For efficient SVG instancing, **local-space geometry is required** — geometry templates produce a single `d` string reused by all instances with per-instance `transform` attributes.

### WebGL/WebGPU Backend (Future, T3)

For path rendering on GPU:
- Tessellate paths to triangle meshes (cache by topology+points key)
- Use instanced rendering for transforms
- Backend-local lowering, not IR-level

### Capability Negotiation (T3, Future)

```typescript
type BackendCaps = {
  supportsPaths: boolean;
  supportsInstancedPaths: boolean;
  supportsMeshes: boolean;
  supportsGradients: boolean;
};
```

Strategy: Always emit highest-level IR (paths); let backend lower if needed. Best for correctness and simplicity.

---

## Render Pipeline

### Frame Render Flow

```
1. Collect RenderFrameIR from all sinks
         ↓
2. Sort passes by (layer, blend mode)
         ↓
3. Cull offscreen passes
         ↓
4. Set up render state (viewport, clear)
         ↓
5. For each pass:
   - Map world→viewport transforms (see Topic 16)
   - Build path from local-space geometry template
   - Set style state (fill, stroke, blend)
   - Draw all instances with mapped transforms
         ↓
6. Present to screen
```

### World→Viewport Mapping

The renderer performs the final coordinate space transform (see [Topic 16](./16-coordinate-spaces.md)):

```
positionVP = positionW × (viewportWidth, viewportHeight)
scalePx = scale × min(viewportWidth, viewportHeight)
```

This is the ONLY place world→viewport conversion happens. Patch logic works entirely in world space.

### Pipeline Timing

Target frame budget allocation:
- Patch evaluation: 3-5ms
- Render command generation: 1-2ms
- GPU draw: 2-3ms
- **Total**: <10ms (100+ fps)

---

## Debugging Render

### Render Diagnostics

```typescript
interface RenderDiagnostics {
  instanceCount: number;
  batchCount: number;
  drawCalls: number;
  culledInstances: number;
  frameTime: number;  // ms
  gpuTime: number;    // ms if available
}
```

### Visual Debug Modes

- **Bounding boxes**: Show instance bounds
- **Batch coloring**: Color by batch membership
- **Overdraw**: Visualize pixel overdraw
- **Wireframe**: Geometry outlines only

---

## Error Handling

### Pass-Level Prevalidation

Validate once per pass, then loop instances with no checks:

1. Topology exists (topologyId is valid in registry)
2. Points buffer exists and is non-null
3. pointsCount matches expected for topology (sum of pointsPerVerb)
4. Instance arrays are correct length (count × stride)

If validation fails: throw/diagnose before the hot loop. This is both faster and easier to debug than per-instance checks.

### Render Errors

```typescript
type RenderError =
  | { kind: 'invalid_geometry'; topologyId: number }
  | { kind: 'invalid_style'; passIndex: number }
  | { kind: 'buffer_overflow'; requested: number; available: number }
  | { kind: 'invalid_transform'; instanceIndex: number }
  | { kind: 'topology_not_found'; topologyId: number }
  | { kind: 'points_count_mismatch'; expected: number; actual: number };
```

### Fallback Rendering

On error:
- Log error with attribution
- Render placeholder (pink square, error marker)
- Continue with other passes
- Surface in UI

---

## Topology Registry

### Numeric ID Lookup

Topologies are registered at compile/init time and referenced by numeric ID for O(1) array lookup:

```typescript
// Topology registry: array indexed by topologyId
const topologies: PathTopologyDef[] = [];

function getTopology(id: number): PathTopologyDef {
  return topologies[id];  // O(1), no hash maps, no string lookups
}
```

### Registry Lifecycle

1. **Register**: At compile/init time, add PathTopologyDef and receive numeric ID
2. **Reference**: PathGeometryTemplate references by numeric `topologyId`
3. **Lookup**: Renderer uses array indexing (not string maps)
4. **Immutable**: Topology definitions never change after registration

### Built-in Topologies

Standard topologies are pre-registered:
- Circle (N-gon approximation)
- Rectangle (4-vertex closed path)
- Regular polygon (N vertices on unit circle)
- Line segment

Custom topologies are registered at compile time from user-defined paths.

---

## See Also

- [05-runtime](./05-runtime.md) - How patches execute
- [02-block-system](./02-block-system.md) - RenderInstances2D block
- [16-coordinate-spaces](./16-coordinate-spaces.md) - Local/World/Viewport spaces
- [Invariant: I15](../INVARIANTS.md#i15-renderer-is-a-sink-not-an-engine)
- [Invariant: I17](../INVARIANTS.md#i17-planned-batching)
