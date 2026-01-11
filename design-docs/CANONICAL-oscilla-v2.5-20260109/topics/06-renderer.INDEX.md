# Renderer - Indexed Summary

**Tier**: T2 (Output Stage)
**Size**: 382 lines → ~95 lines (25% compression)

## Render Contract [L28-45]
**I15**: Renderer is sink, not engine

**Does**:
- Accept render commands
- Batch by material/style
- Sort by z/layer
- Cull offscreen
- Rasterize

**Does NOT**:
- Creative motion
- Layout calculations
- Color decisions
- Renderer-specific modes (wobble/spiral)

Prevents renderer from becoming second patch system [L44-45]

## Render IR [L49-107]
**I16**: Generic intermediate representation
```typescript
interface RenderIR {
  instances: RenderInstance[];
  geometries: GeometryAsset[];
  materials: MaterialAsset[];
  layers: LayerConfig[];
}

interface RenderInstance {
  id: InstanceId;
  geometry: GeometryRef;
  material: MaterialRef;
  transform: Transform2D;
  layer: LayerId;
  style: StyleOverrides;
}
```

**Geometry Assets** [L77-85]: circle, rect, path, mesh, text
**Material Assets** [L88-107]: FillSpec (solid/gradient/pattern), StrokeSpec, BlendMode, Effects

## RenderInstances2D Block [L111-133]
Primary sink block:
```typescript
inputs: {
  positions: FieldSlot<vec2>;
  colors: FieldSlot<color>;
  sizes: FieldSlot<float>;
  rotations?: FieldSlot<float>;
  geometry?: ScalarSlot<GeometryRef>;
  layer?: ScalarSlot<LayerId>;
}
```
**Cardinality requirement**: Input fields share same domain [L130-132]

## Batching [L136-165]
**I17**: Planned batching

**Batch Key** [L147-156]:
- Geometry, material, layer, blend mode

**Strategy** [L159-164]:
1. Sort by (layer, material, geometry, blend)
2. Group consecutive by BatchKey
3. One draw call per batch
4. Minimize state changes

## Temporal Stability [L168-202]
**I18**: No flicker on edits

**Guarantees** [L170-176]:
- Old program continues rendering
- Swap atomic (single frame)
- No blank frames

**Field buffer persistence** [L178-189]: Compatible buffers reuse (same domain/layout)
**Crossfade (optional)** [L191-201]: Smooth transitions on major changes

## Layer System [L205-225]
**Ordering** [L207-217]:
```typescript
interface LayerConfig {
  id: LayerId;
  order: number;
  blend: BlendMode;
  clip?: ClipRegion;
}
```

**Priorities** [L220-224]:
1. Lower order renders first
2. Higher order renders last
3. Within layer: instance order from domain

## Culling [L228-246]
**View frustum culling** [L230-238]: Offscreen instances not rendered
**Performance**: Happens before batching, culled don't count toward batch

## Target Formats [L249-270]
- **Canvas 2D** (MVP): Standard HTML Canvas, path-based
- **WebGL** (Future): Instanced rendering, custom shaders
- **Export** (Future): Video, GIF, SVG

## Render Pipeline [L273-303]
**Flow**:
1. Collect RenderIR from sinks
2. Sort by layer
3. Group into batches
4. Cull offscreen
5. Set viewport
6. For each layer:
   - Set blend mode
   - For each batch:
     - Set material
     - Draw instances
7. Present

**Timing budget** [L298-303]:
- Patch eval: 3-5ms
- Render gen: 1-2ms
- GPU draw: 2-3ms
- **Total**: <10ms (100+ fps)

## Debugging [L307-327]
**Diagnostics**: Instance count, batch count, draw calls, culled, frame/GPU time
**Visual modes**: Bounds, batch coloring, overdraw, wireframe

## Error Handling [L331-350]
**Errors**: invalid_geometry, missing_material, buffer_overflow, invalid_transform
**Fallback**: Log + placeholder (pink square) + continue + surface

## Asset Management [L353-373]
**Geometry Registry** [L360-364]: Built-in, loaded, runtime-generated
**Asset Lifecycle** [L367-372]:
1. Load (parse)
2. Register (add to registry)
3. Reference (by ID)
4. Cache (GPU-side for WebGL)

## Related
- [05-runtime](./05-runtime.md) - Execution
- [02-block-system](./02-block-system.md) - RenderInstances2D
- [Invariants](../INVARIANTS.md) - I15, I16, I17, I18
