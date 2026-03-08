---
parent: ../INDEX.md
topic: layout-system
order: 17
---

# Layout System

> Layout is a 3D position channel produced by computation kernels.

**Related Topics**: [01-type-system](./01-type-system.md), [04-compilation](./04-compilation.md), [16-coordinate-spaces](./16-coordinate-spaces.md), [06-renderer](./06-renderer.md)
**Key Terms**: [Layout Kernel](../GLOSSARY.md#layout-kernel), [Lane](../GLOSSARY.md#lane), [World Space](../GLOSSARY.md#world-space)
**Relevant Invariants**: [I8](../INVARIANTS.md#i8-slot-addressed-execution), [I15](../INVARIANTS.md#i15-renderer-is-a-sink-not-an-engine)

---

## Overview

The layout system defines how instances are positioned in world space. Key principles:

- **Layout is a Channel**: Positions are data channels in the Arena.
- **World Space Output**: Absolute coordinates in unbounded Cartesian ℝ³.
- **Convention-Based Visibility**: The region $[0, 1]^3$ maps to the viewport by default.
- **Deterministic**: Layouts are composed from intrinsic data and parameters.

---

## Layout Definition

**Layout** is defined as:

> A set of `f32` channels over a specific instance, with absolute coordinates in **World Space** ($\mathbb{R}^3$), produced by `ValueExpr` DAGs and computation kernels.

---

## Intrinsic Set (Closed)

The intrinsic set is **closed** and limited to:

| Intrinsic | Payload | Unit | Semantics |
|-----------|---------|------|-----------|
| `index` | `float` | `'#'` | Lane index `i` for `i ∈ [0, N-1]` |
| `normalizedIndex` | `float` | `'normalized'` | `i / (N - 1)` for `N > 1` |
| `randomId` | `float` | `'normalized'` | Deterministic PRNG from `(instanceId, i)` |

---

## Canonical Layout Kernels

### circleLayout

**Per-lane computation** (lane index `i`):

```
t_i = clamp(t[i], 0, 1)
θ_i = phase + 2π × t_i
r = radius

x_i = 0.5 + r × cos(θ_i)
y_i = 0.5 + r × sin(θ_i)
z_i = 0.0
```

### gridLayout

**Per-lane computation** (lane index `i`):

```
idx = clamp(floor(k[i]), 0, totalCount - 1)
col = clamp(idx mod cols, 0, cols - 1)
row = clamp(floor(idx / cols), 0, rows - 1)

x_i = (cols > 1) ? col / (cols - 1) : 0.5
y_i = (rows > 1) ? row / (rows - 1) : 0.5
z_i = 0.0
```

---

## Layout Blocks (Graph Level)

At the block/graph level, a **layout block** is a node that:
- Takes one or more parameters and intrinsic data as inputs.
- Produces absolute positions in **World Space** ($\mathbb{R}^3$).

The compiler lowers such blocks into `ValueExpr` trees that apply kernels to data channels.

---

## Relationship to Renderer

### StepRender Contract

The renderer receives positions via `StepRender`:

```typescript
interface StepRender {
  kind: 'render';
  instanceId: InstanceId;
  positionXYSlot: ValueSlot;      // Mandatory, cardinality=many(instanceId)
  positionZSlot: ValueSlot | null; // Optional, cardinality=many(instanceId)
  shapeSlot: ScalarSlotRef;        // shape2d handle, cardinality=one
  colorSlot: ValueSlot;            // RGBA, cardinality=one or many
  scaleSlot: ValueSlot;            // Isotropic scale
  rotationSlot: ValueSlot | null;  // Optional
}
```

**Invariants**:
- `positionXYSlot` and `positionZSlot` represent absolute coordinates in **World Space**.
- The renderer applies the combined **View-Projection matrix** to transform world coordinates to clip space.

### Coordinate Space Mapping

- Layout kernels produce **World Space** positions (absolute ℝ³).
- Convention: The region $[0, 1]^3$ represents the default visible canvas. Coordinates outside this range are valid but require camera panning/zooming to see.
- The renderer maps World Space → View → Clip → Viewport space (see [Topic 16](./16-coordinate-spaces.md)).
- Patch logic never sees viewport coordinates (Invariant I15: renderer is a sink).

---

## See Also

- [01-type-system](./01-type-system.md) - Payload and Cardinality definitions
- [04-compilation](./04-compilation.md) - Naga lowering and GpuLayout
- [16-coordinate-spaces](./16-coordinate-spaces.md) - World space definition
- [06-renderer](./06-renderer.md) - Render sink execution
