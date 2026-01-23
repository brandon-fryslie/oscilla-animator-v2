Spec: Always-3D World With Momentary Projected View (Hold-Shift “3D Preview”)

0. Goal
	•	World space is always 3D (vec3 positions everywhere).
	•	The patch always computes in the same way regardless of view.
	•	The user can hold a key (e.g., Shift) to temporarily view the current frame through a perspective camera projection (“3D preview”) without changing the patch graph, compilation output, runtime state, or continuity mappings.
	•	Releasing the key returns to the standard top-down view.
	•	This is a viewer-only change: it must not alter deterministic playback/export unless explicitly rendered with that camera.

⸻

1. Canonical Coordinate Spaces and Meanings

1.1 Spaces
	•	Local Space: shape-authored coordinates; each shape is defined around its local origin. Local space has no knowledge of world position.
	•	World Space: positions from layout + modulation. Canonical range for XY is [0,1] unless a patch explicitly chooses otherwise. Z is in the same unit system as XY.
	•	View Space: coordinates after camera transform (look-at).
	•	Clip/Screen Space: projected 2D coordinates used by renderer backend.

1.2 Canonical meaning of position
	•	position: Field<vec3> is the only authoritative spatial placement for instances.
	•	A “2D layout” is simply a layout that emits z = 0 for every element.

1.3 Canonical meaning of size (ties back to your existing work)
	•	size: Signal<float> | Field<float> is isotropic scale in world units.
	•	Backends may apply a screen-space minimum clamp for visibility in debug, but that is a debug-only viewer rule, not render semantics.

⸻

2. Camera Model

2.1 Two cameras exist, but only one is “render-authoritative”

There are two camera parameter sets:
	1.	Canonical Camera (Render Camera)
Used for normal rendering and export unless user explicitly selects export camera.
	2.	Preview Camera (Viewer Camera)
Used only while Shift is held to preview perspective behavior.

Both cameras are evaluated from the same world-space frame output.

2.2 Camera parameter signals (typed, explicit)

Camera is represented as signals (cardinality one, continuous):
	•	camPos: vec3
	•	camTarget: vec3
	•	camUp: vec3
	•	fovY: float (radians or degrees, but unit must be explicit)
	•	near: float
	•	far: float

Orthographic parameters are allowed only if you also support ortho as a camera type. For this spec, the default view can still be “top-down,” but the Shift preview is perspective.

2.3 Default camera values (canonical “top-down”)

Even though world is 3D, the default view should behave like your current 2D.

Define the default render camera as a top-down perspective with framing that maps [0,1]² reasonably:
	•	camPos = (0.5, 0.5, D) where D = 2.0 (tunable constant)
	•	camTarget = (0.5, 0.5, 0.0)
	•	camUp = (0.0, 1.0, 0.0)
	•	fovY = 45° (in radians in the type system)
	•	near = 0.01
	•	far = 100.0

This is not identity, but it is stable and “2D-like” when z=0. The exact identity requirement is dropped by design since you want perspective always available.

2.4 Preview camera values (Shift “tilt”)

The preview camera is derived from the render camera by applying a deterministic tilt around the target:
	•	tiltAngle = 35° (constant)
	•	yawAngle = 0° (constant; optional future UI)
	•	distance = |camPos - camTarget| preserved
	•	camUp remains (0,1,0) unless you support roll

The preview camera is computed purely in the viewer, not in the patch.

⸻

3. Projection Stage and Kernel Contracts

3.1 One projection kernel (perspective only)

You want to avoid ortho entirely. Therefore:
	•	Provide projectWorldToScreenPerspective as the single projection kernel.

Contract:

Inputs
	•	worldPos: vec3 (signal or field form)
	•	camPos: vec3
	•	camTarget: vec3
	•	camUp: vec3 (must be normalized; if not, kernel normalizes)
	•	fovY: float with unit radians
	•	near: float
	•	far: float
	•	viewport: vec2 (width,height in pixels) is provided by renderer/runtime, not patch

Outputs
	•	screenPos: vec2 in normalized screen space [0,1]
	•	depth: float in view space (monotonic with distance along forward axis)

Rules
	•	If point is behind camera or outside near/far, it may be marked “culled” via a parallel visible: bool output or by clamping depth; pick one and make it explicit. Preferred: visible: bool.

3.2 Field kernel form (required)

You must have a field kernel path that projects Field<vec3> to Field<vec2> plus Field<float> depth (and optional Field<bool> visible):
	•	projectFieldWorldToScreenPerspective(worldPosField, cameraSignals) -> screenPosField, depthField, visibleField

No per-element branching outside the kernel.

⸻

4. Render IR Changes

4.1 Render IR is screen-space only at backend boundary

Backends (Canvas2D, SVG) consume a screen-space pass:

RenderPass instances2d must contain:
	•	instanceId: InstanceId
	•	count: number
	•	screenPosition: Float32Array (xy pairs, normalized 0..1 or pixel—pick one; recommended: normalized 0..1)
	•	depth: Float32Array (optional but recommended for debug and future sorting)
	•	visible: Uint8Array (0/1) optional but recommended
	•	color: Uint8ClampedArray
	•	size: number | Float32Array (world size is already baked into projection? No—see below)
	•	shape: ShapeDescriptor | SlotRef (your unified topology model)

4.2 Size application rule under perspective (explicit)

Decide and lock one rule:
	•	Rule: size is a world-space radius (or half-extent) and must be projected to screen-space using the camera model per instance.

Therefore, the pipeline must produce screenRadius (or screenScale) for the renderer:
	•	Add to RenderPass:
	•	screenRadius: number | Float32Array (normalized screen units or pixels)

This prevents each backend from re-implementing camera math and keeps SVG/Canvas consistent.

4.3 Renderer backend responsibilities (after this change)

Canvas2D/SVG renderers must:
	•	Draw using screenPosition and screenRadius only.
	•	Never perform world→screen projection themselves.
	•	Never interpret z directly.

⸻

5. Pipeline Placement

5.1 Where projection happens

Projection happens after layout and motion, and before RenderAssembler emits backend-ready passes:

Pipeline per frame:
	1.	Evaluate signals
	2.	Materialize fields (including layout output: position: Field<vec3>)
	3.	Apply continuity in world space (position, size, etc.)
	4.	Project to screen space using active camera (render camera or preview camera)
	5.	Assemble RenderFrameIR
	6.	Backend draws

5.2 Viewer-only “Shift preview” implementation
	•	Runtime produces a WorldFrame (world-space fields) and a RenderFrame (screen-space fields) each tick, or it produces WorldFrame and viewer projects it. Pick one.

Canonical choice for this spec:
Runtime produces WorldFrame + projection-ready dependencies; viewer chooses camera and runs projection + render assembly.

Reason: Shift preview must not cause recompiles or IR changes; it should be a pure viewer transform.

Consequence: The projection kernel must be callable in the viewer execution path (same code as runtime kernels).

⸻

6. Blocks and Graph Semantics

6.1 Layout blocks

Layouts output:
	•	position: Field<vec3> aligned by instanceId

The three required layouts (line, circle, grid) must emit z=0 unless they explicitly include z modulation.

6.2 Camera blocks

Camera is not required in the patch for default behavior, but it is allowed.
	•	Provide a Camera block that outputs the camera signals.
	•	Default sources provide camera signals when no camera is wired.

The viewer may override the camera signals for preview only; this is not a patch change.

6.3 Render sink alignment

Render sink wires must align instance data by instanceId:
	•	shape: Field<shape> and position: Field<vec3> are considered compatible for rendering only if their resolved cardinality is many with the same InstanceRef.instanceId.

⸻

7. Continuity Requirements (to prevent the exact failure mode you described)

Continuity is applied to:
	•	position: Field<vec3> (world space)
	•	size: Field<float> (world space)
	•	Any other world-space attributes (rotation, etc., future)

Continuity is not applied to:
	•	screenPosition
	•	screenRadius
	•	depth

Those are derived views.

This guarantees that switching Shift preview does not invalidate continuity state or cause “camera breaks continuity” regressions.

⸻

8. SVG Targeting (implications)

SVG renderer consumes the same screen-space RenderPass:
	•	Use screenPosition and screenRadius.
	•	Paths are rendered via topology definitions, exactly as Canvas2D does, but in SVG path syntax.
	•	Depth can be used for z-order sorting (stable sort) if enabled; otherwise preserve instance order.

Because projection is upstream, SVG does not implement camera math.

⸻

9. What must be implemented now (no stubs)

9.1 Kernel layer
	•	projectWorldToScreenPerspective (signal + field variants)
	•	projectWorldRadiusToScreenRadius (or integrated into projection kernel; pick one and keep it explicit)
	•	lookAtBasis helpers inside kernel module (deterministic, no allocations)

9.2 Runtime/viewer integration
	•	A viewer pathway that can evaluate projection kernels using the current WorldFrame buffers
	•	A toggle (Shift) that selects preview camera params and regenerates RenderFrameIR without recompiling

9.3 Render IR changes
	•	Pass screen-space position + screenRadius to backends
	•	Remove any world-space assumptions from backends

9.4 Blocks
	•	Layout blocks emit Field<vec3>
	•	Default camera sources exist and are typed
	•	Render sink consumes instance-aligned fields

⸻

10. Verification criteria (how you know you’re done)
	1.	A patch with z=0 everywhere renders identically whether Shift is held or not except for the expected perspective tilt/parallax differences.
	2.	Toggling Shift does not:
	•	recompile,
	•	reset runtime state,
	•	change continuity mapping,
	•	change debug edge slot mapping.
	3.	A patch with two layers at different z shows correct depth ordering and size-with-depth behavior under Shift.
	4.	SVG and Canvas2D outputs match for the same RenderFrameIR (within backend precision limits).

