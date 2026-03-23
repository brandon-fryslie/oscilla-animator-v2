Oscilla v2.5 — 2.5D Mode Spec (Defined as a Constrained Profile of the 3D System)

0. Purpose

2.5D mode is a first-class profile of the 3D architecture that:
•	Uses the same canonical runtime model: Field<vec3> world positions + camera projection.
•	Constrains the patch surface area so authoring remains “2D-simple”.
•	Provides “3D vibes” (tilt, parallax, depth ordering, subtle perspective) with predictable performance and UX.

This spec is complete and independent. It does not introduce a parallel pipeline.

⸻

1. Canonical Data Model (Same as 3D)

1.1 World positions

All drawable instances are positioned by:
•	worldPosition: Field<vec3> over instance I.

Semantics:
•	x,y,z ∈ [0,1] (normalized world cube).

1.2 Rendering inputs

Render sinks consume:
•	screenPosition: Field<vec2> (computed from worldPosition and camera)
•	viewDepth: Field<float> (for sorting / depth effects)
•	plus existing shape/color/size fields aligned by instanceId.

⸻

2. What Makes It “2.5D”

2.5D is defined by constraints on how worldPosition and the camera are allowed to vary.

2.1 Patch-level constraint: “2D-first positioning”

In 2.5D mode, user patches do not directly author Field<vec3>.

Instead, they author:
•	position2D: Field<vec2> over instance I (the canonical 2D layout output)
•	depth: Field<float> over the same instance I (a scalar depth field)

and the system defines:
•	worldPosition = compose(position2D, depth) where:
•	worldPosition.x = position2D.x
•	worldPosition.y = position2D.y
•	worldPosition.z = depth

This is enforced. Any attempt to construct or pass a general Field<vec3> into positioning in 2.5D mode is rejected by compilation diagnostics.

2.2 Camera constraint: “tilt-only camera”

In 2.5D mode, the camera is not a general free camera. It is a constrained camera with a fixed policy:
•	No roll.
•	No arbitrary yaw/pitch.
•	No arbitrary translation in world space.
•	Only a tilt profile and zoom are exposed.

This camera is still implemented using the 3D camera pipeline internally (view/projection), but the user-accessible controls are reduced to stable, predictable degrees of freedom.

⸻

3. Allowed Graph Surface Area in 2.5D Mode

3.1 Positioning and motion

Allowed:
•	Produce position2D using:
•	grid, line, circle layout kernels.
•	Intrinsics: index, normalizedIndex, randomId.
•	Field map/zip and numeric ops to animate/move positions in 2D.

Allowed:
•	Produce depth using:
•	Intrinsics and field ops (including noise, gradients, easing).
•	Constraints below (to keep depth stable and cheap).

Not allowed:
•	Any kernel/operation that treats worldPosition as a general vec3 authoring surface.
•	Any 3D rotation of instances in patch space.
•	Any per-instance 3D orientation pipeline.
•	Any patch-authored camera matrices.

3.2 Depth constraints (patch authoring)

Depth is a Field<float> but is restricted by policy:

DepthPolicy (2.5D):
•	Depth must be bounded: 0 ≤ depth ≤ 1 (clamped).
•	Depth must be low-frequency relative to position2D changes:
•	Practically: discourage/deny depth derived from high-frequency oscillators unless explicitly smoothed (see below).
•	Depth should be stable under edits:
•	Default continuity policy for depth is slew with fixed tauMs (e.g. 120ms) unless user explicitly selects preserve.

Hard disallow (compile-time):
•	Depth may not be derived from discrete triggers/events directly (no “teleport depth”).
•	Depth may not depend on external inputs that can jump (mouseX/mouseY) without an explicit smoothing stage.

These restrictions are about avoiding Z-jitter and depth-sort thrash, which look bad and are expensive.

⸻

4. Canonical Kernels for 2.5D Profile

These are kernels in the 3D kernel library, but are designated as the only ones used for 2.5D positioning/camera.

4.1 compose2_5D_worldPosition

Inputs:
•	position2D: Field<vec2> over I
•	depth: Field<float> over I

Output:
•	worldPosition: Field<vec3> over I

Per-lane:
•	(x,y) = position2D[i]
•	z = clamp(depth[i], 0, 1)
•	output (x,y,z).

This is mandatory in 2.5D mode; it is the only way worldPosition is formed for rendering.

4.2 camera2_5D_project

A single projection kernel that produces both outputs:

Inputs:
•	worldPosition: Field<vec3> over I
•	camera signals: tilt, zoom, center (see below)

Outputs:
•	screenPosition: Field<vec2> over I
•	viewDepth: Field<float> over I

(Implementation can be two kernels internally; the spec treats it as a coherent projection stage.)

⸻

5. 2.5D Camera Profile (Defined in 3D Terms)

2.5D camera is a constrained parameterization of the 3D camera.

5.1 User-exposed camera controls

Exposed as signals (continuous):
•	camCenter: Signal<vec2> in [0,1]×[0,1]
(pan in world XY, but constrained to “look at” movement)
•	camZoom: Signal<float> positive
(scale)
•	camTilt: Signal<float> in [0, tiltMax]
(0 = top-down, tiltMax = max pitch)

Optionally exposed (still constrained):
•	camYaw: Signal<float> in [-yawMax, yawMax]
default 0, small range (e.g. ±15°) for subtle parallax

Not exposed:
•	roll
•	arbitrary camera translation
•	arbitrary pitch/yaw beyond bounds
•	free-fly

5.2 Internal camera mapping (to 3D camera parameters)

Internally (not user-authored), the system derives:
•	camPos: Signal<vec3>
•	camTarget: Signal<vec3>
•	camUp: Signal<vec3>
•	projection params (fov, aspect, near, far)

from (camCenter, camZoom, camTilt[, camYaw]) via fixed rules.

This ensures all 2.5D cameras share consistent behavior and avoids “patch-defined camera math.”

⸻

6. Render Step Requirements

The render step remains the 3D-compatible StepRender variant:
•	positionSlot must be Field<vec2> (screen positions).
•	depthSlot must be Field<float> (view depth) in 2.5D mode (mandatory).
•	All other fields (color/shape/size/etc.) must align by instanceId.

Depth sorting:
•	Renderer must perform stable sorting for the instance when depthSlot exists.
•	Sorting algorithm must be stable frame-to-frame for equal depth values (tie-break by lane index or stable elementId).

⸻

7. Performance Constraints (Enforced by Profile)

2.5D mode exists largely to keep performance and UX predictable.

7.1 Bounded evaluation costs
•	Position is authored as Field<vec2> and a scalar Field<float>.
•	The only 3D-specific per-lane cost is:
•	composing (x,y,z)
•	projecting to screen (camera stage)
•	sorting by depth (optional but required in 2.5D mode)

7.2 Prohibited expensive behaviors

Disallowed in 2.5D mode:
•	Per-lane 3D rotations / per-lane orientation.
•	Per-lane camera-dependent warps beyond projection.
•	Per-lane variable camera parameters.
•	Arbitrary path “along 3D surface” layouts.

(These remain valid in full 3D mode.)

⸻

8. UX Guarantees

A patch authored in 2.5D mode has these guarantees:
1.	Patch structure stays 2D-simple:
•	You lay out in 2D, then add depth as one extra scalar field.
2.	Depth is visually stable:
•	Default smoothing prevents flickery depth sorting.
3.	Camera is predictable:
•	User interacts via tilt/zoom/center with bounded ranges.
•	No “why is my scene upside down” failure modes.
4.	Upgrade path is trivial:
•	Any 2.5D patch is already a valid 3D patch internally.
•	Switching the profile to “3D” just removes constraints; it does not rewrite storage or IR.

⸻

9. Compile-Time Rules for 2.5D Mode

When a patch is in 2.5D mode:

9.1 Position authoring rules
•	Render sinks must source positions from camera2_5D_project(screenPosition).
•	That projection must source world positions from compose2_5D_worldPosition(position2D, depth).
•	position2D must be produced by the canonical layout kernels (grid/line/circle) and field ops.
•	depth must be a Field<float> over the same instance.

9.2 Forbidden constructs

Compilation fails if:
•	A render sink uses a non-2.5D position pipeline (any direct Field<vec3> positioning input).
•	Camera parameters are produced by patch math outside the approved control signals.
•	Depth violates policy constraints (e.g. unsmoothed event-derived depth).

⸻

10. How This Prevents “3D Complexity Explosion”

This is the key intent:
•	You still get:
•	tilt,
•	parallax,
•	occlusion ordering,
•	depth-based size/opacity/color modulation,
•	camera feel.
•	But you avoid:
•	3D orientation and rotation UX,
•	arbitrary camera authoring,
•	combinatorial “3D layout block zoo,”
•	per-lane camera effects,
•	large performance cliffs from unconstrained 3D modulation.

This profile keeps the patch mental model close to 2D while still using a real 3D representation and projection under the hood.