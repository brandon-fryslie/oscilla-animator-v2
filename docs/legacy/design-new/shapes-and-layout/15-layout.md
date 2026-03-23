Below is the final spec, in two parts as requested:
1.	Target End-State Spec (what the system is when we’re done)
2.	Migration Plan (how to get from current code to that state)

It is self-contained and does not rely on this or any other conversation.

⸻

Part 1 — Target End-State Spec

1. Scope and Goals

This spec defines the layout and shape placement system in Oscilla v2.5:
•	How instances, fields, and lanes are represented.
•	How layout is expressed only as field expressions + kernels.
•	How positions are defined and associated with shapes.
•	How intrinsics work and what is allowed.
•	How layout data flows into the renderer via StepRender.

Non-goals (out of scope for this spec):
•	Continuity system internals.
•	Full shape topology registry.
•	UI/UX representation of blocks.

⸻

2. Core Types and Terminology

2.1 PayloadType and CanonicalType

From the canonical type system:

export type PayloadType =
| 'float'
| 'int'
| 'vec2'
| 'color'
| 'phase'
| 'bool'
| 'unit'
| 'shape'
| '???';

export interface CanonicalType {
readonly payload: PayloadType;
readonly extent: Extent;
readonly unit?: NumericUnit;
}

For this spec:
•	Position fields use payload: 'vec2'.
•	Shape signals / fields use payload: 'shape'.
•	All layout-related fields have continuous temporality.

2.2 Instances and InstanceRef

From the canonical type system:

export interface InstanceRef {
readonly kind: 'instance';
readonly domainType: string; // DomainTypeId
readonly instanceId: string; // InstanceId
}

Instances represent collections of elements (particles, shapes, etc.). An InstanceRef identifies a specific instance. The instance ID is the anchor used to align fields such as shape and position.

2.3 Cardinality and Extent

From the canonical type system:

export type Cardinality =
| { readonly kind: 'zero' }
| { readonly kind: 'one' }
| { readonly kind: 'many'; readonly instance: InstanceRef };

export interface Extent {
readonly cardinality: AxisTag<Cardinality>;
readonly temporality: AxisTag<Temporality>;
readonly binding: AxisTag<Binding>;
readonly perspective: AxisTag<PerspectiveId>;
readonly branch: AxisTag<BranchId>;
}

Key points for layout:
•	A field over an instance has cardinality: { kind: 'many'; instance: InstanceRef }.
•	All layout and position fields use:
•	cardinality.many.instance = the instance they belong to.
•	temporality = continuous.

2.4 Definition of “Lane”

Lane is an abstract term for:

One element of a Field<…> over a given InstanceRef at a specific index i.

Concretely:
•	For an InstanceDecl with count = N:
•	A scalar field (payload: 'float') over this instance is stored as a Float32Array of length N.
•	Lane i corresponds to array[i].
•	A vec2 field is stored as a Float32Array of length 2N.
•	Lane i corresponds to (array[2*i], array[2*i + 1]).
•	A color field is stored as a Uint8ClampedArray or Float32Array of length 4N.
•	Lane i corresponds to (array[4*i + 0..3]).

A lane is not a separate runtime type; it is the conceptual unit of per-instance data at index i in the field storage for that InstanceRef.

⸻

3. Field and Signal Expressions (IR Layer)

3.1 Signal Expressions (SigExpr)

Relevant to shapes and layout:

export type SigExpr =
| SigExprConst
| SigExprSlot
| SigExprTime
| SigExprExternal
| SigExprMap
| SigExprZip
| SigExprStateRead
| SigExprShapeRef;

export interface SigExprShapeRef {
readonly kind: 'shapeRef';
readonly topologyId: TopologyId;
readonly paramSignals: readonly SigExprId[];
readonly controlPointField?: FieldExprId;
readonly type: CanonicalType; // payload 'shape'
}

	•	SigExprShapeRef is the scalar representation of a shape:
	•	topologyId refers to a registered topology.
	•	paramSignals provide parameter values per frame.
	•	controlPointField is a reference to a field of path control points (local space).

3.2 Field Expressions (FieldExpr)

The IR defines:

export type FieldExpr =
| FieldExprConst
| FieldExprIntrinsic
| FieldExprBroadcast
| FieldExprMap
| FieldExprZip
| FieldExprZipSig
| FieldExprArray
| FieldExprLayout; // legacy, to be removed (see migration plan)

Target end state:
•	FieldExprLayout is removed.
•	Layout is expressed using:
•	FieldExprIntrinsic (for index, normalizedIndex, randomId).
•	FieldExprBroadcast (lift signals to fields).
•	FieldExprMap, FieldExprZip, FieldExprZipSig combined with field kernels.

Relevant existing definitions:

export interface FieldExprIntrinsic {
readonly kind: 'intrinsic';
readonly instanceId: InstanceId;
readonly intrinsic: IntrinsicPropertyName;
readonly type: CanonicalType;
}

export interface FieldExprBroadcast {
readonly kind: 'broadcast';
readonly signal: SigExprId;
readonly type: CanonicalType;
}

export interface FieldExprMap {
readonly kind: 'map';
readonly input: FieldExprId;
readonly fn: PureFn;
readonly type: CanonicalType;
readonly instanceId?: InstanceId;
}

export interface FieldExprZip {
readonly kind: 'zip';
readonly inputs: readonly FieldExprId[];
readonly fn: PureFn;
readonly type: CanonicalType;
readonly instanceId?: InstanceId;
}

export interface FieldExprZipSig {
readonly kind: 'zipSig';
readonly field: FieldExprId;
readonly signals: readonly SigExprId[];
readonly fn: PureFn;
readonly type: CanonicalType;
readonly instanceId?: InstanceId;
}

export interface FieldExprArray {
readonly kind: 'array';
readonly instanceId: InstanceId;
readonly type: CanonicalType;
}

3.3 Intrinsics

In the target system, intrinsics are limited to:

export type IntrinsicPropertyName =
| 'index'
| 'normalizedIndex'
| 'randomId';

Semantics:
•	index:
•	payload: 'float' with unit '#' (count/index).
•	For an instance with count = N, lane i has value i for i ∈ [0, N-1].
•	normalizedIndex:
•	payload: 'float' with unit 'normalized'.
•	For count = N > 1, lane i has value i / (N - 1) in [0,1].
•	For count = 1, lane 0 has value 0.5.
•	randomId:
•	payload: 'float' with unit 'normalized'.
•	Deterministic pseudo-random value in [0,1] derived from (instanceId, i) and a fixed seed.

Constraints:
•	Intrinsics must be computable from (instanceDecl, index i) only, without referring to:
•	block parameters,
•	graph wiring,
•	time,
•	external inputs.
•	No new intrinsics beyond the three listed may be added without updating the canonical type system and this spec.

IntrinsicPropertyName must not include 'position' or 'radius' in the target end state.

⸻

4. Instance Declarations and Continuity

4.1 InstanceDecl

Target end state InstanceDecl:

export interface InstanceDecl {
readonly id: string;          // InstanceId
readonly domainType: string;  // DomainTypeId
readonly count: number | 'dynamic';
readonly lifecycle: 'static' | 'dynamic' | 'pooled';
readonly identityMode: 'stable' | 'none';
readonly elementIdSeed?: number;
}

Notes:
•	The layout property is removed. Instances do not encode layout.
•	Any spatial hints for continuity (e.g., posHintXY) are maintained by the continuity system, not by layout metadata on the instance.

⸻

5. Layout Engine — Single Source of Truth

5.1 Layout Definition

Layout is defined as:

A Field<vec2> over a specific InstanceDecl, with world-space coordinates in normalized [0,1] × [0,1], produced by field expressions and field kernels.

Concretely:
•	Layout is represented by a FieldExprId whose CanonicalType has:
•	payload: 'vec2',
•	extent.cardinality.kind = 'many',
•	extent.cardinality.instance.instanceId = the InstanceDecl.id,
•	extent.temporality = continuous.

This field is referred to as the position field for that instance.

5.2 Layout Blocks

At the block/graph level:
•	A layout block is a node that:
•	Takes one or more scalar signals and intrinsic fields as inputs.
•	Produces a single output: position: Field<vec2> over a specific instance.

Examples:
•	LineLayout block:
•	Inputs:
•	start: Signal<vec2> (or two signals x0, y0).
•	end: Signal<vec2> (or x1, y1).
•	instance: InstanceRef implicit in the field extent.
•	Output:
•	position: Field<vec2> over that instance.

The compiler lowers such blocks into FieldExpr trees that apply layout field kernels (below) to intrinsic fields.

5.3 Single Layout Engine

In the target system:
•	There is exactly one layout engine: field expressions + field kernels whose output is position: Field<vec2> over an instance.
•	There are no alternative layout mechanisms:
•	No InstanceDecl.layout semantics.
•	No FieldExpr.kind === 'layout'.
•	No position or radius intrinsics.

All layouts are composed from:
•	FieldExprIntrinsic for index, normalizedIndex, randomId.
•	FieldExprBroadcast from signals.
•	FieldExprMap, FieldExprZip, FieldExprZipSig with kernels.

⸻

6. Layout Field Kernels (Line, Circle, Grid)

Field kernels are referenced by PureFn:

export type PureFn =
| { readonly kind: 'opcode'; readonly opcode: OpCode }
| { readonly kind: 'kernel'; readonly name: string }
| { readonly kind: 'expr'; readonly expr: string }
| { readonly kind: 'composed'; readonly ops: readonly OpCode[] };

Layout kernels use kind: 'kernel' and are resolved by name in the field-kernel registry.

6.1 Common Contract

For all layout kernels in this spec:
•	Output CanonicalType:
•	payload: 'vec2'
•	extent.cardinality.kind = 'many'
•	extent.cardinality.instance = instance of the input field.
•	extent.temporality = continuous.
•	World coordinate semantics:
•	x and y are in normalized world coordinates [0,1].
•	(0,0) is bottom-left, (1,1) is top-right; center is (0.5,0.5).
•	No kernel multiplies by viewport dimensions or depends on render target size.

6.2 circleLayout Kernel

Name: 'circleLayout'

Inputs:
•	Field:
•	t: Field<float> with:
•	payload: 'float', unit 'normalized'.
•	Values in [0,1] such as normalizedIndex.
•	cardinality.many.instance = some instance I.
•	Signals:
•	radius: Signal<float>:
•	Unit 'normalized'.
•	Typical range (0, 0.5].
•	phase: Signal<float>:
•	Unit 'radians'.

Output:
•	position: Field<vec2> over instance I.

Per-lane computation (lane index i):

Let:
•	t_i = t[i] clamped to [0,1].
•	θ_i = phase + 2π * t_i.
•	r = radius.

Then:
•	x_i = 0.5 + r * cos(θ_i)
•	y_i = 0.5 + r * sin(θ_i)

Stored in the output Float32Array as:
•	out[2*i + 0] = x_i
•	out[2*i + 1] = y_i

6.3 lineLayout Kernel

Name: 'lineLayout'

Inputs:
•	Field:
•	t: Field<float> with:
•	payload: 'float', unit 'normalized'.
•	Values in [0,1] such as normalizedIndex.
•	cardinality.many.instance = some instance I.
•	Signals:
•	x0: Signal<float> (unit 'normalized').
•	y0: Signal<float> (unit 'normalized').
•	x1: Signal<float> (unit 'normalized').
•	y1: Signal<float> (unit 'normalized').

Output:
•	position: Field<vec2> over instance I.

Per-lane computation (lane index i):

Let:
•	t_i = t[i] clamped to [0,1].

Then:
•	x_i = (1 - t_i) * x0 + t_i * x1
•	y_i = (1 - t_i) * y0 + t_i * y1

Stored as:
•	out[2*i + 0] = x_i
•	out[2*i + 1] = y_i

6.4 gridLayout Kernel

Name: 'gridLayout'

Inputs:
•	Field:
•	k: Field<float> with:
•	payload: 'float', unit '#' or 'scalar'.
•	Values represent integer indices 0..N-1, typically from index intrinsic.
•	cardinality.many.instance = some instance I.
•	Signals:
•	cols: Signal<int> with cols ≥ 1.
•	rows: Signal<int> with rows ≥ 1.

Output:
•	position: Field<vec2> over instance I.

Per-lane computation (lane index i):

Let:
•	idx = clamp(floor(k[i]), 0, totalCount - 1); totalCount is the field length.
•	c = clamp(idx % cols, 0, cols - 1).
•	r = clamp(floor(idx / cols), 0, rows - 1).

Then:
•	If cols > 1:
•	x_i = c / (cols - 1)
•	else:
•	x_i = 0.5
•	If rows > 1:
•	y_i = r / (rows - 1)
•	else:
•	y_i = 0.5

Stored as:
•	out[2*i + 0] = x_i
•	out[2*i + 1] = y_i

This kernel provides a full-screen grid in normalized coordinate space.

⸻

7. Shape System Integration

7.1 Shape Topologies and ShapeRef

From shapes/types.ts:

export type TopologyId = string;

export interface ParamDef {
readonly name: string;
readonly type: 'float' | 'vec2';
readonly default: number;
}

export interface TopologyDef {
readonly id: TopologyId;
readonly params: readonly ParamDef[];
readonly render: (ctx: CanvasRenderingContext2D, params: Record<string, number>) => void;
}

export interface PathTopologyDef extends TopologyDef {
readonly verbs: readonly PathVerb[];
readonly pointsPerVerb: readonly number[];
readonly totalControlPoints: number;
readonly closed: boolean;
}

Runtime reference:

export interface ShapeRef {
readonly topologyId: TopologyId;
readonly paramSlots: readonly number[]; // SlotRef indices
}

	•	Shape geometry (topology + local control points) is local-space.
	•	Layout output (position: Field<vec2>) is world-space.

7.2 Shape in the IR (Signals and Fields)
•	SigExprShapeRef represents a scalar shape:
•	type.payload = 'shape'
•	extent.cardinality.kind = 'one'.
•	A field of shapes (per-instance shape variation) is represented as:
•	a FieldExpr whose CanonicalType has payload: 'shape' and cardinality.many.

The compiler decides whether to:
•	Pass the shape as a scalar (SigExprShapeRef) plus an instance reference, or
•	Materialize a Field<shape> into a slot for per-lane shape variations.

7.3 StepRender and Position/Shape Association

From IR:

export interface StepRender {
readonly kind: 'render';
readonly instanceId: string; // InstanceId
readonly positionSlot: ValueSlot;
readonly colorSlot: ValueSlot;
readonly size?:
| { readonly k: 'sig'; readonly id: SigExprId }
| { readonly k: 'slot'; readonly slot: ValueSlot };
readonly shape?:
| { readonly k: 'sig'; readonly topologyId: TopologyId; readonly paramSignals: readonly SigExprId[] }
| { readonly k: 'slot'; readonly slot: ValueSlot };
readonly controlPoints?: { readonly k: 'slot'; readonly slot: ValueSlot };
}

Target end-state invariants:
•	instanceId is the instance whose elements are rendered.
•	positionSlot contains a Field<vec2>:
•	payload: 'vec2'
•	cardinality.many.instance.instanceId === instanceId.
•	colorSlot (if used) must be a field over the same instance:
•	cardinality.many.instance.instanceId === instanceId.
•	If shape.k === 'slot', that slot must contain a Field<shape> whose cardinality.many.instance.instanceId === instanceId.
•	controlPoints.slot (for path shapes) must also be a field over the same instanceId, typically in local space within the shape domain; the renderer uses it in combination with layout positions.

Association rule:

For each StepRender, all field-backed inputs (positionSlot, colorSlot, field-backed shape, controlPoints) must be fields over the same instance as instanceId. This is how positions and shapes are paired.

⸻

8. Validation Rules

At compilation time:
1.	For any FieldExpr:
•	type.extent.cardinality.kind = 'many' implies a valid InstanceRef.
•	Intrinsics must obey the intrinsic rules (only index/normalizedIndex/randomId).
2.	For any layout field (position):
•	type.payload = 'vec2'.
•	extent.cardinality.kind = 'many'.
•	extent.temporality = continuous.
3.	For any StepRender:
•	positionSlot references a buffer whose type is Field<vec2> over instanceId.
•	All other field-backed inputs to that StepRender reference fields over the same instanceId.
•	Shape and control-point fields are type-checked as payload: 'shape' and payload: 'vec2' respectively, with matching cardinality and instance.
4.	Layout mechanisms:
•	No InstanceDecl.layout property is consulted for rendering or field computation.
•	No FieldExprLayout is present in the IR.
•	No position/radius intrinsics are present.

⸻

Part 2 — Migration Plan

This section describes how to move from the current implementation to the target end-state spec above.

Step 1 — Remove position and radius Intrinsics
1.	Edit IntrinsicPropertyName in types.ts:
•	Remove 'position' and 'radius' from the union.
•	Final form:

export type IntrinsicPropertyName =
| 'index'
| 'normalizedIndex'
| 'randomId';


	2.	In the Materializer (or equivalent), remove any branches in fillBufferIntrinsic or similar functions that handle 'position' or 'radius'.
	3.	Search the codebase for 'intrinsic: \'position\'' and 'intrinsic: \'radius\'':
	•	Remove or refactor any code that constructs FieldExprIntrinsic with these names.
	•	Replace such usage with explicit layout blocks and fields (after layout kernels are added).

Completion criteria:
•	The string literals 'position' and 'radius' appear only in comments, tests, or migration notes, not in IntrinsicPropertyName or any FieldExprIntrinsic.

Step 2 — Remove InstanceDecl.layout from Functional Semantics
1.	Edit InstanceDecl in types.ts:
•	Remove the layout: LayoutSpec property.
•	Final target form:

export interface InstanceDecl {
readonly id: string;
readonly domainType: string;
readonly count: number | 'dynamic';
readonly lifecycle: 'static' | 'dynamic' | 'pooled';
readonly identityMode: 'stable' | 'none';
readonly elementIdSeed?: number;
}


	2.	Remove all code that reads or branches on instance.layout:
	•	Search for instance.layout and eliminate each usage.
	•	Eliminate any helper functions such as fillLayoutPosition, fillLayoutRadius, or equivalent.
	3.	LayoutSpec and its variants in types.ts are no longer used by InstanceDecl:
	•	LayoutSpec may be deleted entirely, or kept only in migration tests; in the end state it must not be referenced by InstanceDecl or layout logic.

Completion criteria:
•	InstanceDecl has no layout property.
•	Searching for instance.layout returns no matches outside of dead/test code.
•	No render or materialize behavior depends on LayoutSpec.

Step 3 — Remove FieldExprLayout and the Layout Spec Expression
1.	Remove FieldExprLayout from the FieldExpr union in types.ts:

export type FieldExpr =
| FieldExprConst
| FieldExprIntrinsic
| FieldExprBroadcast
| FieldExprMap
| FieldExprZip
| FieldExprZipSig
| FieldExprArray; // FieldExprLayout removed


	2.	Delete the FieldExprLayout interface definition.
	3.	Remove LayoutSpec from types.ts if not needed elsewhere, or ensure it is not used for any layout behavior.
	4.	In the Materializer’s fillBuffer (or equivalent):
	•	Remove the 'layout' case from the switch(expr.kind) dispatch.
	•	Remove any dedicated code paths that interpret layoutSpec.
	5.	Update the compiler to stop generating FieldExprLayout nodes:
	•	Any previous layout IR generation must now generate field expression trees using the layout kernels (see Step 4).

Completion criteria:
•	The string 'layout' does not appear as a FieldExpr.kind in the IR type definitions.
•	There is no FieldExprLayout interface.
•	fillBuffer (or equivalent materialization function) has no 'layout' branch.

Step 4 — Implement Layout Field Kernels
1.	In your FieldKernels registry (e.g., FieldKernels.ts), add implementations for:
•	circleLayout
•	lineLayout
•	gridLayout
with the semantics defined in Section 6 of the spec:
•	circleLayout: t: Field<float>, radius: Signal<float>, phase: Signal<float> → Field<vec2> (normalized circle around (0.5,0.5)).
•	lineLayout: t: Field<float>, x0,y0,x1,y1: Signal<float> → Field<vec2> (linear interpolation in world [0,1]).
•	gridLayout: k: Field<float>, cols,rows: Signal<int> → Field<vec2> (grid positions in world [0,1]).
2.	For each kernel, enforce:
•	Input type checks (float vs vec2 vs color) consistent with the spec.
•	Output CanonicalType uses payload: 'vec2' and preserves the InstanceRef of the input field.
3.	Update applyFieldKernel / applyFieldKernelZipSig to recognize these kernel names and route to the appropriate implementations.

Completion criteria:
•	Unit tests or debug patches confirm:
•	circleLayout produces a ring of positions correctly centered and normalized.
•	lineLayout produces points along a line between (x0,y0) and (x1,y1).
•	gridLayout produces a regular grid covering the unit square.

Step 5 — Rewrite Layout Block Compilation to Use Kernels
1.	Identify all layout blocks in the compiler (CircleLayout, LineLayout, GridLayout, etc.).
2.	For each layout block:
•	Emit a FieldExprIntrinsic for the identity field:
•	normalizedIndex for circle and line layouts.
•	index for grid layout.
•	Emit a FieldExprZipSig with fn: { kind: 'kernel', name: 'circleLayout' | 'lineLayout' | 'gridLayout' }:
•	The field is the intrinsic field (normalizedIndex or index).
•	The signals are the scalar parameters (radius, phase, x0,y0,x1,y1, rows,cols).
•	The resulting FieldExpr is the position field.

Example (CircleLayout compilation):
•	IR:

const tField: FieldExprId = /* intrinsic(normalizedIndex, instanceId) */;
const positionField: FieldExprId = /* zipSig(tField, [radiusSigId, phaseSigId], kernel 'circleLayout') */;



	3.	Ensure each layout block produces only:
	•	A single field output: position: Field<vec2> over the instance.

Completion criteria:
•	Layout blocks no longer use FieldExprLayout or InstanceDecl.layout.
•	All layout blocks compile to a composition of:
•	Intrinsic fields.
•	Signals.
•	Layout kernels (circleLayout, lineLayout, gridLayout).

Step 6 — Enforce Position/Shape Alignment via InstanceId
1.	In the compiler’s sink emission (where StepRender is created):
•	For a given sink that renders an instance I:
•	position must be a FieldExpr with cardinality.many.instanceId = I.
•	color (if present) must be a FieldExpr with the same instanceId.
•	Any shape that is k: 'slot' must be Field<shape> with the same instanceId.
•	Any controlPoints slot must be a field whose cardinality.many.instanceId = I (or a shape-specific control instance, if the renderer is designed to combine them accordingly).
2.	Add compile-time checks during type resolution:
•	If any field wired into a sink has cardinality.many.instanceId ≠ StepRender.instanceId, compilation fails with a clear diagnostic.
3.	Ensure that positionSlot in StepRender always refers to a ValueSlot whose CanonicalType is Field<vec2> over instanceId.

Completion criteria:
•	It becomes impossible to compile a patch where a layout over instance A is applied to shapes from instance B.
•	The association of shape and position is always mediated by a shared InstanceId.

Step 7 — Delete Legacy Layout Code and Verify
1.	Search the codebase for:
•	LayoutSpec
•	FieldExprLayout
•	position / radius in IntrinsicPropertyName.
•	fillLayoutPosition
•	fillLayoutRadius
•	Any references to layout.kind ===.
2.	Remove or refactor any remaining references that affect layout behavior.
3.	Implement tests or demo patches that:
•	Use LineLayout, CircleLayout, and GridLayout blocks.
•	Confirm that:
•	Layout behaves as defined in Section 6.
•	No unexpected code paths are used (e.g., breakpoints or logs in removed functions are no longer hit).

Final completion criteria:
•	The only way layout influences rendering is through:
•	FieldExpr using intrinsic fields and kernels (circleLayout, lineLayout, gridLayout).
•	Position fields (Field<vec2>) wired into StepRender.positionSlot.
•	InstanceDecl.layout does not exist.
•	FieldExprLayout does not exist.
•	IntrinsicPropertyName includes only index, normalizedIndex, and randomId.
•	All layout types other than line, circle, and grid have been removed from runtime behavior; additional layouts, if added later, must be implemented as new kernels and blocks following the same pattern.

This is the final, implementation-ready specification for the layout and shape placement system.