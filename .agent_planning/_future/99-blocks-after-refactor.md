Good, now we can answer this cleanly because the layers are separated.

I’ll walk it in the same order as your bullets:

⸻

1. How do I set up my Polygon block?

Think of the Polygon block as a geometry template factory:
•	It outputs a shape2d handle (scalar) that points at:
•	a vertex instance (domain = “polygonVertex” or similar)
•	a Field over that instance (the control points in local space)
•	the vertex count and topology id

1.1 Block surface (ports)

At the graph/block level, expose only the interesting knobs as signals:

// Conceptual block interface
PolygonBlock {
inputs:
sides:  Signal<int>   // >= 3, quantized internally
radiusX: Signal<float> // local units (1.0 ≈ unit radius)
radiusY: Signal<float> // local units
phase:  Signal<float> // optional: rotation of the template, 0..1 or radians

outputs:
shape:  Signal<shape2d>  // scalar handle used by render sinks
}

You do not output the control point field directly from this block; that stays internal to the compiled program and is referenced via the shape2d handle.

1.2 Internal IR pattern

Internally, the compiler expands this block into:
1.	A vertex instance declaration:

const vertexInstance: InstanceDecl = {
id: 'polygonVertices',
domainType: DomainTypeId.PolygonVertex, // or generic "vertex"
primitiveId: /* internal */,
maxCount: maxSides,          // e.g., 64
count: sidesExprOrConstant,  // dynamic or baked
lifecycle: 'pooled',
};

	2.	An intrinsic index field over that instance:

field polygonIndex: Field<float> =
{ kind: 'intrinsic', intrinsic: 'index', type: Field<float> };

	3.	A polygonVertex field over that instance (local geometry):

field polygonPoints: Field<vec2> =
zipSig(polygonIndex, [sides, radiusX, radiusY], kernel: 'polygonVertex');

Your existing polygonVertex kernel already matches this:
•	input field: index
•	sigValues: [sides, radiusX, radiusY]
•	output: vec2 = (radiusX*cos(angle), radiusY*sin(angle)), local space.

	4.	A shape2d scalar that points at that geometry:

scalar polygonShape: shape2d = Shape2D {
topologyId: TOPOLOGY_PATH_POLYGON,
pointsFieldSlot: <slot of polygonPoints>,
pointsCount: sides,          // or maxSides with flags
styleRef: <style slot or 0>,
flags: CLOSED_PATH | WIND_NONZERO, ...
};

Under the hood this is the packed scalarsShape2D array we discussed (TopologyId, PointsFieldSlot, PointsCount, Flags…).

This polygonShape scalar is what the Polygon block’s shape output port is wired to.

⸻

2. What do I need to change in my renderer?

Assuming you’ve done the architecture refactor:
1.	Renderer consumes RenderIR ops, not live IR/state:
Instead of your current pass.shape: ShapeDescriptor | ArrayBufferView | number, you now get:

type RenderPassIR =
| { kind: 'drawPathInstances'; op: DrawPathInstancesOp };

interface DrawPathInstancesOp {
geometry: PathGeometryTemplate;
instances: PathInstanceSet;
style: PathStyle;
}

interface PathGeometryTemplate {
topologyId: number;
verbs: Uint8Array;
points: Float32Array;  // local-space x,y pairs
pointsCount: number;
}

interface PathInstanceSet {
count: number;
position: Float32Array;        // world [0..1], length = count*2
size: Float32Array | number;   // scalar world scale
rotation?: Float32Array|number;// radians
scale2?: Float32Array;         // anisotropic, optional
}


	2.	Use local-space points + transforms, no width/height in geometry:
In your current renderer you were doing:

const px = controlPoints[pi*2] * width;
const py = controlPoints[pi*2+1] * height;

That goes away.
Instead, in Canvas:

const W = canvas.width;
const H = canvas.height;
const D = Math.min(W, H);

for each DrawPathInstancesOp:
for i in [0..count):
const xW = position[i*2];
const yW = position[i*2+1];
const xPx = xW * W;
const yPx = yW * H;

    const s = (typeof size === 'number') ? size : size[i];
    const sizePx = s * D;

    const θ = Array.isArray(rotation) ? rotation[i]
              : typeof rotation === 'number' ? rotation
              : 0;

    let sxPx = sizePx, syPx = sizePx;
    if (scale2) {
      const sxW = scale2[i*2];
      const syW = scale2[i*2+1];
      sxPx = sxW * D;
      syPx = syW * D;
    }

    ctx.save();
    ctx.translate(xPx, yPx);
    ctx.rotate(θ);
    ctx.scale(sxPx, syPx);

    ctx.beginPath();
    buildCanvasPath(ctx, op.geometry.verbs, op.geometry.points);
    applyStyle(ctx, op.style, i);
    ctx.restore();

where buildCanvasPath uses unscaled local points directly.

	3.	Drop all special cases for “polygon” in the renderer.
The renderer doesn’t know what a polygon is. It just knows:
•	“path with these verbs/points”
•	“instances with these transforms”
•	“style”
Topology id is only used if you want topology-specific behavior (e.g., debug).

⸻

3. How do I structure the stuff in the middle so it gets passed through correctly?

Middle = compiler + runtime + Materializer + RenderAssembler.

The data path for the polygon looks like:

[Polygon Block]
↓ (compile to IR)
FieldExpr: polygonIndex (intrinsic index)
FieldExpr: polygonPoints = polygonVertex(polygonIndex, sides, radiusX, radiusY)
Scalar shape2d: polygonShape = Shape2D(topologyId, pointsFieldSlot, pointsCount, flags)
↓
[Runtime executeFrame]
↓
Materializer.materialize(polygonPoints, vertexInstance)
↓
Float32Array points (local-space)
↓
RenderAssembler.assembleRenderFrame(...)
↓
DrawPathInstancesOp {
geometry: { verbs: PATH_POLYGON_VERBS, points, pointsCount },
instances: { ...world placement fields... },
style: ...
}
↓
Renderer

Structurally:
1.	Compiler emits:
•	FieldExpr graph that includes polygonPoints (local geometry).
•	SigExpr for sides, radiusX, radiusY.
•	A shape2d scalar whose slot encodes (topologyId, polygonPointsFieldSlot, pointsCount, flags).
2.	Runtime executes frame:
•	Evaluates all signals (sides, radiusX, radiusY, etc).
•	Runs schedule.
•	When RenderAssembler needs geometry:
•	Reads shape2d scalar from scalarsShape2D.
•	Gets pointsFieldSlot + pointsCount.
•	Calls materialize(pointsFieldSlot, vertexInstance.id, ...).
3.	Materializer:
•	Sees FieldExpr.kind === 'zipSig', kernel 'polygonVertex'.
•	Materializes intrinsic index field.
•	Applies polygonVertex field kernel to produce a local-space Float32Array.
4.	RenderAssembler:
•	Wraps that buffer into PathGeometryTemplate and pairs it with your per-instance transforms (from other fields) to produce DrawPathInstancesOp.

That is the “plumbing” for shape: no renderer logic, no direct access from blocks to Canvas.

⸻

4. How do I structure the stuff in the middle so it’s modulatable?

Key rule: every knob you want to modulate must enter as a Signal, not as a baked constant. That means:

4.1 Shape-side modulation

For the polygon template:
•	sides – Signal<float> rounded/clamped to ≥3 in the kernel/IR.
•	radiusX / radiusY – Signal<float> (local units).
•	phase – Signal<float> either:
•	fed into polygonVertex to offset the angle, or
•	applied later as an extra rotation in the instance transform (or both, depending on semantics).

Concrete: polygonVertex kernel already uses sigValues:

// In applyKernelZipSig:
kernelName === 'polygonVertex'
inputs: [indexField]
sigValues: [sides, radiusX, radiusY]

// So at runtime polygonPoints changes whenever those sigs change.

Because FieldExpr references SigExprs, any modulation (LFO, envelopes, manual automation) just flows through the normal SignalEvaluator path.

4.2 Instance-side modulation

Instances (particles/shapes on screen) take their transform & style from other fields and signals:
•	position: Field<vec2> – from layout kernels (circleLayout, fieldPolarToCartesian, jitter2d, attract2d, etc.).
•	size: Field<float> | Signal<float> – modulated by envelopes, noise, phase, etc.
•	rotation: Field<float> | Signal<float> – use phase or functions of phase/id01.
•	scale2: Field<vec2> – for squash/stretch if you want it.
•	color/hue: Field<float> or Field<color> – via fieldHueFromPhase + hsvToRgb.

RenderAssembler just reads whatever modulated values are in those slots and builds PathInstanceSet. There is no special logic to “support modulation;” it’s just the normal “Signals feed FieldExpr feed Materializer feed RenderIR” pipeline.

4.3 Caching vs. modulation

Your existing Materializer caches per (fieldId, instanceId, frameId). That is fine with modulation:
•	Within a frame, geometry is evaluated once and reused.
•	On the next frame (frameId increments), caches invalidate and geometry is recomputed with new sides, radiusX/Y, etc.

No changes required there as long as:
•	Geometry is always computed from current RuntimeState signals.
•	You don’t bake shape2d into something that bypasses the FieldExpr chain.

⸻

So, in short:
•	Block setup: Polygon block outputs a shape2d scalar built from a vertex instance + polygonVertex field; all shape knobs are signals.
•	Renderer changes: Consume DrawPathInstancesOp with local-space geometry and per-instance transforms; get rid of any viewport-aware geometry math.
•	Middle structure: Compiler → FieldExpr + shape2d scalar → Materializer → PathGeometryTemplate → DrawPathInstancesOp.
•	Modulation: Treat every interesting parameter as a Signal feeding kernels; Materializer and RenderAssembler simply recompute geometry and transforms per frame based on the current signal values.