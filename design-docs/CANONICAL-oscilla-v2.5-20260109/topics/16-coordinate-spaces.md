---
parent: ../INDEX.md
topic: coordinate-spaces
order: 16
---

# Coordinate Spaces & Transforms

> Formal definition of the three-space coordinate model and transform semantics.

**Related Topics**: [02-block-system](./02-block-system.md), [04-compilation](./04-compilation.md), [05-runtime](./05-runtime.md), [06-renderer](./06-renderer.md)
**Key Terms**: [Local Space](../GLOSSARY.md#local-space), [World Space](../GLOSSARY.md#world-space), [Viewport Space](../GLOSSARY.md#viewport-space), [scale](../GLOSSARY.md#scale)
**Relevant Invariants**: [I15](../INVARIANTS.md#i15-renderer-is-a-sink-not-an-engine)

---

## Overview

Oscilla uses a three-space coordinate model. Every geometric value lives in one of these spaces, and explicit transforms move values between them:

| Space | Role | Range | Example |
|-------|------|-------|---------|
| **Local (L)** | Geometry/control points | Centered at (0,0), magnitude O(1) | Circle: points on unit circle |
| **World (W)** | Instance placement | Normalized [0..1] | Layout positions |
| **Viewport (V)** | Backend-specific output | Pixels or viewBox units | SVG: width × height |

---

## Local Space

### Definition

Local space is the coordinate system in which geometry and control points are defined. Every shape's geometry is authored relative to its own origin.

**Properties**:
- Origin at (0, 0)
- Magnitude O(1) — control points are near the origin
- No relation to final screen position or size
- Defined per geometry template (not per instance)

### Examples

- **Circle**: Points on unit circle `(cos θ, sin θ)`
- **Rectangle**: Corners at `(±0.5, ±0.5)`
- **Polygon**: Vertices on unit circle at regular intervals
- **Custom path**: Control points authored relative to origin

---

## World Space

### Definition

World space is the normalized coordinate system for instance placement. Layout blocks produce positions in world space.

**Properties**:
- Range: [0..1] in both axes
- Represents the abstract "canvas" before backend mapping
- All position outputs from layout blocks are in world space
- Array block instances exist in world space

### Relationship to Existing Concepts

- Layout blocks already produce positions in [0..1] — this formalizes that convention
- Array block creates instances with world positions
- Position fields (`Field<vec2>`) with layout semantics are world-space values

---

## Viewport Space

### Definition

Viewport space is the backend-specific output coordinate system. The renderer maps world space to viewport space.

**Properties**:
- Backend-determined (pixels, SVG viewBox units, WebGL clip space)
- Renderer responsibility (Invariant I15: renderer is a sink)
- Not visible to patch logic — patches work in world space

### Backend Mapping

```
pV = pW × viewportDimensions
```

For SVG: `pV = pW × (viewBoxWidth, viewBoxHeight)`
For Canvas: `pV = pW × (canvasWidth, canvasHeight)`

---

## Transform Chain

The full transform from local geometry to viewport output:

```
pW = positionW + R(θ) · (scale × pL)
pV = pW × viewportDimensions
```

Where:
- `pL` = point in local space
- `positionW` = instance position in world space (from layout)
- `θ` = instance rotation
- `scale` = isotropic local→world scale factor
- `pW` = resulting point in world space
- `pV` = final point in viewport space

### Transform Order

1. **Scale** local geometry by `scale` (and optionally `scale2`)
2. **Rotate** by θ
3. **Translate** to world position
4. **Map** world → viewport (renderer only)

---

## `scale` Semantics

### Definition

`scale` is the **isotropic local→world scale factor** expressed in world-normalized units.

- Type: `Signal<float>` or `Field<float>`
- Semantics: If a point in local space is `pL`, then after scaling: `scale × pL`
- Backend mapping: `scalePx = scale × min(viewportWidth, viewportHeight)`

### Reference Dimension

The reference dimension for isotropy is `min(viewportWidth, viewportHeight)`. This ensures:
- A `scale` of 0.1 means "10% of the smaller viewport dimension"
- Aspect ratio doesn't distort isotropic shapes
- Same `scale` value produces same visual size regardless of viewport aspect

### `scale2` (Optional Anisotropic)

`scale2` is an optional parallel channel for anisotropic scaling:

- Type: `Signal<vec2>` or `Field<vec2>`
- Semantics: per-axis scale multiplier

### Combination Rule

When both `scale` and `scale2` are present:

```
S_effective = (scale × scale2.x, scale × scale2.y)
```

`scale` provides uniform base size; `scale2` provides per-axis stretch.

### Alignment with Type System

- `scale` is a standard `float` payload — no special type needed
- `scale2` is a standard `vec2` payload
- Both participate normally in cardinality-generic operations
- Both can be `Signal` (per-instance shared) or `Field` (per-element varying)

---

## Coordinate-Space Enforcement

### Convention-Based (Current)

Coordinate spaces are enforced by block-level naming conventions:

| Name Pattern | Space | Example |
|-------------|-------|---------|
| `controlPoints`, `vertices`, `path` | Local | Geometry definition ports |
| `position`, `offset`, `center` | World | Layout/placement ports |
| `screenPos`, `pixelCoord` | Viewport | Renderer internals only |

Blocks document which space their ports operate in. Connecting ports of different spaces without an explicit transform is a semantic error caught by naming convention and documentation.

### Future: Type-Level Axis (Deferred)

A future version may add `coordSpace` to the Extent:

```typescript
// FUTURE — not in current spec
coordSpace?: AxisTag<CoordSpace>;
type CoordSpace = 'local' | 'world' | 'viewport';
```

This would enable compile-time enforcement of coordinate space mismatches. Deferred because convention + block contracts are sufficient for v2.

---

## Impact on Other Topics

### Block System (Topic 02)

- Primitive blocks define geometry in **local space**
- Layout blocks produce positions in **world space**
- RenderInstances2D receives **world-space** positions and maps to viewport

### Compilation (Topic 04)

- Compiler must emit scale/position ops that respect coordinate spaces
- No implicit coordinate conversions — explicit blocks required

### Runtime (Topic 05)

- Field buffers for positions are world-space values
- Field buffers for control points are local-space values
- No runtime transformation between spaces (compile-time resolution)

### Renderer (Topic 06)

- Renderer maps world → viewport (the only W→V transform)
- RenderIR contains local-space geometry + world-space transforms
- Backend handles the final V mapping

---

## See Also

- [02-block-system](./02-block-system.md) - Block port coordinate conventions
- [05-runtime](./05-runtime.md) - Field buffer semantics
- [06-renderer](./06-renderer.md) - World→viewport mapping
- [Glossary: Local Space](../GLOSSARY.md#local-space)
- [Glossary: World Space](../GLOSSARY.md#world-space)
- [Glossary: scale](../GLOSSARY.md#scale)
