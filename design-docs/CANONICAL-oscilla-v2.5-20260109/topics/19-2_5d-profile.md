---
parent: ../INDEX.md
topic: 2_5d-profile
order: 19
---

# 19. 2.5D Profile

**Tier**: T3 (Optional)

## Overview

The **2.5D Profile** is a constrained authoring mode that provides "3D vibes" (tilt, parallax, depth ordering) while maintaining the predictability and simplicity of 2D workflows. It is NOT a separate architecture — it uses the same layout → compose → project → render pipeline as full 3D, but restricts what the user can author.

**Purpose**: Enable depth-enhanced animation with bounded complexity:
- Tilt and parallax camera effects
- Depth-based sorting and layering
- Predictable 2D-like position authoring
- No per-instance 3D rotations or arbitrary camera math

**Key Principle**: 2.5D is a **constraint set enforced by editor tooling**, not a compiler type. The compiler CAN check constraints; the editor SHOULD enforce them as guardrails.

## PatchProfile Concept (T3)

A **PatchProfile** is a named constraint set that defines which blocks, connections, and authoring patterns are permitted.

**Three Profiles**:

| Profile | Position Authoring | Depth | Camera | Use Case |
|---------|-------------------|-------|--------|----------|
| **2D** | Field<vec2> | None (z=0 implicit) | No camera block | Classic 2D animation |
| **2.5D** | Field<vec2> + Field<float> depth | Bounded [0,1], clamped | Tilt-only controls | Depth-enhanced 2D |
| **3D** | Field<vec3> or composed | Unbounded | Full 6DOF camera | Unrestricted 3D |

**Profile Mechanics**:
- Profile is a **patch-level metadata field** (stored in patch document)
- Editor uses profile to filter available blocks/connections in UI
- Compiler MAY emit warnings/diagnostics for profile violations
- Compiler MUST NOT hard-reject based on profile alone (profiles are optional)
- Profile violations are **lints**, not errors

**Related**: [18-camera-projection](./18-camera-projection.md), [17-layout-system](./17-layout-system.md)

## 2.5D Constraints

### Position Authoring

**Constraint**: User authors position as `Field<vec2>` via layout kernels (same as 2D).

```typescript
// Allowed in 2.5D
const pos = layout.grid2D({ rows: 10, cols: 10 });
const pos2 = layout.circle2D({ radius: 100 });

// NOT allowed in 2.5D (requires 3D profile)
const pos3d = layout.helix3D({ ... }); // Field<vec3> not permitted
```

**Enforcement**: Editor filters layout kernel catalog to show only 2D variants.

### Depth Authoring

**Constraint**: User authors depth as a separate `Field<float>` connected to the `positionZSlot`.

```typescript
// Allowed: explicit depth field
const depth = modulate.sine({ amplitude: 0.3, offset: 0.5 });
// Connect: depth → positionZSlot

// NOT allowed: direct vec3 position with arbitrary z
const pos3d = compose.vec3(x, y, arbitraryZ);
```

**Depth Policy** (enforced as editor guidelines):
- **Bounded**: Depth MUST be in range [0, 1], clamped
- **Low-frequency**: Depth SHOULD change slower than position
- **Default continuity**: Depth uses slew with fixed `tauMs` (e.g., 120ms) unless user overrides
- **Smoothing requirement**: High-frequency oscillators or discrete triggers MUST be smoothed before connecting to depth
- **Diagnostic**: Editor warns if depth derives from high-frequency source without smoothing

**Related**: [11-continuity-system](./11-continuity-system.md) for depth slew behavior.

### Camera Constraints

**Constraint**: Only tilt-focused camera controls are exposed.

**Allowed Camera Parameters**:
- `camCenter`: Signal<vec2> — 2D focus point in world space
- `camZoom`: Signal<float> — orthographic zoom level
- `camTilt`: Signal<float> — tilt angle in degrees [0, tiltMax] (e.g., 0-60°)
- `camYaw` (optional): Signal<float> — yaw rotation in degrees [-yawMax, yawMax] (e.g., ±15°)

**NOT Allowed in 2.5D**:
- Roll rotation
- Free-fly camera (arbitrary translation)
- Pitch beyond tilt bounds
- Camera position as Signal<vec3>
- Perspective FOV (2.5D uses orthographic projection)

**Enforcement**: The `Camera` block still has all ports (it's the same block in 3D), but editor UI only exposes the constrained subset in 2.5D mode.

**Related**: [18-camera-projection](./18-camera-projection.md) for camera parameter details.

## Compile-Time Enforcement (Hybrid)

**Design Decision** (from RESOLUTION-LOG Q6: hybrid enforcement):

- **Spec defines constraints formally** (this document)
- **Editor enforces constraints** by filtering UI options (primary guardrail)
- **Compiler MAY emit diagnostics** for constraint violations (e.g., "depth exceeds [0,1] range")
- **Compiler MUST NOT hard-reject** patches that violate profile constraints
- **Profile violations are warnings/lints**, not errors

**Rationale**: Users can choose to ignore profile constraints if needed. Profiles are authoring aids, not safety invariants.

**Implementation Notes**:
- Profile constraint checks are implemented as optional compiler passes
- Editor can request profile diagnostics via compile options
- Diagnostics include severity (warning), constraint violated, remediation hint

## Performance Guarantees

**Why 2.5D is Bounded**:

1. **Position complexity**: Field<vec2> + scalar Field<float> — no per-lane 3D math
2. **No per-lane rotations**: Instances cannot have individual 3D orientations
3. **No per-lane camera warps**: Camera is global, not per-instance
4. **Depth sorting cost**: O(N log N) with two-phase optimization (see [06-renderer](./06-renderer.md))
   - Coarse bins by depth quantization
   - Fine sort within bins
   - Stable sort preserves authored z-order for ties

**Guarantee**: 2.5D patches have predictable render cost bounded by instance count N, not scene complexity.

## Upgrade Path

**2.5D → 3D is zero-cost**:
- Same pipeline (layout → compose → project → render)
- Same IR (Field<vec2> + Field<float> can coexist with Field<vec3>)
- Same storage format (patch document schema unchanged)
- No state migration needed

**Upgrade Steps**:
1. User changes patch profile from "2.5D" to "3D" (metadata field)
2. Editor removes constraint filters (full block catalog now visible)
3. User can now author Field<vec3> positions, arbitrary camera, etc.
4. No recompilation required — existing blocks continue working

**Downgrade** (3D → 2.5D):
- Editor checks if patch violates 2.5D constraints
- If violations exist, editor shows list + offer auto-remediation or abort
- Remediation: disconnect disallowed blocks, clamp depth, etc.

## Summary

**What 2.5D Is**:
- A **constrained authoring mode** that restricts user to Field<vec2> + bounded depth
- Enforced by **editor guardrails** (filtered block catalog, connection validation)
- Optional **compiler diagnostics** for constraint violations (warnings, not errors)
- Same pipeline as 3D — zero upgrade cost

**What 2.5D Is NOT**:
- A separate architecture or IR
- A hard compiler constraint (profiles are optional)
- A performance optimization (it's a UX simplification)

**Key Terms**:
- **PatchProfile**: Named constraint set (2D, 2.5D, 3D)
- **Depth Policy**: Guidelines for bounded, low-frequency depth authoring
- **Tilt-only Camera**: Restricted camera controls for predictable perspective

**Related Topics**:
- [16-coordinate-spaces](./16-coordinate-spaces.md) — worldspace vs viewspace
- [17-layout-system](./17-layout-system.md) — Field<vec2> authoring
- [18-camera-projection](./18-camera-projection.md) — camera parameters

**Relevant Invariants**:
- **I15** (renderer is sink): 2.5D respects same renderer invariants as 3D
