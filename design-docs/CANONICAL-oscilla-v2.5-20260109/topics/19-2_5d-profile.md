---
parent: ../INDEX.md
topic: 2_5d-profile
order: 19
---

# 19. 2.5D Profile

**Tier**: T3 (Optional)

## Overview

The **2.5D Profile** is a constrained authoring mode that provides "3D vibes" (tilt, parallax, depth ordering) while maintaining the predictability and simplicity of 2D workflows. It uses the same layout → compose → project → render pipeline as full 3D, but restricts what the user can author.

**Purpose**: Enable depth-enhanced animation with bounded complexity:
- Tilt and parallax camera effects.
- Depth-based sorting and layering.
- Predictable 2D-like position authoring.
- No per-instance 3D rotations or arbitrary camera math.

**Key Principle**: 2.5D is a **constraint set enforced by editor tooling**, not a compiler type. The compiler CAN check constraints; the editor SHOULD enforce them as guardrails.

## PatchProfile Concept (T3)

A **PatchProfile** is a named constraint set that defines which blocks, connections, and authoring patterns are permitted.

**Three Profiles**:

| Profile | Position Authoring | Depth | Camera | Use Case |
|---------|-------------------|-------|--------|----------|
| **2D** | `many:vec2` | None (z=0 implicit) | No camera block | Classic 2D animation |
| **2.5D** | `many:vec2` + `many:float` depth | Bounded [0,1], clamped | Tilt-only controls | Depth-enhanced 2D |
| **3D** | `many:vec3` or composed | Unbounded | Full 6DOF camera | Unestricted 3D |

**Profile Mechanics**:
- Profile is a **patch-level metadata property** (stored in patch document).
- Editor uses profile to filter available blocks/connections in UI.
- Compiler MAY emit warnings/diagnostics for profile violations.
- Profile violations are **lints**, not errors.

**Related**: [18-camera-projection](./18-camera-projection.md), [17-layout-system](./17-layout-system.md)

## 2.5D Constraints

### Position Authoring

**Constraint**: User authors position as `many:vec2` via layout kernels (same as 2D).

**Enforcement**: Editor filters layout kernel catalog to show only 2D variants.

### Depth Authoring

**Constraint**: User authors depth as a separate `many:float` channel connected to the `positionZSlot`.

**Depth Policy** (enforced as editor guidelines):
- **Bounded**: Depth MUST be in range [0, 1], clamped.
- **Low-frequency**: Depth SHOULD change slower than position.
- **Default continuity**: Depth uses slew with fixed `tauMs` (e.g., 120ms).
- **Smoothing requirement**: High-frequency oscillators or discrete triggers MUST be smoothed before connecting to depth.

**Related**: [11-continuity-system](./11-continuity-system.md) for depth slew behavior.

### Camera Constraints

**Constraint**: Only tilt-focused camera controls are exposed.

**Allowed Camera Parameters**:
- `camCenter`: `one:vec2` — 2D focus point in world space
- `camZoom`: `one:float` — orthographic zoom level
- `camTilt`: `one:float` — tilt angle in degrees [0, tiltMax]
- `camYaw` (optional): `one:float` — yaw rotation in degrees [-yawMax, yawMax]

**NOT Allowed in 2.5D**:
- Roll rotation.
- Free-fly camera (arbitrary translation).
- Pitch beyond tilt bounds.
- Camera position as `one:vec3`.
- Perspective FOV (2.5D uses orthographic projection).

**Enforcement**: The `Camera` block still has all ports, but editor UI only exposes the constrained subset in 2.5D mode.

---

## Performance Guarantees

**Why 2.5D is Bounded**:

1. **Position complexity**: `many:vec2` + scalar `many:float` — no per-lane 3D math.
2. **No per-lane rotations**: Instances cannot have individual 3D orientations.
3. **No per-lane camera warps**: Camera is global, not per-instance.
4. **Depth sorting**: Hardware Z-buffer handles ordering with minimal overhead.

---

## Upgrade Path

**2.5D → 3D is zero-cost**:
- Same pipeline (layout → compose → project → render).
- Same IR (2D + depth can coexist with 3D).
- No state migration needed.

**Upgrade Steps**:
1. User changes patch profile from "2.5D" to "3D".
2. Editor removes constraint filters.
3. User can now author 3D positions, arbitrary camera, etc.

---

## Summary

**What 2.5D Is**:
- A **constrained authoring mode** that restricts user to 2D layout + bounded depth.
- Enforced by **editor guardrails** (filtered block catalog).
- Optional **compiler diagnostics** for constraint violations.

**What 2.5D Is NOT**:
- A separate architecture or IR.
- A performance optimization (it's a UX simplification).

**Related Topics**:
- [16-coordinate-spaces](./16-coordinate-spaces.md) — worldspace vs viewspace
- [17-layout-system](./17-layout-system.md) — Layout authoring
- [18-camera-projection](./18-camera-projection.md) — Camera parameters
