Camera Integration Spec v1.0 (Strict, Non-Optional, No Special-Case Execution Paths)

This spec defines a Camera block that integrates into compilation, runtime, debug, and rendering using the same slot + schedule mechanisms as every other signal, with a single deterministic “render globals resolution” stage that is data-driven from IR (not a one-off camera hack).

⸻

0) Definitions and invariants
	•	Signal slot storage is numeric and typed by CanonicalType.
	•	All camera parameters are ordinary one+continuous signals whose values are produced by regular schedule steps (StepEvalSig or the existing canonical equivalent).
	•	The renderer never “evaluates camera expressions” directly. It only reads already-written slot values using slotMeta.
	•	Camera integration is expressed in IR as data (“render globals declarations”), not as special behavior in the executor.

⸻

1) Type System Extensions

1.1 PayloadType additions

Add a new payload type:
	•	cameraProjection (enum payload)

Update PayloadType union to include:
	•	cameraProjection

1.2 Unit model (camera-relevant units)

For float payloads, unit identifiers exist exactly as strings in type.unit.kind:
	•	scalar (unbounded real)
	•	norm01 (normalized 0..1)
	•	deg (degrees)

For cameraProjection, there is no unit.

1.3 Enum contract: cameraProjection

cameraProjection is stored as an integer value in the slot and interpreted as:
	•	0 → ORTHO
	•	1 → PERSP

Runtime sanitization rule (deterministic, no ambiguity):
	•	If the stored numeric value is not exactly 0 or 1 after integer conversion, the effective projection is ORTHO.

Integer conversion rule:
	•	projI32 = (value | 0) (bitwise int32 truncation).

1.4 Extent guard for camera parameters

Every camera parameter port has resolved extent:
	•	cardinality.kind = 'one'
	•	temporality.kind = 'continuous'

Any attempt to wire a non-matching extent is a compile-time type error.

⸻

2) Camera Block Definition

2.1 Block identity and uniqueness
	•	Block type id: Camera
	•	Exactly zero or one Camera block exists in a compiled program.
	•	If more than one Camera block exists in the normalized graph, compilation fails with a diagnostic:
	•	code: E_CAMERA_MULTIPLE
	•	message: “Only one Camera block is permitted.”

2.2 Ports (all required, no outputs)

Inputs (all are signals, scalar, continuous):
	1.	projection: one+continuous<cameraProjection>
	•	Default source: Const<cameraProjection>(0) (ORTHO)
	2.	centerX: one+continuous<float unit=norm01>
	•	Default source: Const<float unit=norm01>(0.5)
	3.	centerY: one+continuous<float unit=norm01>
	•	Default source: Const<float unit=norm01>(0.5)
	4.	distance: one+continuous<float unit=scalar>
	•	Default source: Const<float unit=scalar>(2.0)
	5.	tiltDeg: one+continuous<float unit=deg>
	•	Default source: Const<float unit=deg>(35.0)
	6.	yawDeg: one+continuous<float unit=deg>
	•	Default source: Const<float unit=deg>(0.0)
	7.	fovYDeg: one+continuous<float unit=deg>
	•	Default source: Const<float unit=deg>(45.0)
	8.	near: one+continuous<float unit=scalar>
	•	Default source: Const<float unit=scalar>(0.01)
	9.	far: one+continuous<float unit=scalar>
	•	Default source: Const<float unit=scalar>(100.0)

Outputs: none.

2.3 No implicit adapters
	•	A float cannot connect to cameraProjection.
	•	If a user wants float-driven projection switching, they must use explicit blocks in the patch (outside this spec).

⸻

3) IR: Render Globals Declaration (Data-Driven Integration)

3.1 New IR type

Add to compiler IR:

export interface CameraDeclIR {
  kind: 'camera';
  projectionSlot: ValueSlot;
  centerXSlot: ValueSlot;
  centerYSlot: ValueSlot;
  distanceSlot: ValueSlot;
  tiltDegSlot: ValueSlot;
  yawDegSlot: ValueSlot;
  fovYDegSlot: ValueSlot;
  nearSlot: ValueSlot;
  farSlot: ValueSlot;
}

Add to CompiledProgramIR:

renderGlobals: readonly CameraDeclIR[];

Constraints:
	•	renderGlobals.length is 0 or 1.
	•	If renderGlobals.length === 1, renderGlobals[0].kind === 'camera'.

No nullable slots exist in CameraDeclIR. Defaults are handled by default sources at the graph/type level, so every port compiles to a concrete slot.

⸻

4) Lowering and Schedule Emission

4.1 Lowering rule (Camera block)

During lowering, the Camera block performs exactly these actions:
	1.	For each input port p in the fixed list above:
	•	Emit normal signal evaluation steps that produce a value in a ValueSlot for p.
	•	The emitted steps are the same mechanism used by any other signal-producing connection (StepEvalSig or the existing canonical equivalent).
	2.	Return a CameraDeclIR containing the nine output slots corresponding to the nine evaluated port values.

4.2 Camera decl collection (compiler pass)

A dedicated compiler pass (or the existing pass that finalizes program metadata) does:
	•	Scan lowered results for Camera block declarations.
	•	Enforce uniqueness (error if >1).
	•	Set:
	•	program.renderGlobals = [] if no camera
	•	program.renderGlobals = [cameraDecl] if exactly one

4.3 Schedule ordering invariant
	•	All steps that write the nine camera slots execute before any render assembly step that consumes program.renderGlobals.

This is enforced by the scheduler’s existing dependency ordering: camera slots are produced by normal signal steps that run in the signal phase, and render assembly happens after signal evaluation.

⸻

5) Runtime: Frame Globals Resolution

5.1 FrameGlobals structure

At runtime, each frame produces:

export interface ResolvedCameraParams {
  projection: 'ortho' | 'persp';
  centerX: number;   // norm01
  centerY: number;   // norm01
  distance: number;  // scalar
  tiltRad: number;   // radians
  yawRad: number;    // radians
  fovYRad: number;   // radians
  near: number;      // scalar
  far: number;       // scalar
}

5.2 Deterministic sanitization rules (no ambiguity)

When reading slot values, the runtime applies these exact transforms:
	•	centerX = clamp01(read(centerXSlot))
	•	centerY = clamp01(read(centerYSlot))
	•	distance = max(read(distanceSlot), 0.0001)
	•	tiltDeg = clamp(read(tiltDegSlot), -89.9, 89.9)
	•	yawDeg = wrapDegrees(read(yawDegSlot)) where wrapDegrees(d) = ((d % 360) + 360) % 360
	•	fovYDeg = clamp(read(fovYDegSlot), 1.0, 179.0)
	•	near = max(read(nearSlot), 0.000001)
	•	farRaw = read(farSlot)
	•	far = max(farRaw, near + 0.000001)

Convert:
	•	tiltRad = tiltDeg * (π / 180)
	•	yawRad  = yawDeg  * (π / 180)
	•	fovYRad = fovYDeg * (π / 180)

Projection:
	•	projI32 = (read(projectionSlot) | 0)
	•	projection = (projI32 === 1) ? 'persp' : 'ortho'

5.3 Resolution mechanism (data-driven)

Per frame, after schedule execution:
	1.	Runtime iterates program.renderGlobals.
	2.	For each entry:
	•	If kind === 'camera', read its slots using slotMeta offsets and apply the sanitization rules above.
	3.	Store result into a FrameGlobals object for the render assembler to consume.

There is no other camera code path.

⸻

6) Render Assembler Integration

6.1 No executeFrame camera parameter
	•	executeFrame takes no camera parameter.
	•	The assembler reads resolved camera params from the frame globals resolved from program.renderGlobals.

6.2 Default camera behavior (no Camera block)

If program.renderGlobals.length === 0, the resolved camera is exactly:
	•	projection = 'ortho'
	•	centerX = 0.5
	•	centerY = 0.5
	•	distance = 2.0
	•	tiltRad = 0
	•	yawRad = 0
	•	fovYRad = 45° in radians
	•	near = 0.01
	•	far = 100

These defaults are applied in the frame globals resolver, not in the assembler.

6.3 Projection math contract
	•	Ortho path:
	•	Uses identity view and ortho projection (no perspective divide).
	•	Perspective path:
	•	Uses a look-at camera oriented by (tiltRad, yawRad) at distance distance from the scene target.
	•	Uses vertical FOV fovYRad and clipping planes near, far.

Screen centering contract (applies to both projections after NDC computation):
	•	After projecting to NDC (x,y in [-1,1]):
	•	screenX = (ndcX * 0.5 + centerX) * viewportWidth
	•	screenY = (-ndcY * 0.5 + centerY) * viewportHeight

This makes (centerX, centerY) the normalized screen location of NDC origin.

⸻

7) Debug and UI Integration

7.1 Debug metadata

mapDebugEdges / port mapping must expose camera parameter edges like any other signal edge:
	•	Each camera input edge is a normal edge mapping to a slot.
	•	Debug mini-view shows:
	•	type line for the slot (cameraProjection, float unit=deg, etc.)
	•	current value from DebugService snapshot
	•	signal history sparkline (since these are scalar signals)

7.2 ValueRenderer support (minimum required)
	•	cameraProjection renderer:
	•	Displays ORTHO for 0, PERSP for 1, ORTHO for all other int values (reflecting runtime rule).
	•	float renderer displays unit tags:
	•	deg, norm01, scalar

⸻

8) Test Requirements (Deterministic)
	1.	No Camera block
	•	program.renderGlobals.length === 0
	•	resolved camera equals the default set in §6.2
	2.	One Camera block
	•	program.renderGlobals.length === 1
	•	slots exist for all nine inputs
	•	changing any input signal changes the resolved camera parameter deterministically
	3.	Two Camera blocks
	•	compilation fails with E_CAMERA_MULTIPLE
	4.	Projection enum
	•	projectionSlot value 0 → ortho
	•	projectionSlot value 1 → persp
	•	projectionSlot value 2, -1, NaN, Infinity → ortho
	5.	Sanitization
	•	tilt clamps to [-89.9, 89.9]
	•	fov clamps to [1, 179]
	•	far becomes >= near + eps
	6.	No special evaluation paths
	•	There is no runtime path that computes camera parameters by directly evaluating expressions outside the schedule/slot system.

⸻

This is the complete strict integration spec that makes camera parameters first-class signal values, uses IR declarations to connect them to rendering, and avoids any separate evaluation mechanism or ad-hoc camera execution logic.