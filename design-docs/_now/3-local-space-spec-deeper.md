Alright, let’s nail this down to “you can hand this to someone and they can implement it without guessing.” I’ll go end-to-end and be explicit about math, types, and where each piece lives.

⸻

1. Coordinate Spaces: Formal Spec

We define three 2D spaces:

1.1 Local Space (L)
•	Where geometry/control points live.
•	Origin at L = (0,0) is the shape’s logical center.
•	Typical magnitude |L| ≈ O(1):
•	Unit circle points: (cos θ, sin θ) → radius 1
•	Unit rect: corners (-0.5,-0.5) .. (0.5,0.5) or similar, but pick and stick to it.
•	No dependence on viewport resolution or world coordinates.

Local position examples:
•	Regular pentagon vertex: L = (cos(2π*k/5), sin(2π*k/5)), k=0..4.
•	Horizontal line segment: L ∈ [(-0.5,0), (0.5,0)].

1.2 World Space (W)
•	Where instances are placed and animated.
•	We use normalized world coordinates:
•	xW, yW ∈ [0, 1].
•	These are resolution-independent “logical coordinates” for the scene.

World position examples:
•	Center of screen: W = (0.5, 0.5).
•	Top-left: (0, 0), bottom-right: (1, 1).

1.3 Viewport Space (V)
•	Backend-specific render coordinates:
•	Canvas: pixel coordinates (xPx, yPx).
•	SVG: viewBox coordinates (xSvg, ySvg) with viewBox="0 0 W H".

Mapping from world to viewport is:

xPx = xW * canvasWidth
yPx = yW * canvasHeight

xSvg = xW * viewBoxWidth
ySvg = yW * viewBoxHeight

We also define a reference length:

D = min(viewportWidth, viewportHeight)

This is used to convert scalar size into a physical scale (pixels or SVG units).

⸻

2. Transform Model and “Size” Semantics

2.1 Canonical Transform Equation

Given:
•	pL = (xL, yL) in local space.
•	pW = (xW, yW) in world space (instance position).
•	Rotation θ in radians.
•	Isotropic scale s in world units.
•	Optional anisotropic scale S = (sx, sy) in world units.

The world-space point is:
•	Isotropic only:

pW' = pW + R(θ) · (s * pL)

	•	Isotropic + anisotropic (S overrides isotropic if present, or we treat finalS = s * S componentwise):

pW' = pW + R(θ) · (S ⊙ pL)

where S ⊙ pL = (sx * xL, sy * yL)

Then viewport mapping:

xPx = pW'.x * viewportWidth
yPx = pW'.y * viewportHeight

sizePx = s * D
sxPx  = sx * D
syPx  = sy * D

2.2 size (isotropic scale) definition
•	Type: PayloadType = 'float'.
•	Extent:
•	Signal<size> = Cardinality=one, Temporality=continuous.
•	Field<size> = Cardinality=many(instance), Temporality=continuous.

Meaning:

size is a scalar multiplier that converts “local units” into “world units” along both axes equally.

If |pL| = 1 and size = 0.1, then the shape’s effective radius in world space is 0.1 in both x and y.

In pixels (assuming D=1000):
•	sizePx = 0.1 * 1000 = 100px → the shape of radius 1 in local space becomes ~100px radius.

2.3 scale2 (anisotropic scale) definition
•	Type: PayloadType = 'vec2'.
•	Optional, separate channel from size.
•	Same extents semantics as size.

Combination rule (simple & predictable):
•	If only size is present:
•	S_effective = (size, size).
•	If only scale2 is present:
•	S_effective = scale2.
•	If both are present:
•	S_effective = (size * scale2.x, size * scale2.y).

This lets you:
•	Use size for “general zoom” and scale2 for stretching.
•	Or ignore size and rely entirely on scale2.

⸻

3. Type-Level Representation

You don’t have to add coord-space axes now, but you should make contracts explicit.

3.1 Payloads

You already have:

type PayloadType = 'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit' | 'shape2d';

We use:
•	vec2 for both local and world positions.
•	shape2d handle that references:
•	TopologyId
•	PointsFieldSlot (Field in local space)
•	PointsCount
•	flags/styleRef

3.2 Semantic contracts (no new axis in v2)

Define block-level contracts:
•	Ports named position:
•	Type: Signal<vec2> or Field<vec2> in world-normalized space [0..1].
•	Ports named controlPoints or shapePoints:
•	Type: Field<vec2> in local space.
•	Ports named size:
•	Type: Signal<float> / Field<float> world scale.
•	Ports named scale2:
•	Type: Signal<vec2> / Field<vec2> world anisotropic scale.

You enforce this by block definitions and tests, not by adding a coord-space axis yet.

Later, if you want, you can add:

type CoordSpace = 'local' | 'world';

type CoordSpaceTag =
| { kind: 'local' }
| { kind: 'world' };

type Extent = {
// ...
coordSpace?: AxisTag<CoordSpace>; // v1 maybe
};

…but for now, the naming and contracts are enough.

⸻

4. IR & Slot-Level Structures

4.1 Runtime Slot Meta

Scalar slots must capture storage kind:

type ScalarStorageKind = 'f32' | 'i32' | 'shape2d';

interface ScalarSlotDecl {
slot: number;
storage: ScalarStorageKind;
// offset into corresponding bank if needed
offset: number;
}

Field slots likewise:

type FieldStorageKind = 'f32' | 'vec2' | 'color' | /* ... */ ;

interface FieldSlotDecl {
slot: number;
storage: FieldStorageKind;
instanceId: string;  // domain/instance decl key
countExpr?: SigExprId; // if dynamic
}

4.2 Shape2D packed layout (scalar bank)

const SHAPE2D_WORDS = 8;

enum Shape2DWord {
TopologyId      = 0, // u32
PointsFieldSlot = 1, // u32 (field slot id for control points)
PointsCount     = 2, // u32
StyleRef        = 3, // u32 (optional style table id or scalar slot)
Flags           = 4, // u32 bitfield (closed, fillRule, etc.)
Reserved0       = 5,
Reserved1       = 6,
Reserved2       = 7,
}

type Shape2DBank = Uint32Array; // length = numShapeSlots * SHAPE2D_WORDS

4.3 RuntimeState updates

interface RuntimeState {
scalarsF32: Float32Array;
scalarsI32: Int32Array;
scalarsShape2D: Uint32Array; // packed shape refs

fieldsF32: Map<number, Float32Array>;
fieldsVec2: Map<number, Float32Array>;
fieldsColor: Map<number, Uint8ClampedArray>;
// ...
}

Materializer writes into fieldsVec2 for Field<vec2> control points.

⸻

5. RenderFrameIR & Draw Ops

5.1 Backend-agnostic RenderIR (path-centric)

export interface RenderFrameIR {
passes: RenderPassIR[];
}

export type RenderPassIR =
| { kind: 'drawPathInstances'; op: DrawPathInstancesOp }
// future: drawMeshInstances, drawImageInstances, etc.
;

export interface DrawPathInstancesOp {
geometry: PathGeometryTemplate;
instances: PathInstanceSet;
style: PathStyle;
}

export interface PathGeometryTemplate {
topologyId: number;
verbs: Uint8Array;         // from registry[topologyId] or stored here
points: Float32Array;      // local-space x,y pairs
pointsCount: number;       // vec2 count
}

export interface PathInstanceSet {
count: number;
position: Float32Array;            // length = count * 2, world coords
size: Float32Array | number;       // world scale
rotation?: Float32Array | number;  // radians
scale2?: Float32Array;             // length = count * 2, world anisotropic
}

export interface PathStyle {
fill?: {
color: Uint8ClampedArray | number;  // packed RGBA or buffer (per-instance later)
fillRule?: number;                  // 0=nonzero,1=evenodd, etc.
};
stroke?: {
color: Uint8ClampedArray | number;
width: Float32Array | number;       // world units (mapped to px)
join?: number;                      // miter/round/bevel
cap?: number;                       // butt/round/square
dash?: Float32Array;                // [on, off, ...]
dashOffset?: number;
};
opacity?: Float32Array | number;    // 0..1
blendMode?: number;                 // backend-specific mapping
}


⸻

6. RenderAssembler Algorithm (Before Any Backend)

Assume executeFrame ends with something like:

function assembleRenderFrame(program: CompiledProgramIR, state: RuntimeState): RenderFrameIR {
const passes: RenderPassIR[] = [];

for (const sink of program.renderSinks) {
if (sink.kind === 'pathInstances2d') {
passes.push({
kind: 'drawPathInstances',
op: assemblePathInstancesOp(sink, program, state),
});
}
}

return { passes };
}

6.1 assemblePathInstancesOp steps

Inputs:
•	sink describes which slots/exprs represent:
•	shape2d handle slot
•	position field slot
•	size field/signal slot
•	optional rotation, scale2, style channels
•	program has slot meta + field expr arrays.
•	state has runtime banks and Materializer cache/pool.

Algorithm:
1.	Resolve shape handle (uniform or per-instance; start with uniform):

const shapeSlot = sink.shapeSlot; // scalar slot id for shape2d
const shapeOffset = program.scalarSlots[shapeSlot].offset;
const shapeWordBase = shapeOffset * SHAPE2D_WORDS;

const shapeBank = state.scalarsShape2D;

const topologyId      = shapeBank[shapeWordBase + Shape2DWord.TopologyId];
const pointsFieldSlot = shapeBank[shapeWordBase + Shape2DWord.PointsFieldSlot];
const pointsCount     = shapeBank[shapeWordBase + Shape2DWord.PointsCount];
const flags           = shapeBank[shapeWordBase + Shape2DWord.Flags];


	2.	Materialize control points:

const pointsFieldDecl = program.fieldSlots[pointsFieldSlot];
const instanceId = pointsFieldDecl.instanceId;

const pointsBuf = materialize(
pointsFieldDecl.fieldExprId,
instanceId,
program.fieldExprs,
program.sigExprs,
program.instances,
state,
state.bufferPool
) as Float32Array;

// Validate length
if (pointsBuf.length < pointsCount * 2) {
throw new Error(`pointsBuf too short for shape: expected ${pointsCount*2}, got ${pointsBuf.length}`);
}


	3.	Materialize instance transforms:
	•	Position:

const posBuf = materialize(
sink.positionFieldExprId,
sink.instanceId,
program.fieldExprs,
program.sigExprs,
program.instances,
state,
state.bufferPool
) as Float32Array;
const count = posBuf.length / 2;


	•	Size:

let size: Float32Array | number;
if (sink.sizeIsField) {
size = materialize(...sink.sizeField...) as Float32Array;
// size.length should be >= count
} else {
const slot = sink.sizeScalarSlot;
size = state.scalarsF32[ program.scalarSlots[slot].offset ];
}


	•	Rotation (optional):

let rot: Float32Array | number | undefined = undefined;
if (sink.rotationFieldExprId != null) {
rot = materialize(...sink.rotationField...) as Float32Array;
} else if (sink.rotationScalarSlot != null) {
rot = state.scalarsF32[ program.scalarSlots[sink.rotationScalarSlot].offset ];
}


	•	Scale2 (optional):

let scale2: Float32Array | undefined = undefined;
if (sink.scale2FieldExprId != null) {
scale2 = materialize(...sink.scale2Field...) as Float32Array;
// length >= count * 2
}


	4.	Assemble style:
	•	Fill/stroke/opacity from scalars or fields, same pattern as above.
	5.	Return op:

return <DrawPathInstancesOp>{
geometry: {
topologyId,
verbs: topologyRegistry[topologyId].verbs, // or embed
points: pointsBuf,
pointsCount,
},
instances: {
count,
position: posBuf,
size,
rotation: rot,
scale2,
},
style: {
fill: fillSpec,
stroke: strokeSpec,
opacity: opacitySpec,
blendMode: blendModeValue,
},
};



Now Canvas and SVG both consume this same op.

⸻

7. Backend Mapping: Canvas2D

For each DrawPathInstancesOp:
1.	Resolve viewport dims:

const W = canvas.width;
const H = canvas.height;
const D = Math.min(W, H);


	2.	For each instance i:

const xW = position[i*2];
const yW = position[i*2+1];
const xPx = xW * W;
const yPx = yW * H;

const s = (typeof size === 'number') ? size : size[i];
const sizePx = s * D;

const θ = Array.isArray(rotation) ? rotation[i] : (typeof rotation === 'number' ? rotation : 0);

let sxPx = sizePx;
let syPx = sizePx;
if (scale2) {
const sxW = scale2[i*2];
const syW = scale2[i*2+1];
sxPx = sxW * D;
syPx = syW * D;
}


	3.	Draw:

ctx.save();
ctx.translate(xPx, yPx);
ctx.rotate(θ);

if (scale2) {
ctx.scale(sxPx, syPx);
} else {
ctx.scale(sizePx, sizePx);
}

ctx.beginPath();
// interpret verbs + points in LOCAL space (no width/height multipliers)
buildCanvasPath(ctx, verbs, points, pointsCount);
applyStyle(ctx, style, i); // sets fill/stroke, globalAlpha
// fill/stroke once depending on style
ctx.restore();



Where buildCanvasPath is:

function buildCanvasPath(
ctx: CanvasRenderingContext2D,
verbs: Uint8Array,
points: Float32Array,
pointsCount: number
) {
let pi = 0;
for (let vi = 0; vi < verbs.length; vi++) {
const verb = verbs[vi] as PathVerb;
switch (verb) {
case MOVE: {
const x = points[pi*2];
const y = points[pi*2+1];
ctx.moveTo(x, y);
pi++;
break;
}
case LINE: {
const x = points[pi*2];
const y = points[pi*2+1];
ctx.lineTo(x, y);
pi++;
break;
}
// QUAD/CUBIC analogous, using next 2 or 3 points
case CLOSE: {
ctx.closePath();
break;
}
}
}
}

Notice: No * width, * height inside this function anymore.

⸻

8. Backend Mapping: SVG
    1.	Resolve W, H, D from viewBox or target size.
    2.	For each PathGeometryTemplate (topologyId + points):
          •	Compute d string once per geometry key:

const d = pathToSvgD(verbs, points, pointsCount);


	•	Cache by (topologyId, pointsBuffer identity, pointsCount) or by a hash if needed.
	•	Emit or update <path id="geomKey" d="..."> in <defs>.

	3.	For each instance i:
	•	Same xW, yW, s, θ, sxPx, syPx math as Canvas, but now:

const xSvg = xW * W;
const ySvg = yW * H;

const sxSvg = scale2 ? (scale2[i*2]   * D) : (s * D);
const sySvg = scale2 ? (scale2[i*2+1] * D) : (s * D);


	•	Compose SVG transform string, in this order:

const transform = `translate(${xSvg},${ySvg}) rotate(${θ * 180 / Math.PI}) scale(${sxSvg},${sySvg})`;


	•	Either:
	•	<use href="#geomKey" transform="..." fill="..." fill-opacity="..." stroke="..." stroke-width="..." />
	•	or reuse existing <use> element and update its attributes.

This is where you get the performance win: geometry is reused via <defs>/<use>; only transforms and style attributes change per instance.

⸻

9. Impact on Existing Code in Your Repo

Materializer.ts (shown)
•	Layout intrinsics (position, radius, circleLayout) stay in world space (normalized).
•	Kernels like polygonVertex are now local-space geometry producers.
•	No kernel should ever be multiplying geometry points by viewport width/height.

Specifically:
•	polygonVertex:

// already correct for local:
const angle = (index / sides) * TWO_PI - Math.PI / 2;
outArr[i*2+0] = radiusX * Math.cos(angle);
outArr[i*2+1] = radiusY * Math.sin(angle);

Semantics change:
•	radiusX/radiusY are local units.
•	Upstream docs/UI must stop suggesting they’re screen fractions.

	•	fillLayoutPosition remains world, not local.

Current Canvas renderer
•	Remove:

const px = controlPoints[...]*width;
const py = controlPoints[...]*height;


	•	Instead use local points directly with transform applied as per section 7.
	•	Remove pass.controlPoints as an independent “buffer;” geometry is resolved through shape2d.

Shape passing in RenderPassIR
•	Replace ShapeDescriptor | ArrayBufferView | number with the explicit PathGeometryTemplate (and later other geometry types).

⸻

All of this together gives you a precise, unambiguous spec for size, transform, and coordinate spaces that you can encode into types, IR, kernels, and backends without any “we’ll figure it out later” gaps.