Canonical decision: what “size” means

size is the isotropic local→world scale factor expressed in world-normalized units.
•	Geometry/control points are in local space (unitless, centered at (0,0)).
•	Instance position is in world space normalized to [0..1] relative to the render target’s viewBox/canvas.
•	size is a scalar that converts local units into world units.

Canonical meaning (precise):

If a point in local space is pL = (xL, yL), then (ignoring rotation) the world-space point is:
pW = positionW + size * pL.

Where:
•	positionW is in normalized world coordinates [0..1]
•	size is in normalized world units (e.g., 0.05 means “5% of the reference dimension”)

Reference dimension for backend mapping

Backends map world → viewport. To keep size resolution-independent and isotropic across non-square viewports:

Use min(viewBoxWidth, viewBoxHeight) as the scale reference.

So for SVG viewBox (W,H) and Canvas (width,height):
•	px = xW * W
•	py = yW * H
•	sizePx = size * min(W, H)

This ensures a circle stays a circle even when W != H.

⸻

Is scale isotropic? Can it be vec2?

v2 canonical rule
•	Scale is isotropic by default and always available: size: Signal<float> / Field<float>
•	Anisotropic scale is supported as an optional parallel channel: scale2: Signal<vec2> / Field<vec2>

But: do not overload size to sometimes be vec2. Keep a single meaning.

Why this split is the right “construction crew” choice
•	Isotropic scale is the common case and should be cheap and simple.
•	Anisotropic scale is extremely useful (ellipses, squash/stretch, calligraphy strokes), but it changes math and batching patterns.
•	Keeping them separate avoids runtime unions and preserves your slot-addressed invariants.

Canonical transform ordering

For each instance:
1.	translate(positionW)
2.	rotate(rotation) (optional; default 0)
3.	scale(size) or scale(scale2) if provided
4.	draw local geometry

World formula:
•	Isotropic: pW = positionW + R(θ) * (size * pL)
•	Anisotropic: pW = positionW + R(θ) * (S ⊙ pL) where S=(sx,sy) and ⊙ is component-wise multiply

Backend mapping to pixels comes after this.

⸻

End-to-end spec: local-space paths + instanced transforms + SVG-first

1) Geometry (control points) spec

Control points are always local-space.
•	Centered at origin (0,0).
•	Typical magnitude O(1).
•	They are not multiplied by canvas width/height anywhere upstream.

Local-space conventions
•	A “unit circle/polygon” lives around radius ≈ 1.
•	Your default polygon should produce vertices on radius 1 unless modulated.

Path topology
•	Topology is identified by a numeric topologyId.
•	Topology defines a verb stream: MOVE/LINE/QUAD/CUBIC/CLOSE.
•	Points are an interleaved Float32Array of (x,y) pairs, count = pointsCount.

2) Instance transform channels

Render ops for path instances must carry:
•	position: Float32Array (count*2), world-normalized [0..1]
•	size: Float32Array | number (isotropic scale in world units)
•	optional rotation: Float32Array | number (radians, clockwise positive; choose and document once)
•	optional scale2: Float32Array (count*2) if anisotropic enabled

3) Style channels (SVG compatible)

Explicit in RenderIR:
•	fill: color + fillRule
•	stroke: color + width + join + cap + dash + dashOffset
•	opacity
•	blendMode (SVG has limits; map best-effort)

4) RenderAssembler responsibilities (non-negotiable)

Before any backend:
•	Resolve shape2d packed value → (topologyId, pointsBuffer, pointsCount, flags/styleRef)
•	Materialize pointsBuffer via Materializer once per pass/template, not per instance
•	Emit DrawPathInstancesOp with:
•	geometry (template points + topologyId)
•	instances (position/size/rotation/scale2)
•	style

No renderer backend is allowed to:
•	look up slots
•	interpret unions
•	“discover” control points via side channels

⸻

Concrete examples

Example A: Regular polygon template + many instances

Polygon block output
•	controlPoints: Field<vec2> in local space, unit radius
•	shape: Signal<shape2d> referencing those control points
•	position: Field<vec2> from a layout in world space
•	size: Field<float> from a modulator

Render equation per instance:
•	local vertex (cos a, sin a)
•	scaled by size
•	translated to position

SVG backend:
•	<defs><path id="poly5" d="M ... Z"/></defs>
•	for each instance:
•	<use href="#poly5" transform="translate(xPx,yPx) rotate(rDeg) scale(sizePx)" .../>

Example B: Squash/stretch (anisotropic)
•	scale2: Field<vec2> provides (sx, sy)
•	Keep size unused or treat size as an additional multiplier:
•	final scale = size * scale2 (component-wise) if both exist

SVG:
•	scale(sxPx, syPx) in transform chain

⸻

Impacts on what you’ve shown already (specific edits)

1) Your current renderer: remove viewport scaling in renderPathAtParticle

You currently do:

const px = controlPoints[...] * width;
const py = controlPoints[...] * height;

Replace with local-space draw:
•	Don’t multiply points by width/height
•	Apply instance transform scale (sizePx) via ctx.scale

So path drawing becomes:
•	ctx.translate(xPx, yPx)
•	ctx.rotate(rot)
•	ctx.scale(sizePx, sizePx) (or scale2Px)
•	then moveTo(points[i*2], points[i*2+1])

2) Your comment “size unused; control points already include radius”

That stops being true. Under canonical spec:
•	control points are unit-ish
•	size is how you scale them

So _size becomes used and is the primary modulation channel.

3) Remove pass.controlPoints entirely

Control points must be reachable from the shape2d resolved geometry in RenderIR.

4) Materializer kernel polygonVertex

Your current polygonVertex produces:

outArr[i*2+0] = radiusX * cos(angle);
outArr[i*2+1] = radiusY * sin(angle);

This is already local-space. The change is semantic:
•	radiusX/radiusY are local scale multipliers (default 1)
•	they should not be thought of as “normalized screen fractions”

5) Layout outputs remain normalized [0..1]

Your fillLayoutPosition uses 0.5 centers and radius in normalized space. That’s correct for instance positions.

Do not reuse layout position buffers as geometry control points.

⸻

What to avoid (these will bite you later)
1.	Mixing coordinate spaces in the same payload without a contract
•	Don’t let a vec2 sometimes mean local, sometimes world.
•	Enforce via block contracts and naming (controlPoints vs position), and optionally add a “coordSpace” annotation later.
2.	Letting backends re-interpret geometry
•	Canvas/SVG must consume the same resolved op.
•	No backend should multiply points by width/height “because it looks right.”
3.	Encoding anisotropic scaling by stuffing it into control points upstream
•	That destroys geometry reuse for SVG (d changes per instance).
•	Keep template geometry stable; use transforms for per-instance variation.
4.	Per-instance unique d strings
•	This kills SVG performance.
•	If per-instance geometry is required later, you’ll need a different strategy (mesh, or grouping), but don’t accidentally fall into it now.

⸻

Summary: canonical rules to implement
•	Control points are local space, centered at origin.
•	size is isotropic scalar scale in world-normalized units.
•	Backend scale reference is min(W,H) to preserve isotropy.
•	Anisotropic scale is optional via scale2: vec2, not by overloading size.
•	RenderAssembler emits resolved ops; backends only rasterize.
•	SVG uses <defs>/<use> with transforms; geometry reuse is the default.

That is the end-to-end spec you can hand to the construction crew.