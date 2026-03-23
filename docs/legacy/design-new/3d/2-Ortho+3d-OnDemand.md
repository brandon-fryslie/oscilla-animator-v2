Default Camera Values and Projection Mode Spec

1. Problem

Every patch must render even when the user has not authored any camera wiring. The render pipeline therefore requires a default camera definition and a default projection mode that are always available.

2. Requirements

R1. Identity for flat patches
For patches whose world positions satisfy z = 0 for all elements, the default view must produce:
 - screenPosition.xy = worldPosition.xy (exact, not approximate)

R2. Momentary 3D projection view
The user must be able to temporarily view the same frame through a perspective camera (e.g., while holding Shift) without recompiling, re-running normalization, resetting state, or changing continuity mappings.

R3. Single world model
World positions are always vec3. "2D" is the special case z = 0.

R4. Projection is explicit
Projection is an explicit stage that consumes world-space buffers and camera parameters and produces screen-space buffers.

3. Canonical Solution

The system uses two projection modes and two camera parameter sets, with strict responsibilities:
 - Default projection mode: Orthographic (required to satisfy R1 exactly)
 - Momentary projection mode (Shift): Perspective (required to satisfy R2)

This is not a forked rendering pipeline. It is a single pipeline where the projection stage can be executed with either the orthographic or perspective camera parameters.

4. Default Orthographic Camera (Identity Mapping)

4.1 Orthographic projection contract
Orthographic projection maps world space to normalized screen space as:
 - screenX = (worldX - centerX) / orthoWidth + 0.5
 - screenY = (worldY - centerY) / orthoHeight + 0.5

To obtain screenXY = worldXY for world coordinates in [0,1]:
 - Choose centerX = 0.5, centerY = 0.5
 - Choose orthoWidth = 1.0, orthoHeight = 1.0

Then:
 - screenX = (worldX - 0.5)/1.0 + 0.5 = worldX
 - screenY = (worldY - 0.5)/1.0 + 0.5 = worldY

This identity is exact in floating-point arithmetic aside from standard IEEE rounding on subtraction/addition; it introduces no perspective distortion and no camera-dependent scaling.

4.2 Default orthographic camera signals
All are Signal<> (one, continuous) and provided by default sources when not wired.
 - camPos: vec3 = (0.5, 0.5, 1.0)
(position is not used by orthographic projection itself, but retained for consistency and for view-space depth conventions)
 - camTarget: vec3 = (0.5, 0.5, 0.0)
 - camUp: vec3 = (0.0, 1.0, 0.0)
 - orthoWidth: float = 1.0
 - orthoHeight: float = 1.0
 - near: float = 0.01
 - far: float = 100.0

4.3 Default orthographic projection kernel
The projection stage must expose an orthographic kernel:
 - projectWorldToScreenOrtho(worldPos: vec3, camTarget: vec3, camUp: vec3, orthoWidth: float, orthoHeight: float, near: float, far: float) -> (screenPos: vec2, depth: float, visible: bool)

Rules:
 - screenPos is normalized to [0,1].
 - depth is defined in a stable way (e.g., view-forward distance or simply worldZ under top-down conventions); it must be deterministic.
 - visible is true if within near/far and within orthographic extents.

5. Momentary Perspective Camera (Shift "3D Preview")

5.1 Behavior
While Shift is held, the projection stage is re-executed using perspective parameters to allow immediate inspection of depth behavior. This must not alter:
 - compilation output,
 - runtime state slots,
 - continuity state or mappings,
 - graph normalization outputs.

Only the viewer-selected projection parameters change.

5.2 Default perspective camera parameters (for Shift)
These values are derived to provide a stable, readable tilt view over [0,1]:
 - camTarget: vec3 = (0.5, 0.5, 0.0)
 - camUp: vec3 = (0.0, 1.0, 0.0)
 - distance: float = 2.0 (tunable constant)
 - tiltAngle: float = 35 (tunable constant)
 - yawAngle: float = 0 (constant for v1)

Compute:
 - camPos = camTarget + R_yaw * R_tilt * (0, 0, distance)
where rotations are deterministic and defined in kernel math.

Projection parameters:
 - fovY: float = 45 (stored/used in radians)
 - near: float = 0.01
 - far: float = 100.0

5.3 Perspective projection kernel
 - projectWorldToScreenPerspective(worldPos: vec3, camPos: vec3, camTarget: vec3, camUp: vec3, fovY: float, near: float, far: float) -> (screenPos: vec2, depth: float, visible: bool)

6. Strict Rule: No Approximate "Identity Perspective"

Perspective cannot produce an exact identity mapping of the XY plane over a finite area without being orthographic. Therefore:
 - The system must not attempt to tune a "far away camera + narrow FOV" to approximate identity as the default behavior.
 - The identity requirement is met only via orthographic projection.

=====


7. How Defaults Are Provided (No User Camera Wiring)

7.1 Default sources
If camera signals are not explicitly wired in the patch, default sources must supply the values in 4.2 for orthographic mode.

7.2 Projection selection policy
 - Default projection mode is orthographic.
 - Holding Shift switches the projection stage to perspective using 5.2 parameters.
 - Releasing Shift returns to orthographic.

This selection occurs strictly in the viewer/render-assembly path. It does not touch the compiled program.

8. Outputs and Renderer Contract

Regardless of projection mode, the projection stage produces:
 - screenPosition: Field<vec2> aligned by instanceId
 - depth: Field<float> aligned by instanceId
 - visible: Field<bool> aligned by instanceId

Render backends consume only these screen-space buffers for placement, and may use depth for ordering if a deterministic ordering policy exists.

9. Determinism and Export
 - Export must render using a declared camera/projection mode, not implicit viewer state.
 - The Shift view is explicitly non-exporting unless the user chooses "export with preview camera," which is a separate explicit control.

