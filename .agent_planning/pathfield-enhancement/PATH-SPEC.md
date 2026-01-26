Your analysis is mostly accurate and it’s clear you actually traced the real data/metadata boundaries. The main place it goes off the rails is what you’re trying to compute and where it belongs.

What you got right
	•	Topology is not present at materialization time today. Your description of Materializer / applyFieldKernel / InstanceDecl is consistent with the current architecture: a field expression materializes to buffers, and kernels don’t get “shape semantics.”
	•	Intrinsics can’t do neighbor-dependent things. Tangent/arc-length require at least i±1 access, so they don’t fit the intrinsic model.
	•	A “new FieldExpr kind computed in Materializer” is the least invasive way to get neighbor-based derived buffers. That part is directionally correct.

The big conceptual mismatch

1) “Tangent at control point index i” is not well-defined without a curve model

For polygons, a vertex has two incident edges, so “the tangent” is ambiguous unless you pick a convention:
	•	edge-in tangent (from i-1 → i)
	•	edge-out tangent (from i → i+1)
	•	averaged/central-difference tangent (your (p[i+1]-p[i-1])/2)

All are valid, but they are different fields and the choice matters visually.

For Béziers, it’s worse: control points are not points on the curve (except endpoints), and “tangent at control point” is usually meaningless. The tangent is defined along the curve parameter t, not at control-point indices.

So: if the block is named PathField, you want tangents and arc-length as functions of path parameterization, not control-point indices.

2) “Arc length per control point index” is not the arc length of the path

Your proposed arc-length implementation is “cumulative polyline distance along the control polygon.” That’s useful, but it is not the geometric arc length of a Bézier curve, and it is not even the “length along the path” unless the path itself is defined as that polyline.

So you need to be explicit: you are adding control polygon metrics, not path metrics.

That’s fine for MVP—just don’t pretend it’s the general solution for a Path.

Where this should live architecturally

Your Approach B is directionally correct, but the name and placement should be tightened

If you do it as a new IR node and compute in Materializer, that’s consistent with the “field expression evaluation” layer.

But don’t call it “pathDerivative” unless you actually have a path model at materialization time. Right now you only have buffers; you don’t have verbs/segments/closure semantics, unless you explicitly add them.

What you’re really implementing in MVP is:
	•	Neighbor-derived field ops (stencil ops) over an instance-bound field buffer.

That suggests the new IR kind should be something like:
	•	fieldStencilUnary or fieldNeighborOp
	•	operations: tangentCentral, tangentForward, tangentBackward, arcLengthPolyline, curvatureDiscrete (later)

That makes it truthful: it’s a buffer-level neighbor op, not a path semantic op.

A5-level correctness constraints you should add (or you’ll regret it)

1) Closure semantics must be explicit

Your tangent logic wraps ((i+1)%N) which assumes a closed loop. But your system already has path topology flags (closed) at the shape level—just not available here.

So you must choose one of these and encode it explicitly in the IR node:
	•	wrap: true|false
If wrap=false, endpoints need defined behavior:
	•	forward difference at 0, backward at N-1, or clamp, or zero.

If you don’t encode this, you will end up with silent, inconsistent results across blocks and future path types.

2) Stride-aware types must be enforced

Your tangent output is vec2, arc length output is float. That implies:
	•	input is vec2 field (stride 2)
	•	output stride is fixed per op

Materializer currently materializes buffers based on type metadata; your new node must assert:
	•	input payload is float and unit kind is scalar (or explicitly unit-preserving rules)
	•	extent matches instance binding
	•	stride matches vec2 for tangent input

If you skip this and rely on “it’s always vec2,” you’ll get the same class of failures you’ve been cleaning elsewhere.

3) Units: decide what happens

Positions likely have unit scalar today, but if you ever introduce float<world> or similar, then:
	•	tangent has same unit as position (delta in same space), then optionally normalized unitless direction
	•	arc length has same unit as position magnitude

If you don’t decide now, your strict unit system will force you to patch later.

Minimum spec now:
	•	tangent unit = input unit
	•	arcLength unit = input unit
	•	optional tangentNormalized unit = scalar

4) O(N) derived buffers are fine; O(N²) is forbidden

Arc length as cumulative sum is O(N), OK. Anything that tries to approximate Bézier arc length per segment by iterative subdivision inside materialization risks blowing up per-frame time if N is large.

So: keep MVP neighbor ops strictly O(N).

Your Approach A is wrong for your current architecture goals

You correctly note the cost: threading instanceId/topology through kernels breaks the “pure kernel over buffers” separation and leaks rendering/shape semantics into field evaluation.

More importantly, it sets you up for a long-term mess:
	•	kernel behavior becomes dependent on external registries
	•	caching becomes trickier
	•	reproducibility/debugging becomes harder

If you ever need true Bézier tangents/arc length, it should come from a different abstraction: a sampled curve field (evaluate position at parameter t), not “control points with topology knowledge injected into kernels.”

What I would change in your writeup (surgical edits to the plan)
	1.	Rename the work:

	•	From “PathField tangent/arcLength”
	•	To “ControlPointField neighbor-derived metrics (MVP)”

	2.	Define outputs precisely:

	•	tangentCentral (vec2): p[i+1]-p[i-1] (with explicit wrap policy)
	•	tangentForward (vec2): p[i+1]-p[i]
	•	arcLengthPolyline (float): cumulative sum of segment lengths along the control polygon or open polyline (explicit wrap policy)

Even if you only expose one in UI, the IR should encode which one it is.
	3.	Make the new IR node generic neighbor-op, not path-op:

	•	It should be usable for other domains too (particles, polyline samples, etc.), not just “paths.”

	4.	Encode closure behavior in the node:

	•	wrap: boolean and maybe endpointPolicy: 'clamp'|'zero'|'oneSided'

	5.	Keep “real path tangents/arc length” as a separate future feature:

	•	That future feature likely introduces an explicit “ParametricPath” representation (verbs/segments) and a “SamplePath” block that produces a Field over samples, not control points.

Summary judgment
	•	Your diagnosis of where topology does/doesn’t exist is correct.
	•	Your recommendation (compute neighbor-derived outputs in Materializer via a new FieldExpr kind) is the right architectural shape.
	•	The naming and semantics are currently misleading: what you can compute without topology is control polygon stencils, not “path derivatives” in the general sense.
	•	If you tighten the spec around closure, stride, and units now, you won’t have to redo it later.

That is the feedback.

====


Rewrite: What work you should actually do

Goal

Make paths a first-class, queryable object in the graph so downstream blocks can reliably derive geometry-driven fields (position along path, tangent, normal, distance, etc.) without smuggling topology through unrelated systems.

Non-goal

Do not add “tangent/arcLength of control points” as a one-off. That’s control-polygon math, not path math, and it will create dead-end APIs the moment you add real curves or even open paths.

⸻

Canonical model to implement

1) Introduce an explicit Path value type

A Path is not a Field<vec2>. A Field<vec2> is just samples. A Path is a structured object with semantics.

Path contains:
	•	topologyId (or directly embedded verbs + pointsPerVerb + closed)
	•	controlPoints (a Field<vec2> over DOMAIN_CONTROL)
	•	closed: boolean (must be explicit, not inferred)
	•	Optional in the future: per-segment flags, stroke joins, etc.

This is a value in the type system, like shape2d is. It can be stored in an object slot.

⸻

2) Make “PathField” stop being a fake path

Rename / re-scope it.

Current PathField (pass-through controlPoints + index) is really:
	•	ControlPoints block: “I have a control-point instance, give me its points and index.”

That block is fine, but it’s not a path operator.

So implement:
	•	Block: PathFromControlPoints
	•	input: controlPoints: Field<vec2>
	•	inputs: topologyId (or shape/pathTopology selector), closed if needed
	•	output: path: Signal<Path> (a structured object)

And keep:
	•	Block: ControlPointIndex (or just keep fieldIntrinsic(index) access pattern)

⸻

3) All the interesting stuff becomes “query blocks” over Path

Derived quantities should be queries on a path, not special intrinsics, not special kernel hacks.

Implement blocks like:
	•	SamplePathPosition
	•	SamplePathTangent
	•	SamplePathNormal
	•	SamplePathArcLength / SamplePathUtoS / SamplePathStoU

But crucially: these blocks operate over a parameter domain, not the control-point domain.

So the inputs look like:
	•	path: Signal<Path>
	•	u: Field<float<phase01>> over DOMAIN_SAMPLES (or whatever domain the user wants)
	•	outputs: Field<vec2>, Field<vec2>, Field<float>, etc. bound to the u instance

This is how you avoid the entire “neighboring control points” mess: the parameterization defines what “tangent” and “arc length” even mean.

⸻

4) Runtime placement: compute these in Materializer, not kernels

You do not need to push topology into the generic kernel system.

Instead, add a new FieldExpr that is explicitly “path query” and materialize it in a dedicated evaluator inside Materializer.ts:
	•	FieldExprKind: 'pathSample'
	•	pathSlot: ValueSlot (object slot containing Path)
	•	uField: FieldExprId
	•	op: 'position' | 'tangent' | 'normal' | 'arcLength'
	•	type: SignalType (stride + unit)

Materializer can:
	•	materialize uField into a Float32Array
	•	read Path object from slot
	•	fetch topology from registry via topologyId (Materializer can import registry; it’s allowed because this evaluator is path-specific, not a generic kernel)
	•	produce output buffer(s)

This keeps the “pure buffer kernel” system intact for generic math, while path semantics live in a path evaluator.

⸻

5) Sampling contract that avoids redo in 2 months

You need one firm contract that everything else can rely on.

Contract:
	•	A Path is evaluated in local space.
	•	u ∈ [0,1] maps monotonically along the path’s contour.
	•	position(u) returns a point on the rendered curve (not control polygon).
	•	tangent(u) is the derivative of position(u) w.r.t. u, optionally normalized if you define that variant.
	•	arcLength(u) returns distance along the curve from u=0 to u.

If you don’t want full Bézier arc length yet, you can implement a stable approximation inside the path evaluator (polyline flattening per segment with a fixed subdivision count), but the API stays the same.

That’s how you avoid redoing everything: you upgrade the evaluator’s accuracy later without changing the graph model.

⸻

Why you care (actual uses)

If you don’t have these, you can still draw shapes, but you can’t do “path-driven animation” cleanly. These are the practical things they enable:
	1.	Motion along a path

	•	Move instances along a curve using position(u) where u is time + offset.
	•	This is the backbone of “orbit”, “follow”, “text-on-path”, “snake”, “flow fields constrained to splines”.

	2.	Orientation and steering

	•	Use tangent(u) to rotate sprites/particles so they “face along” the curve.
	•	Use normal(u) for offsets to create ribbons, outlines, double-strokes, road lanes, tubes, beveled extrusion illusions.

	3.	Even spacing

	•	Arc length lets you place N items evenly along a curve (equal distance, not equal parameter).
	•	Without arc length, spacing visibly bunches up on curves.

	4.	Procedural geometry from paths

	•	Extrusion (2.5D bevels), strokes with variable width, dashed patterns, “tube” meshes in WebGL all need tangent/normal.

	5.	Editing ergonomics

	•	Artists edit control points; the system provides derived fields. They don’t hand-author tangents or per-vertex metadata.

So the “why” is: it unlocks a whole class of animation and geometry workflows that are otherwise awkward or impossible without ad-hoc special cases.

⸻

What to do next (as a rewrite of the ticket)

Ticket: “Make Path a first-class value + add path sampling queries”

Deliverables
	•	Path value type in the type system and runtime
	•	PathFromControlPoints block producing Signal<Path>
	•	PathSamplePosition block: (path, uField) -> Field<vec2>
	•	PathSampleTangent block: (path, uField) -> Field<vec2>
	•	Materializer support for FieldExprPathSample

Acceptance criteria
	•	A demo patch: create a path, sample position with u = normalizedIndex, render instances at sampled positions.
	•	A second demo: rotate instances by tangent direction.
	•	No topology plumbing into generic field kernels.
	•	No dependence on control-point neighbor hacks.

That’s the work you should be doing.