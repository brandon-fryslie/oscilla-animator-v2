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

### Generic Render Intermediate

The patch produces a render IR, not direct draw calls:

```typescript
interface RenderIR {
  instances: RenderInstance[];
  geometries: GeometryAsset[];
  materials: MaterialAsset[];
  layers: LayerConfig[];
}
```

### Render Instance

```typescript
interface RenderInstance {
  id: InstanceId;
  geometry: GeometryRef;      // Reference to geometry asset
  material: MaterialRef;       // Reference to material
  transform: Transform2D;      // Position, rotation, scale
  layer: LayerId;              // Z-ordering
  style: StyleOverrides;       // Per-instance overrides
}
```

### Geometry Assets

```typescript
type GeometryAsset =
  | { kind: 'circle'; radius: number }
  | { kind: 'rect'; width: number; height: number }
  | { kind: 'path'; data: string }  // SVG path data
  | { kind: 'mesh'; vertices: Float32Array; indices: Uint16Array }
  | { kind: 'text'; content: string; font: FontRef };
```

### Material Assets

```typescript
interface MaterialAsset {
  id: MaterialId;
  fill: FillSpec;
  stroke: StrokeSpec;
  blend: BlendMode;
  effects: Effect[];
}

type FillSpec =
  | { kind: 'solid'; color: Color }
  | { kind: 'gradient'; stops: GradientStop[] }
  | { kind: 'pattern'; patternId: PatternId };

type StrokeSpec =
  | { kind: 'none' }
  | { kind: 'solid'; color: Color; width: number };
```

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
- Grouping by material/style

### Batch Keys

Render output includes enough info to batch deterministically:

```typescript
interface BatchKey {
  geometry: GeometryRef;   // Same geometry
  material: MaterialRef;   // Same material
  layer: LayerId;          // Same z-layer
  blend: BlendMode;        // Same blend mode
}
```

### Batching Strategy

1. Sort instances by (layer, material, geometry, blend)
2. Group consecutive instances with same BatchKey
3. Emit one draw call per batch
4. Minimize state changes between batches

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
1. Collect RenderIR from all sinks
         ↓
2. Sort instances by layer
         ↓
3. Group into batches by BatchKey
         ↓
4. Cull offscreen batches
         ↓
5. Set up render state (viewport, clear)
         ↓
6. For each layer:
   - Set layer blend mode
   - For each batch:
     - Set material state
     - Draw instances
         ↓
7. Present to screen
```

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
  | { kind: 'invalid_geometry'; geometryId: GeometryRef }
  | { kind: 'missing_material'; materialId: MaterialRef }
  | { kind: 'buffer_overflow'; requested: number; available: number }
  | { kind: 'invalid_transform'; transform: Transform2D };
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
- [Invariant: I15](../INVARIANTS.md#i15-renderer-is-a-sink-not-an-engine)
- [Invariant: I17](../INVARIANTS.md#i17-planned-batching)
