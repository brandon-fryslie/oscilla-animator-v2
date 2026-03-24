Switching to local-space geometry is a foundational win for both SVG and performance, but it forces you to make one crisp change in semantics across the chain:

Geometry fields (control points) are no longer in viewport space.
They become shape-local coordinates, and the render pipeline becomes responsible for mapping local → world → viewport.

That impacts three places “up the chain”:
1.	How geometry-producing blocks generate points (Polygon, paths, etc.)
2.	How modulation blocks interpret points (warp, rotate, jitter, etc.)
3.	What the RenderAssembler emits (transforms must be explicit and consistent)

Renderer changes are mostly mechanical (stop multiplying by width/height; apply instance transforms). The deeper work is upstream: getting a consistent coordinate model and keeping it deterministic and cheap.

Below is the concrete impact, with the minimum set of decisions you must lock in now.

⸻

0) Lock the coordinate spaces (so everything stays consistent)

Define three spaces:
1.	Local space (L): coordinates stored in geometry fields (Field<vec2> control points).
•	centered at origin (0,0)
•	typical magnitude ~1 (unit radius/half-extents)
•	independent of viewport size
2.	World space (W): instance placement space.
•	what your “position” fields represent
•	can be normalized [0..1] or absolute pixels; pick one canonical
3.	Viewport space (V): actual pixels for Canvas2D, viewBox units for SVG.

Recommendation for v2:

Keep world in normalized coordinates [0..1] (because your system already does), and convert to pixels/viewBox only at the final backend adapter.

So:
•	geometry points: local (unit)
•	instance position: normalized world
•	backend maps world → viewport

This keeps patches resolution-independent and makes SVG viewBox trivial.

⸻

1) Impact on geometry-producing blocks (Polygon/Path primitives)

A) polygonVertex must output local points

Your current kernel:

outArr[i*2+0] = radiusX * cos(angle);
outArr[i*2+1] = radiusY * sin(angle);

This is already local provided radiusX/radiusY are local units. The problem today is you later multiply by canvas width/height in the renderer, effectively treating those values as normalized viewport fractions.

After the transition:
•	radiusX/radiusY become shape-local scale (unit-ish)
•	renderer/backends scale by instance size (or a transform scale) and then translate by instance position

So the polygon block should produce points on a unit polygon by default:
•	default radiusX = 1, radiusY = 1 (or 0.5 if you interpret “size” as diameter; pick one and stick to it)

B) Any block that currently emits positions assuming [0..1] must be audited

You likely have blocks that treat vec2 as “screen normalized” (center at 0.5,0.5). Those remain valid for instance placement, but not for geometry points.

So split semantics:
•	Layout / position fields: remain normalized [0..1] centered around 0.5, etc.
•	Geometry / control points: local centered around 0

This is an important mental model for users and for kernels.

C) Count/arity becomes more important (but you already have it)

Local space doesn’t change sides / pointsCount logic. It just means the control points are reusable templates.

⸻

2) Impact on modulation blocks (the “middle”)

This is where local space helps a lot: modulators become pure geometry transforms.

A) Geometry modulators should operate in local coordinates

Examples:
•	twist(points, amount) rotates points around origin
•	jitter(points, amount) adds small offsets
•	noiseWarp(points, amp, freq, phase) displaces points based on local coords

These become stable, resolution-independent operations. Previously, if points were viewport-normalized, “amp=0.01” meant “1% of the screen,” which changes feel across resolutions.

Now “amp” is in shape units and combines naturally with instance scale.

B) You need one explicit “local→world” bridge and nothing else

To keep the system coherent, don’t allow random mixing of spaces in the graph. Provide explicit blocks:
•	ApplyTransform2D(pointsLocal, scale, rotation, translationLocal?) -> pointsLocal
(still local, just modified)
•	InstanceTransform(positionWorld, size, rotation) -> transform
(produces transform fields for render)

But you generally should not convert geometry into world coords in the graph; do it at render time.

C) Layout kernels stay in world space

Your existing layout functions in Materializer (grid/circular/linear) produce positions around (0.5,0.5). Those are instance positions and should remain in [0..1].

So the only new “space discipline” rule is:
•	Field<vec2> can be either vec2_local or vec2_world
•	if you don’t want to extend PayloadType, enforce by convention + block contracts for v2
•	if you do want to be strict later, add a small axis tag for coordinate space (but that’s optional)

Given your “no special cases” preference, I’d keep it as block-level semantic contracts initially, not a new type axis, unless you are already adding a coordinate-space axis.

⸻

3) Impact on RenderAssembler (this is the structural change)

Local-space geometry requires RenderAssembler to output explicit transforms, not implicit scaling.

A) RenderIR must include instance transforms explicitly

At minimum per instance:
•	position (world normalized)
•	scale (in viewport units? or in world units?)
•	rotation

You have two choices for scale:

Choice 1 (recommended): scale is in world units
•	size field is “fraction of min(viewBoxWidth, viewBoxHeight)” or similar canonical.
•	backend maps to pixels.

Choice 2: scale is in viewport units (pixels/viewBox units)
•	RenderAssembler must know viewport size. That’s a leak of backend concerns into runtime.

So choose 1: keep scale in normalized world units.

Then in SVG backend with viewBox W×H:
•	sx = size * min(W,H) (or *W and *H if anisotropic)
Same for canvas: multiply by width/height.

B) RenderAssembler must no longer “bake” viewport scaling into points

It should pass:
•	pointsLocal (Float32Array)
•	transforms (position/scale/rotation)
•	style

That enables <defs>/<use> reuse and GPU instancing later.

C) RenderAssembler becomes the place where you can add batching keys

Local-space makes batching feasible: identical geometry + uniform style can be drawn together.

Even if you don’t implement batching yet, you should structure RenderIR so batching is natural:
•	group by (topologyId, pointsKey, styleKey)

⸻

4) Impact on the renderer backend implementations (Canvas2D and SVG)

Canvas2D
•	Stop multiplying points by width/height inside renderPathAtParticle
•	Apply ctx.scale based on instance scale converted to pixels
•	Path points remain small numbers (~1), so numeric stability is better

SVG
•	One d per geometry template
•	Per instance: transform="translate(x,y) rotate(r) scale(s)"

This is exactly why you’re doing local space.

⸻

5) Practical checklist: what changes where (up the chain)

A) Kernels / Materializer
•	polygonVertex: keep as-is structurally, but redefine defaults (radius=1) and remove any implicit assumption that output is normalized-to-viewport
•	Any kernel that currently emits “positions” for shapes (not instances) must output local centered coords

B) Blocks
•	Polygon block should:
•	generate control points in local space around origin
•	output shape2d that references those points
•	If you had any block that previously treated control points as viewport fractions, update it

C) RenderAssembler / ScheduleExecutor
•	Render ops must include explicit transform data
•	Ensure the backend receives viewport size to map world→viewport (or SVG viewBox)

D) Renderer(s)
•	Canvas: pointssize, not pointswidth/height
•	SVG: template + <use> with transform

⸻

6) The performance implications (why this helps)

Local-space transition enables three high-value optimizations:
1.	Geometry reuse: one cached d for many instances (SVG)
2.	Reduced per-frame compute: no per-instance rescaling of every point into viewport units; you scale once via transform
3.	Batching and instancing: grouping by shared geometry/style becomes trivial

It also eliminates resolution-dependent “feel,” which matters for usability.

⸻

If you want the next step to be maximally concrete, the first thing to lock is: what is the canonical meaning of size (radius vs diameter, and whether scale is isotropic or can be vec2), because that choice propagates into every kernel default and every backend’s transform emission.