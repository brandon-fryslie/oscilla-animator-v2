---
parent: ../INDEX.md
topic: renderer
order: 6
---

# Renderer

> The renderer is a sink, not an engine. All creative logic comes from the patch.

**Related Topics**: [05-runtime](./05-runtime.md), [02-block-system](./02-block-system.md)
**Key Terms**: [RenderInstances2D](../GLOSSARY.md#renderinstances2d), [RenderIR](../GLOSSARY.md#renderir)
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
  topologyId: number;             // Identifies the shape topology
  points: Float32Array;           // Local-space control points (vec2[])
  pointCount: number;             // Number of control points
  closed: boolean;                // Closed path?
}
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

## Target Formats

### Canvas 2D

Primary render target for v0:
- Standard HTML Canvas
- Path-based rendering
- Hardware acceleration where available

### WebGL (Future)

For high-performance rendering:
- Instanced rendering for large domains
- Custom shaders for effects
- Better batching characteristics

### Export Formats (Future)

- Video (frame sequence)
- GIF
- SVG (for vector export)

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

### Render Errors

```typescript
type RenderError =
  | { kind: 'invalid_geometry'; topologyId: number }
  | { kind: 'invalid_style'; passIndex: number }
  | { kind: 'buffer_overflow'; requested: number; available: number }
  | { kind: 'invalid_transform'; instanceIndex: number };
```

### Fallback Rendering

On error:
- Log error with attribution
- Render placeholder (pink square, error marker)
- Continue with other instances
- Surface in UI

---

## Asset Management

### Geometry Assets

Geometries are compile-time or load-time resources:

```typescript
interface GeometryRegistry {
  builtIn: Map<string, GeometryAsset>;  // circle, rect, etc.
  loaded: Map<string, GeometryAsset>;   // SVG, mesh files
  generated: Map<string, GeometryAsset>;  // Runtime-generated
}
```

### Asset Lifecycle

1. **Load**: Parse asset file (SVG, mesh)
2. **Register**: Add to registry with stable ID
3. **Reference**: Blocks reference by ID
4. **Cache**: GPU-side caching for WebGL

---

## See Also

- [05-runtime](./05-runtime.md) - How patches execute
- [02-block-system](./02-block-system.md) - RenderInstances2D block
- [16-coordinate-spaces](./16-coordinate-spaces.md) - Local/World/Viewport spaces
- [Invariant: I15](../INVARIANTS.md#i15-renderer-is-a-sink-not-an-engine)
- [Invariant: I17](../INVARIANTS.md#i17-planned-batching)
