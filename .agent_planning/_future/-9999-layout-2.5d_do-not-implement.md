Good, let’s treat this as a clean 2.5D extension of the spec you just locked in, not a separate half-system.

Below is only the target end-state spec for the “3d-ish” / isometric camera extension. It assumes the 2D spec you already have is in place and unchanged, and it defines exactly what is added.

⸻

Oscilla v2.5 — 2.5D Layout and Camera Extension

1. Scope

This extension specifies:
•	How 3D-ish world positions are represented.
•	How 2D layouts + depth are composed into a 3-component world position.
•	How a 2.5D camera projects world positions into screen coordinates.
•	How depth is provided for sorting and depth-based modulation.
•	How this integrates with the existing Field / Instance machinery and StepRender.

Constraints:
•	World remains fundamentally [0,1] × [0,1] in X/Y.
•	Depth is scalar [0,1], not full 3D free-camera.
•	Projection is an affine “tilted/isometric” transform, not a full perspective matrix.
•	Renderer still consumes 2D positions; 3D-ish behavior is captured via projection + depth.

⸻

2. Additional Payload Type

2.1 vec3 PayloadType

Extend PayloadType with:

export type PayloadType =
| 'float'
| 'int'
| 'vec2'
| 'vec3'    // NEW: 3D vectors
| 'color'
| 'phase'
| 'bool'
| 'unit'
| 'shape'
| '???';

Semantics:
•	vec3 is a 3-component vector of 32-bit floats.
•	Storage per lane is 3 floats (12 bytes), laid out as x, y, z sequentially.

Usage in this extension:
•	Field<vec3> is used for 3D-ish world positions (worldPosition3).

⸻

3. World Coordinates and 2.5D Semantics

3.1 World Position (vec3)

For this extension, a world position is defined as:

worldPosition3 = (x, y, z) with each component in [0,1].

Interpretation:
•	x ∈ [0,1]: horizontal world coordinate (left→right).
•	y ∈ [0,1]: vertical world coordinate (bottom→top).
•	z ∈ [0,1]: depth coordinate (“into the screen”).
•	z = 0 = nearest plane.
•	z = 1 = farthest plane.

All 2.5D layouts and camera operations operate within this normalized cube.

3.2 Relationship to Existing 2D Layout

Existing 2D layout spec defines:
•	position2D: Field<vec2> over some InstanceRef I, with:
•	position2D in [0,1] × [0,1] (world X/Y).
•	Depth is not intrinsic; it is a user field.

This extension:
•	Keeps position2D as defined.
•	Introduces a depth field depth: Field<float> over the same instance I, with values in [0,1].
•	Combines them into worldPosition3: Field<vec3> over I.

The world position is:
•	worldPosition3[i] = (position2D[i].x, position2D[i].y, depth[i]).

⸻

4. Fields and Lanes (3D Extension)

All existing lane semantics remain valid.

For a given instance I with count = N:
•	position2D: Field<vec2> over I is stored in a Float32Array of length 2N.
•	Lane i uses indices 2*i, 2*i+1.
•	depth: Field<float> over I is stored in a Float32Array of length N.
•	Lane i uses index i.
•	worldPosition3: Field<vec3> over I is stored in a Float32Array of length 3N.
•	Lane i uses indices 3*i + 0, 3*i + 1, 3*i + 2.

A lane in this context is:

The triple (x, y, z) of a single element of worldPosition3 for a specific InstanceRef at index i.

Instance alignment rules are identical to the 2D spec:
•	If position2D, depth, and worldPosition3 exist for InstanceRef I, all must have cardinality.many.instance.instanceId === I.id.

⸻

5. Intrinsics (Unchanged)

No new intrinsics are introduced by this extension.
•	Valid intrinsics remain:

export type IntrinsicPropertyName =
| 'index'
| 'normalizedIndex'
| 'randomId';



Depth, height, or world position are not intrinsics. They must be produced by explicit field expressions and kernels.

⸻

6. 2.5D Field Kernels

This extension adds three kernels:
1.	compose2_5DWorldPosition — builds Field<vec3> from 2D position + depth.
2.	project2_5D_position — projects Field<vec3> to screen positions (Field<vec2>).
3.	project2_5D_depth — extracts depth (Field<float>) for sorting.

All are referenced via PureFn:

{ kind: 'kernel'; name: 'compose2_5DWorldPosition' }
{ kind: 'kernel'; name: 'project2_5D_position' }
{ kind: 'kernel'; name: 'project2_5D_depth' }

and implemented in the field kernel registry.

6.1 compose2_5DWorldPosition Kernel

Name: 'compose2_5DWorldPosition'

Purpose:

Combine existing 2D world positions and depth into a 3-component world position field.

Inputs:
•	Fields (via FieldExprZip):
1.	position2D: Field<vec2> over instance I
•	payload: 'vec2'
•	extent.cardinality.kind = 'many'
•	extent.cardinality.instance.instanceId = I.id
•	values in [0,1] × [0,1].
2.	depth: Field<float> over the same instance I
•	payload: 'float'
•	extent.cardinality.kind = 'many'
•	extent.cardinality.instance.instanceId = I.id
•	values in [0,1].
•	No additional signals are required.

Output:
•	worldPosition3: Field<vec3> over instance I:
•	payload: 'vec3'
•	cardinality.many.instance = I
•	temporality = continuous.

Per-lane computation (lane i):

Let:
•	px = position2D[2*i + 0]
•	py = position2D[2*i + 1]
•	dz = depth[i]

Clamp as needed:
•	x = clamp(px, 0, 1)
•	y = clamp(py, 0, 1)
•	z = clamp(dz, 0, 1)

Then:
•	worldPosition3[3*i + 0] = x
•	worldPosition3[3*i + 1] = y
•	worldPosition3[3*i + 2] = z

6.2 Camera Parameters for 2.5D Projection

Projection kernels share a common parameter set, expressed as signals:
•	centerX: Signal<float> — world center X in [0,1].
•	centerY: Signal<float> — world center Y in [0,1].
•	zoom: Signal<float> — positive scalar zoom factor.
•	tiltX: Signal<float> — tilt component in X.
•	tiltY: Signal<float> — tilt component in Y.

Constraints:
•	0 ≤ centerX ≤ 1
•	0 ≤ centerY ≤ 1
•	zoom > 0
•	|tiltX| ≤ tiltMax
•	|tiltY| ≤ tiltMax

tiltMax is a compile-time constant (e.g. tiltMax = 0.75) and defines the maximum allowed magnitude of tilt.

These parameters are passed as signals into the projection kernels.

6.3 project2_5D_position Kernel

Name: 'project2_5D_position'

Purpose:

Project 3D-ish world positions into 2D screen positions with a linear “tilt/isometric” transform.

Inputs:
•	Field:
•	worldPosition3: Field<vec3> over instance I
•	payload: 'vec3'
•	cardinality.many.instance = I
•	temporality = continuous.
•	Signals (camera parameters):
1.	centerX: Signal<float>
2.	centerY: Signal<float>
3.	zoom: Signal<float>
4.	tiltX: Signal<float>
5.	tiltY: Signal<float>

Output:
•	screenPosition2: Field<vec2> over instance I:
•	payload: 'vec2'
•	cardinality.many.instance = I
•	temporality = continuous.

Per-lane computation (lane i):

Extract world position:
•	wx = worldPosition3[3*i + 0] in [0,1]
•	wy = worldPosition3[3*i + 1] in [0,1]
•	wz = worldPosition3[3*i + 2] in [0,1]

Read camera parameters:
•	cx = clamp(centerX, 0, 1)
•	cy = clamp(centerY, 0, 1)
•	s = zoom (must be > 0)
•	tx = clamp(tiltX, -tiltMax, tiltMax)
•	ty = clamp(tiltY, -tiltMax, tiltMax)

Define centered coordinates:
•	dx = wx - cx
•	dy = wy - cy

Apply affine 2.5D transform:
•	sx = 0.5 + s * (dx + wz * tx)
•	sy = 0.5 + s * (dy + wz * ty)

The final sx, sy are not clamped by the kernel (the renderer may clamp or clip them to the viewport).

Write to output:
•	screenPosition2[2*i + 0] = sx
•	screenPosition2[2*i + 1] = sy

This transform:
•	Keeps the core world XY layout semantics.
•	Adds a tilt-dependent shear from z into X/Y.
•	Respects zoom and center as in a 2D camera.

6.4 project2_5D_depth Kernel

Name: 'project2_5D_depth'

Purpose:

Produce a per-lane depth value in [0,1] consistent with the 2.5D world position, for sorting and depth-based modulation.

Inputs:
•	Field:
•	worldPosition3: Field<vec3> over instance I (same as above).
•	Signals:
•	None required; depth is derived solely from z.

Output:
•	depthView: Field<float> over instance I:
•	payload: 'float'
•	cardinality.many.instance = I
•	temporality = continuous.

Per-lane computation (lane i):

Extract z:
•	wz = worldPosition3[3*i + 2]

Clamp:
•	d = clamp(wz, 0, 1)

Write to output:
•	depthView[i] = d

Renderer semantics:
•	A lower or higher depth can be chosen as “in front” consistently; this is a renderer policy (e.g., higher d = farther, so sort ascending or descending accordingly). The kernel only defines d ∈ [0,1] as a normalized depth value.

⸻

7. 2.5D Pipeline Structure

For any instance I, the canonical 2.5D path is:
1.	2D Layout (unchanged from base spec):
•	Produce position2D: Field<vec2> over instance I using existing layout kernels:
•	lineLayout, circleLayout, gridLayout.
2.	Depth Field:
•	Produce depth: Field<float> over instance I via:
•	Intrinsics (index, normalizedIndex, randomId) and
•	Field kernels or opcodes (e.g., mapping normalizedIndex → depth).
•	The exact depth layout is user-controlled; it is not intrinsic.
3.	Compose World Position:
•	Use compose2_5DWorldPosition to generate:
•	worldPosition3: Field<vec3> over I.
4.	Camera Projection:
•	Use project2_5D_position with camera parameter signals to generate:
•	screenPosition2: Field<vec2> over I.
•	Use project2_5D_depth to generate:
•	depthView: Field<float> over I.
5.	Render Sink:
•	Wire screenPosition2 into StepRender.positionSlot.
•	Wire depthView into StepRender.depthSlot (see next section).
•	All other fields (color, size, shape, control points) follow the base spec, and must share instanceId = I.

⸻

8. StepRender Integration

8.1 Extended StepRender Type

Extend existing IR StepRender as:

export interface StepRender {
readonly kind: 'render';
readonly instanceId: string; // InstanceId

// Position buffer (after continuity / camera)
readonly positionSlot: ValueSlot;

// Color buffer (after continuity)
readonly colorSlot: ValueSlot;

// Size
readonly size?:
| { readonly k: 'sig'; readonly id: SigExprId }
| { readonly k: 'slot'; readonly slot: ValueSlot };

// Shape
readonly shape?:
| { readonly k: 'sig'; readonly topologyId: TopologyId; readonly paramSignals: readonly SigExprId[] }
| { readonly k: 'slot'; readonly slot: ValueSlot };

// Path control points for path topologies
readonly controlPoints?: { readonly k: 'slot'; readonly slot: ValueSlot };

// NEW: Depth buffer for 2.5D rendering
readonly depthSlot?: ValueSlot;
}

8.2 2D vs 2.5D Modes

StepRender has two modes, distinguished by the presence of depthSlot:
•	2D mode:
•	depthSlot is absent.
•	Renderer draws elements in their evaluation order (or any fixed policy), with no depth sorting.
•	2.5D mode:
•	depthSlot is present and must satisfy:
•	The slot holds a Field<float> over instanceId.
•	Renderer uses depthSlot to perform depth sorting for this instance:
•	Sorting order (front-to-back or back-to-front) is fixed at the renderer level and must be consistent across frames.

8.3 Type and Instance Consistency

For 2.5D mode, type checks must enforce:
•	positionSlot → Field<vec2> over instanceId.
•	depthSlot → Field<float> over instanceId.
•	Any field-backed colorSlot, shape.slot, controlPoints.slot → fields over the same instanceId.

If any field wired into the StepRender for a given step is over a different instance, compilation fails with an explicit diagnostic.

⸻

9. Validation Rules (2.5D)

At compilation time:
1.	For any compose2_5DWorldPosition use:
•	Input fields must be:
•	Field<vec2> and Field<float> over the same instance I.
•	Output must be:
•	Field<vec3> over I.
2.	For any project2_5D_position use:
•	Input must be Field<vec3> over I.
•	Output must be Field<vec2> over I.
•	Camera parameters are Signal<float> values with clamps as specified (center in [0,1], tiltX/tiltY in [-tiltMax, tiltMax], zoom > 0).
3.	For any project2_5D_depth use:
•	Input must be Field<vec3> over I.
•	Output must be Field<float> over I.
4.	For any StepRender in 2.5D mode (with depthSlot present):
•	depthSlot points to a Field<float> whose cardinality.many.instance.instanceId === instanceId.
•	positionSlot points to Field<vec2> whose cardinality.many.instance.instanceId === instanceId.
5.	No layout or camera behavior may rely on:
•	InstanceDecl.layout.
•	FieldExpr.kind === 'layout'.
•	Intrinsics beyond index, normalizedIndex, randomId.

⸻

This extension gives you a fully specified 2.5D pipeline: 2D layouts + explicit depth → 3D-ish world positions → camera projection → screen positions + depth for sorting, with no hidden behavior and a single, clear place where the “3D-ish” magic happens.