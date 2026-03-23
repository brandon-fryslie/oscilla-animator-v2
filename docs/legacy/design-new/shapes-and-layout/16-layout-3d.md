Cool, then let’s stop pretending and give you actual 3D semantics with vec3 as a first-class world position, not a hacked-in “depth channel”. Below is a self-contained spec that extends your existing architecture to 3D; it assumes your current type system and IR (the files you showed) as the base.

No “this or that”. This is the canonical 3D story.

⸻

Oscilla v2.5 — 3D World & Camera Extension

1. Scope

This extension defines:
•	How 3D world positions are represented (vec3).
•	How fields and lanes work in 3D.
•	How layout and depth are expressed as regular fields (no intrinsics).
•	How a camera projects 3D world positions into 2D screen coordinates and depth.
•	How this integrates with StepRender and the existing field / instance system.

The UX constraints (limited tilt, “3D-ish” Google Maps style, no full FPS camera) are handled by how you drive the camera parameters, not by changing the semantics below.

⸻

2. Type System Extension

2.1 New PayloadType: vec3

Extend your canonical PayloadType:

export type PayloadType =
| 'float'
| 'int'
| 'vec2'
| 'vec3'   // NEW: 3D vectors
| 'color'
| 'phase'
| 'bool'
| 'unit'
| 'shape'
| '???';

Semantics:
•	vec3 is a triple of 32-bit floats, usually interpreted as (x, y, z) in world or local space.
•	Storage per lane: 3 consecutive floats: buffer[3*i+0], buffer[3*i+1], buffer[3*i+2].

No new units are required; you can annotate with 'normalized', 'scalar', etc., if desired.

⸻

3. 3D World Position Semantics

3.1 World Position Type

Canonical world position is:

worldPosition: Field<vec3> over an InstanceRef.

Concretely:
•	CanonicalType:
•	payload: 'vec3'
•	extent.cardinality.kind = 'many'
•	extent.cardinality.instance: InstanceRef (with instanceId and domainType)
•	extent.temporality = continuous (world positions exist every frame)

Value range:
•	Oscilla’s world is a normalized cube:
•	x ∈ [0,1]
•	y ∈ [0,1]
•	z ∈ [0,1]

Interpretation:
•	(0,0,0) is one corner of the world volume.
•	(1,1,1) is the opposite corner.
•	You are free to interpret axes as you like in UX (e.g. x=right, y=up, z=“into screen”); the spec only fixes normalized ranges.

3.2 Lanes in 3D

Definition of lane (generalized, but now with 3D):

A lane is the value of a Field<…> at a specific element index i for a given InstanceRef.

For InstanceDecl I with count = N:
•	Field<vec3> over I:
•	Backing array: Float32Array of length 3N.
•	Lane i:
•	x = buffer[3*i + 0]
•	y = buffer[3*i + 1]
•	z = buffer[3*i + 2]

Other field types (vec2, float, color) behave as already defined; lane concept is unchanged, just extended to 3 components.

⸻

4. Intrinsics (Unchanged)

No new intrinsics are introduced for 3D.

Canonical intrinsic set remains:

export type IntrinsicPropertyName =
| 'index'
| 'normalizedIndex'
| 'randomId';

	•	index: integer lane index (as float), unit '#'.
	•	normalizedIndex: lane index normalized to [0,1].
	•	randomId: deterministic pseudo-random [0,1] per lane.

Notably:
•	There is no intrinsic for position, depth, height, etc.
•	Z is not special; it is just a value you compute via field expressions.

All layout and camera behavior is expressed via explicit field expressions and kernels.

⸻

5. 3D Layout: World Position Fields

5.1 Canonical Layout Output

For 3D-aware patches, layout blocks produce:

worldPosition: Field<vec3> over some InstanceRef I.

You can still have 2D-style layouts, but their output is a vec3 with z explicitly set (usually 0), not a vec2.

So:
•	A “2D” layout is just a layout where z is constant (or computed in some simple way).
•	A “3D” layout is one where z is meaningful and varies per lane.

5.2 2D Layout + Z as Fields

The canonical pattern is:
1.	Use existing 2D layout logic to build a 2D field:
•	position2D: Field<vec2> over instance I,
•	constructed from:
•	index / normalizedIndex intrinsics,
•	circle/line/grid kernels, etc.
2.	Build a Z field explicitly:
•	depthOrHeight: Field<float> over instance I,
•	using arbitrary expressions: map of normalizedIndex, noise, etc.
3.	Combine into worldPosition: Field<vec3> via a 3D composition kernel.

This keeps x,y and z completely symmetric at the type level: they are just components of a vec3.

⸻

6. 3D Composition Kernel

6.1 composeWorldPosition3 Kernel

Name: 'composeWorldPosition3'

Purpose:

Combine a 2D position field and a scalar Z field into a canonical Field<vec3> world position.

Inputs:
•	Fields (via FieldExprZip):
1.	position2D: Field<vec2> over instance I
•	payload: 'vec2'
•	cardinality.many.instance = I
2.	zField: Field<float> over the same instance I
•	payload: 'float'
•	cardinality.many.instance = I

No additional signals are required.

Output:
•	worldPosition: Field<vec3> over instance I.

Per-lane computation (lane i):

Let:
•	px = position2D[2*i + 0]
•	py = position2D[2*i + 1]
•	pz = zField[i]

Optionally clamp to [0,1] (canonical behavior):
•	x = clamp(px, 0, 1)
•	y = clamp(py, 0, 1)
•	z = clamp(pz, 0, 1)

Write:
•	worldPosition[3*i + 0] = x
•	worldPosition[3*i + 1] = y
•	worldPosition[3*i + 2] = z

Note: This is just one kernel; you’re free to also construct vec3 positions via other field expressions (e.g., zip 3 scalar fields directly). The canonical layout stack uses this kernel because it maps directly from your existing 2D layouts.

⸻

7. Camera: 3D → 2D Projection + Depth

We define one camera projection path:

worldPosition: Field<vec3> → screenPosition: Field<vec2> + viewDepth: Field<float>

The camera itself is controlled by signals that can be driven from UI (mouse drag, modifier keys, etc.). The UX limitation “not a full free camera” is enforced by how those signals are generated, not by weakening the projection math.

7.1 Camera Parameter Signals

Camera is parameterized by:
•	camPos: Signal<vec3> — camera position in world space.
•	camTarget: Signal<vec3> — point the camera is looking at.
•	camUp: Signal<vec3> — up vector (normalized).
•	camFovY: Signal<float> — vertical field of view in radians.
•	camAspect: Signal<float> — aspect ratio (width/height).
•	camNear: Signal<float> — near plane distance > 0.
•	camFar: Signal<float> — far plane distance > camNear.

Encoding detail:

Your current payload types don’t yet have vec3 signals in the file you showed, but since we added vec3 as a PayloadType, these are just:
•	CanonicalType with:
•	payload: 'vec3'
•	cardinality.one (signal)
•	continuous temporality.

If you prefer not to expose vec3 signals to the graph initially, you can treat camera parameters as external inputs (similar to mouseX, etc.), but the canonical type here is Signal<vec3> / Signal<float>.

7.2 Internal Matrices (View & Projection)

The detailed matrix math is an internal implementation detail of the camera kernels:
•	A view matrix V is computed from (camPos, camTarget, camUp).
•	A projection matrix P is computed from (camFovY, camAspect, camNear, camFar).

The camera kernels do not expose matrices as first-class payload types. They simply use them internally to transform each worldPosition lane.

You do not need a mat4 payload type; this is pure implementation in the kernel.

7.3 Projection Kernel: projectWorldToScreen

Name: 'projectWorldToScreen'

Purpose:

Transform Field<vec3> world positions into Field<vec2> normalized screen coordinates using a standard perspective camera.

Inputs:
•	Field:
•	worldPosition: Field<vec3> over instance I.
•	Signals (camera parameters):
•	camPos: Signal<vec3>
•	camTarget: Signal<vec3>
•	camUp: Signal<vec3>
•	camFovY: Signal<float>
•	camAspect: Signal<float>
•	camNear: Signal<float>
•	camFar: Signal<float>

Output:
•	screenPosition: Field<vec2> over instance I.

Per-lane computation (conceptual):
1.	Build V (view matrix) from camPos, camTarget, camUp using standard look-at.
2.	Build P (projection matrix) from camFovY, camAspect, camNear, camFar.
3.	For each lane i:
•	Take w = worldPosition[i] = (wx, wy, wz, 1).
•	Compute clip space c = P * V * w = (cx, cy, cz, cw).
•	Compute normalized device coordinates:
•	nx = cx / cw
•	ny = cy / cw
•	Map to Oscilla screen space [0,1] × [0,1]:
•	sx = 0.5 + 0.5 * nx
•	sy = 0.5 - 0.5 * ny (flip Y so NDC +1 is top)
•	Write:
•	screenPosition[2*i+0] = sx
•	screenPosition[2*i+1] = sy

Assumptions:
•	The kernel clamps or discards values as needed if cw <= 0 or out of frustum; clipping policy is implementation-defined but should be consistent.

7.4 Depth Kernel: projectWorldToDepth

Name: 'projectWorldToDepth'

Purpose:

Derive a per-lane depth value in [0,1] from the same camera transform, for depth sorting and effects.

Inputs:
•	Field:
•	worldPosition: Field<vec3> over instance I.
•	Signals:
•	Same camera parameters as projectWorldToScreen.

Output:
•	viewDepth: Field<float> over instance I.

Per-lane computation (conceptual):

Using the same V and P:
1.	For each lane i:
•	w = worldPosition[i] = (wx, wy, wz, 1).
•	c = P * V * w = (cx, cy, cz, cw).
•	Normalized device depth:
•	nz = cz / cw in [-1, 1].
•	Map to [0,1]:
•	d = 0.5 * nz + 0.5.
•	Optionally clamp:
•	viewDepth[i] = clamp(d, 0, 1).

Renderer policy:
•	You choose whether smaller or larger viewDepth is “closer to camera” (e.g., smaller is closer if using conventional OpenGL-style projection). Sorting direction must be consistent.

⸻

8. Canonical 3D Pipeline per Instance

For any instance I you want in 3D:
1.	Base layout (2D) — unchanged pattern:
•	Produce layout2D: Field<vec2>:
•	Using your canonical 2D layout kernels (line, circle, grid),
•	Using intrinsics (index, normalizedIndex, randomId).
2.	Depth / height field:
•	Produce zField: Field<float> (world Z) over I:
•	Using field expressions, opcodes, or kernels (noise, gradients, etc.).
•	There is no dedicated 3D layout kernel required; z is just another dimension.
3.	Compose world positions:
•	Use composeWorldPosition3 to build worldPosition: Field<vec3> from (layout2D, zField).
4.	Camera projection:
•	Use projectWorldToScreen with camera signals to get:
•	screenPosition: Field<vec2> over I.
•	Use projectWorldToDepth to get:
•	viewDepth: Field<float> over I.
5.	Render sink:
•	screenPosition → StepRender.positionSlot.
•	viewDepth → StepRender.depthSlot (new).
•	Shape/color/size all remain fields/signals over the same InstanceRef I.

The 2D-only case is just zField = 0 and a camera that is “top-down” (appropriate camPos/camTarget). You don’t need a separate spec for 2.5D; it’s just a particular choice of world positions and camera.

⸻

9. StepRender Integration (3D-Aware)

Extend your IR StepRender to include depth, with strict instance alignment:

export interface StepRender {
readonly kind: 'render';
readonly instanceId: string; // InstanceId

/** Screen-space position buffer (after camera) */
readonly positionSlot: ValueSlot;

/** Color buffer */
readonly colorSlot: ValueSlot;

/** Optional size: uniform signal or per-lane slot */
readonly size?:
| { readonly k: 'sig'; readonly id: SigExprId }
| { readonly k: 'slot'; readonly slot: ValueSlot };

/** Shape: uniform topology+params or per-lane field slot */
readonly shape?:
| { readonly k: 'sig'; readonly topologyId: TopologyId; readonly paramSignals: readonly SigExprId[] }
| { readonly k: 'slot'; readonly slot: ValueSlot };

/** Path control points */
readonly controlPoints?: { readonly k: 'slot'; readonly slot: ValueSlot };

/** NEW: per-lane depth for sorting */
readonly depthSlot?: ValueSlot;
}

Type/instance constraints:

For any StepRender:
•	positionSlot must reference a Field<vec2> whose cardinality.many.instance.instanceId === instanceId.
•	If depthSlot is present, it must reference a Field<float> over the same instanceId.
•	Any field-backed colorSlot, shape.slot, controlPoints.slot must also be Field<…> over the same instanceId.

Modes:
•	2D mode: depthSlot absent; renderer draws in some fixed order.
•	3D mode: depthSlot present; renderer uses it for per-instance depth sorting.

⸻

10. Validation Rules (3D)

At compile time:
1.	PayloadType must include 'vec3'.
2.	For any composeWorldPosition3 use:
•	Inputs: Field<vec2> and Field<float> over the same InstanceRef.
•	Output: Field<vec3> over that InstanceRef.
3.	For any projectWorldToScreen use:
•	Input: Field<vec3> over I.
•	Output: Field<vec2> over I.
•	Camera parameters must be Signal<vec3> / Signal<float> with continuous temporality.
4.	For any projectWorldToDepth use:
•	Input: Field<vec3> over I.
•	Output: Field<float> over I.
5.	For any StepRender:
•	positionSlot points to Field<vec2> with instanceId matching StepRender.instanceId.
•	If depthSlot present, it points to Field<float> with the same instanceId.
•	All other fields in that render step are over the same InstanceRef.
6.	No layout or camera behavior may rely on:
•	InstanceDecl.layout.
•	FieldExpr.kind === 'layout'.
•	Intrinsics other than index, normalizedIndex, randomId.

⸻

This gives you a real 3D world extent (vec3), with positions, lanes, and camera semantics that are fully symmetric across x, y, z, while still being compatible with your existing 2D layout system and renderer.