# Unified Shape Model Design

**Goal:** Design ONE model that works for Ellipse, Rect, AND Path - not three separate systems.

## Core Insight: Topology + Fields

From the synth-feel proposal:

> A path as (A) stable topology + (B) continuously-modulatable fields

This applies to ALL shapes:

| Shape | Topology (Static) | Fields (Dynamic) |
|-------|-------------------|------------------|
| Ellipse | "ellipse" (verb) | rx, ry, rotation, center |
| Rect | "rect" (verb) | width, height, rotation, center, cornerRadius |
| Path | verbs[] + segment structure | control points[], stroke width, trim, dash |

**Key realization:** Ellipse and Rect are just paths with trivial topology (single verb, fixed parameter count).

## Unified Representation

### Shape = TopologyRef + FieldSlots

```typescript
interface ShapeRef {
  topologyId: TopologyId;      // What kind of shape (compile-time)
  paramSlots: SlotRef[];       // Where the dynamic params live (runtime)
}
```

### Predefined Topologies

```typescript
// Built-in topologies (no asset needed)
TOPOLOGY_ELLIPSE = {
  id: 'ellipse',
  params: ['rx', 'ry', 'rotation'],  // Fixed param list
  render: (ctx, params) => ctx.ellipse(0, 0, params.rx, params.ry, params.rotation, 0, 2*PI)
}

TOPOLOGY_RECT = {
  id: 'rect',
  params: ['width', 'height', 'rotation', 'cornerRadius'],
  render: (ctx, params) => {
    if (params.cornerRadius > 0) ctx.roundRect(...);
    else ctx.fillRect(...);
  }
}

// User-defined topologies (asset)
TOPOLOGY_CUSTOM_PATH = {
  id: 'path-abc123',
  verbs: [MOVE, LINE, CUBIC, CUBIC, CLOSE],
  pointsPerVerb: [1, 1, 3, 3, 0],  // How many control points each verb needs
  params: ['points', 'strokeWidth'],  // 'points' is Field<vec2>
  render: (ctx, params) => { /* replay verbs with params.points */ }
}
```

### How This Unifies Everything

**Ellipse block:**
- Topology: `TOPOLOGY_ELLIPSE` (built-in, immutable)
- Param slots: rx, ry, rotation (can be signals or fields)
- Output: `ShapeRef { topologyId: 'ellipse', paramSlots: [rxSlot, rySlot, rotSlot] }`

**Rect block:**
- Topology: `TOPOLOGY_RECT` (built-in, immutable)
- Param slots: width, height, rotation, cornerRadius
- Output: `ShapeRef { topologyId: 'rect', paramSlots: [...] }`

**Path block:**
- Topology: User-defined or loaded from asset
- Param slots: points (Field<vec2> for control points), strokeWidth, etc.
- Output: `ShapeRef { topologyId: 'path-xyz', paramSlots: [...] }`

## Renderer Perspective

Renderer receives:
```typescript
interface DrawShape {
  position: vec2;              // Where to draw
  topologyId: TopologyId;      // What to draw
  params: ArrayBufferView[];   // Shape params (may be per-particle)
}
```

Renderer logic:
```typescript
function drawShape(ctx, shape: DrawShape) {
  const topology = getTopology(shape.topologyId);

  ctx.save();
  ctx.translate(shape.position.x, shape.position.y);

  // Topology knows how to render itself given params
  topology.render(ctx, shape.params);

  ctx.restore();
}
```

## Instance System Integration

**For scalar shapes (Ellipse, Rect):**
- Shape params are Signal<float> (same for all instances)
- Position comes from layout (Field<vec2>)
- Color from color pipeline (Field<color>)

**For path shapes:**
- Control points are Field<vec2> bound to DOMAIN_CONTROL
- Per-path params (strokeWidth) can be Signal or Field
- Instancing a path = placing same topology at multiple positions

**Instancing ALONG a path:**
- Path provides position samples (Field<vec2>)
- Other shapes placed at those positions
- This is a LAYOUT, not a shape modification

## Key Decisions

### 1. Topology is compile-time, params are runtime

- Topology (what verbs, how many control points) doesn't change during playback
- Params (rx, ry, control point positions) change every frame
- Changing topology = graph edit, triggers recompile

### 2. Built-in vs custom topologies

- Ellipse, Rect: Built-in, no asset needed
- Polygon(n): Procedural, n is compile-time constant
- SVG Path: Asset, loaded at compile time
- All use same ShapeRef mechanism

### 3. Param slots are typed

```typescript
interface TopologyDef {
  id: TopologyId;
  params: ParamDef[];  // name + type (float, vec2, Field<vec2>)
  render: RenderFn;
}

interface ParamDef {
  name: string;
  type: 'float' | 'vec2' | 'Field<float>' | 'Field<vec2>';
  default?: any;
}
```

### 4. Shape signal carries reference, not data

The `Signal<shape>` or `Field<shape>` doesn't carry the actual geometry.
It carries `ShapeRef` - a handle to topology + slot references.

This keeps the signal graph clean and avoids giant blobs.

## What Changes from Current Design

| Aspect | Current (Broken) | Unified Model |
|--------|------------------|---------------|
| Shape output | Single float (placeholder) | ShapeRef (topology + param slots) |
| Ellipse params | rx, ry as inputs | rx, ry, rotation as param slots |
| Rect params | width, height as inputs | width, height, rotation, corner as param slots |
| Path | Not supported | Same model, more params |
| Renderer | Hardcoded switch | Topology-driven dispatch |
| Type system | 'shape' = number | 'shape' = ShapeRef |

## Implementation Roadmap

### Phase 1: ShapeRef + Built-in Topologies

1. Define `TopologyDef` and `ShapeRef` types
2. Create `TOPOLOGY_ELLIPSE` and `TOPOLOGY_RECT`
3. Update Ellipse/Rect blocks to output ShapeRef
4. Update renderer to use topology.render()
5. Wire param slots through schedule/executor

### Phase 2: Param Modulation

1. Enable rx, ry, width, height as modulatable signals
2. Add rotation param to both shapes
3. Add cornerRadius to Rect
4. Per-particle param variation (Field<float> for params)

### Phase 3: Path Support

1. Define path topology format (verbs + point counts)
2. Create ProceduralPolygon block (generates topology)
3. Create AssetPath block (loads SVG topology)
4. Wire control points as Field<vec2>
5. Path-specific params (trim, dash, strokeWidth)

### Phase 4: Path Operators

1. Topology-stable: Trim, WarpNoise, TangentField
2. Instance-along-path layout
3. (Optional) Topology-changing: Boolean ops, stroke-to-outline

## Transformation Constraints

**Critical Insight:** Topology is compile-time, params are runtime.

### What CAN be transformed at runtime (topology-stable):

| Transform | How It Works |
|-----------|--------------|
| Move control points | Update Field<vec2> values |
| Scale/rotate shape | Transform all control points uniformly |
| **Stretch (non-uniform scale)** | Multiply x or y independently (e.g., x×2 stretches horizontally) |
| **Change joint angles** | Move control points to new positions - angles emerge from point placement |
| Warp/noise | Displace control points per-frame |
| Trim path | Interpolate along existing segments |
| Stroke width/dash | Modify rendering params |
| Per-vertex color | Add color field per control point |

**Example - Stretching a triangle:**
Original points: [(0,1), (-1,-1), (1,-1)]
Stretched 2x horizontally: [(0,1), (-2,-1), (2,-1)]
→ Same 3 points, same topology, different shape

**Example - Changing joint angle:**
Original square corner at (1,1)
Move to (1.5, 0.8)
→ Corner angle changes, still 4 points, topology preserved

### What CANNOT change at runtime (topology-changing):

| Operation | Why Not |
|-----------|---------|
| Add/remove segments | Changes verb count, invalidates control point indexing |
| Change LINE to CUBIC | Changes points-per-verb, requires recompile |
| Boolean ops (union/diff) | Creates entirely new topology |
| Stroke-to-outline | Converts path to filled polygon |

### Topology-Changing Blocks (Compile-Time Transforms)

Some blocks CAN change topology, but they're **graph operations** (compile-time), not runtime operations:

| Block | Input Topology | Output Topology |
|-------|----------------|-----------------|
| `Subdivide(n)` | Path with P points | Path with P×n points |
| `Simplify(n)` | Path with P points | Path with ~P/n points |
| `Resample(n)` | Any path | Path with exactly N points |
| `MergePaths` | Two paths | Combined path |
| `BooleanOp` | Two paths | New path (union/diff/intersect) |

These blocks:
1. Execute at **compile time** (when graph changes)
2. Output a **new TopologyDef** (different point count, different verbs)
3. Downstream blocks see the new topology

This is similar to how audio effects work:
- Most effects: same sample count in/out (runtime)
- Resampler: different sample count (compile-time/offline)

**Key rule:** If a block changes point count, it's a topology-changing block and triggers recompile when its params change.

### The "Synth-Feel" Principle

From the original proposal:
> "A path as (A) stable topology + (B) continuously-modulatable fields"

This is why topology-changing ops are compile-time only. At runtime, control points flow like audio samples - continuous, modulatable, no discontinuities. You can animate a path smoothly because you're just moving points, not restructuring the path.

**Analogy:** A synth oscillator has fixed waveform topology (sine, saw, square) but modulatable params (frequency, amplitude, phase). You don't change the waveform shape mid-note - that would cause clicks. Same principle here.

## Open Questions

1. **ShapeRef in type system** - Is 'shape' still a PayloadType, or is ShapeRef a distinct concept?

2. **Param slot binding** - How do param slots get connected in the IR? New field kind?

3. **Topology registry** - Where do TopologyDefs live? Compile-time registry?

4. **Per-particle topology** - Can different particles have different shapes? (Probably no for v1)
