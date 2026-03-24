---
parent: ../INDEX.md
topic: axes
tier: 2
---

# Axes: Perspective (Structural)

> **Tier 2**: Can change, but it's work. Affects many other things.

**Foundational Prerequisites**: [Axis Invariants](./t1_axis-invariants.md)

---

## Overview

Perspective describes which coordinate frame / view-space interpretation applies to a value. It is NOT about "2D vs 3D rendering API" — it is about the semantic meaning of spatial coordinates.

## PerspectiveValue (G1 Resolved)

### v0 (Current)

```typescript
type PerspectiveValue = { kind: 'default' };
```

Only the default perspective exists in v0. All spatial values share one implicit coordinate frame.

### v1+ (Future — included in spec for completeness)

```typescript
type PerspectiveValue =
  | { kind: 'default' }
  | { kind: 'world' }
  | { kind: 'view'; viewId: ViewId }
  | { kind: 'screen'; screenId: ScreenId };
```

- **world**: Values in world-space coordinates (scene-level)
- **view(id)**: Values relative to a specific view/camera
- **screen(id)**: Values in screen-space (pixel coordinates for a specific output)

These are included in the canonical spec to establish the axis's intended domain, even though v0 only uses `default`.

## Semantics

Perspective governs what operations are valid on spatial values:
- World-space values can be transformed to view-space via camera projection
- View-space values from different views cannot be directly compared
- Screen-space values are resolution-dependent

Changing perspective requires an explicit adapter (e.g., world→view transform).

---

## See Also

- [Branch](./t2_branch.md) - The other "deferred until v1+" axis
- [Axis Invariants](./t1_axis-invariants.md) - I2 (only explicit ops change axes)
