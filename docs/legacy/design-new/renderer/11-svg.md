To target SVG effectively under the canonical architecture, you treat SVG as just another sink that consumes the same backend-agnostic RenderFrameIR, but you add one SVG-specific optimization layer:

Compile and cache “path templates” (d strings) per topology+geometry, then instance them with per-instance transforms and styles.

SVG is great at reusing geometry and instancing via transforms (via <g transform=...> or by repeating <path> with different transform), but it’s bad at per-frame DOM churn. So the goal is:
•	Keep the RenderIR stable and declarative
•	Make SVG output diffable and cacheable
•	Minimize string building and element recreation

Below is a concrete design that works with your shape2d model (numeric topology id + Field<vec2> control points) and with your RenderAssembler.

⸻

1) Define the SVG backend contract: consume RenderIR, output an SVG “scene graph” diff

You do not want your SVG backend to build raw DOM every frame by appending thousands of nodes; you want a “scene model” that can be serialized to string or patched into DOM.

So the backend is:
•	renderFrameToSvg(frame: RenderFrameIR, target: SvgTarget, cache: SvgCache)

Where SvgTarget can be:
•	a DOM <svg> element (live)
•	a string sink (export)
•	a virtual tree (for diffing)

I’d implement a small internal VDOM-ish representation (not React) so you can do minimal patching.

⸻

2) The key trick: geometry becomes cached d strings

A. Geometry is “path verbs + points”

SVG wants a d string. Your PathTopologyDef already has verbs; your points buffer provides coordinates.

Add a deterministic function:

function pathToSvgD(topology: PathTopologyRuntime, points: Float32Array, pointsCount: number): string

This emits:
•	M x y
•	L x y
•	Q cx cy x y
•	C c1x c1y c2x c2y x y
•	Z

B. Cache d by a stable key

The stable cache key is:
•	topologyId
•	pointsFieldExprId (or points buffer identity)
•	optionally a hash of the points content if buffers are reused across ids

Given your runtime pipeline, the best key is actually the FieldExprId + instanceId + frame cache stamp, because you already cache field buffers in Materializer.

So at RenderAssembler time (or in SVG backend), you can compute:
•	geomKey = topologyId + ':' + pointsFieldId + ':' + instanceId + ':' + fieldStamp

Then:
•	if cached d exists for that stamp: reuse
•	else: generate d once and store

This is crucial for “SVG high priority,” because string building is expensive and the DOM likes stability.

⸻

3) Choose a coordinate space that makes SVG transforms cheap

SVG can transform via matrices. Your canonical plan (local-space geometry + per-instance transforms) maps cleanly:
•	Geometry points in local coordinates (e.g. unit radius polygon, centered at origin)
•	Each instance applies a transform:
•	translate to viewport coords
•	rotate
•	scale by size
•	SVG uses transform="translate(...) rotate(...) scale(...)" (or a matrix(a b c d e f))

This avoids recomputing d per instance. You compute d once per shape template and reuse it many times.

Recommendation
•	Keep geometry points in local units (not multiplied by width/height)
•	Convert instance positions from normalized [0..1] to SVG viewport coordinates once per instance:
•	x = position[i*2] * viewBoxWidth
•	y = position[i*2+1] * viewBoxHeight

Use viewBox="0 0 W H" and draw in that coordinate system.

⸻

4) RenderIR should make SVG reuse possible

If your RenderIR is currently “instances2d” with count, position, color, size, shape, that’s fine, but for SVG you want two extra pieces of structure:
1.	Explicit “geometry template” vs “instances”
2.	Style separation (fill/stroke)

So for SVG-friendly emission, use ops like:

type DrawPathInstancesOp = {
geometry: {
topologyId: number;
points: Float32Array;
pointsCount: number;
};
instances: {
count: number;
position: Float32Array;           // count*2
rotation?: Float32Array | number;
scale: Float32Array | number;     // size
};
fill?: { color: Uint8ClampedArray | number; rule?: number };
stroke?: { color: Uint8ClampedArray | number; width: Float32Array | number; join?: number; cap?: number; dash?: Float32Array };
opacity?: Float32Array | number;
blendMode?: number;
};

This structure makes it obvious the d is shared across all instances.

⸻

5) SVG emission strategy: “defs + use” vs repeated <path>

You have two main ways to instance shapes in SVG.

A) <defs><path id="..."></path></defs> + <use href="#id" ...>

Pros:
•	geometry string appears once
•	<use> nodes are small
•	you can update the template path in place if geometry changes

Cons:
•	per-instance styling with <use> can be awkward depending on browser quirks (usually fine for fill, stroke, opacity, transform)
•	more moving parts (ids, href)

B) Repeat <path d="..."> for each instance

Pros:
•	simplest and most compatible
•	per-instance style is straightforward

Cons:
•	duplicates d string many times (heavy)

Given SVG is high priority and you want performance, prefer A for anything with many instances.

Concrete plan
•	Every distinct geometry template gets a stable defId:
•	defId = "p" + topologyId + "_" + hash(points)
•	Emit one <path id=defId d="..."> in <defs>
•	Emit instances as <use href="#defId" transform="..." fill="..." stroke="...">

If per-instance style varies heavily (e.g. unique stroke widths per instance), you still can do <use> and override style attributes per use.

⸻

6) Update model: patch DOM, don’t rebuild

SVG will be your bottleneck if you recreate thousands of nodes per frame. You need:
•	stable element identity
•	diff/pool reuse

So the SVG backend should maintain:
•	a pool of <use> elements per pass
•	keyed by (passId, index) where passId is stable (derived from sink id + node id + topology id)
•	each frame:
•	update attributes (transform, fill, stroke, opacity) on existing elements
•	add/remove elements only if count changes
•	update <defs> only if geometry key changed

This aligns perfectly with your invariant about stable identity / pooling.

⸻

7) Style encoding: avoid CSS strings where possible

SVG attributes are strings, but you can keep them canonical and deterministic:
•	Convert RGBA to rgba(r,g,b,a) or #RRGGBB + fill-opacity
•	Prefer fill="#RRGGBB" and fill-opacity="a" because it’s cheaper to update and more consistent.

So for each instance:
•	fill color: #RRGGBB
•	fill-opacity: float with fixed precision (e.g. 3 decimals)
Same for stroke.

This reduces string churn and makes diffs stable.

⸻

8) Handling “arbitrary bucket of paths/strokes”

SVG has native stroke rendering. Your RenderIR should represent strokes explicitly, not as a special “shape.”
•	A path template is geometry.
•	Whether it’s filled, stroked, or both is style.

So “bucket of strokes” is just:
•	many DrawPathInstancesOp with stroke style
or
•	one DrawPathInstancesOp with per-instance stroke color/width

⸻

9) What needs to be added/changed in your codebase to make this real

A) A numeric topology registry

You need topologyId: number stable across compilation and runtime, and an array for O(1) lookup.

B) RenderAssembler must output resolved path geometry

Either:
•	include points: Float32Array directly in each op (best for simplicity), or
•	include a pointer to a materialized field buffer already resolved in the assembly phase

SVG backend shouldn’t call Materializer. It should only consume concrete buffers.

C) Add an SVG backend module that consumes RenderIR ops

It should:
•	maintain <defs> cache
•	maintain <use> element pools
•	do per-pass update

D) Add “path→d” conversion utility

Deterministic, no allocations beyond the string builder, with fixed float formatting.

⸻

10) The one decision you must make now for SVG correctness and performance

Are your control points local space or viewport space?

For SVG instancing to be efficient, they should be local space so you can reuse a single d across instances and apply transform per instance.

If you keep points in viewport space (as your current renderer implies), then:
•	each instance’s geometry differs (because you multiply by width/height or position)
•	you lose <defs>/<use> reuse
•	you end up regenerating many d strings

So: local space is not optional if SVG is a first-class target.

⸻

If you adopt:
•	local-space geometry points
•	numeric topology ids
•	RenderAssembler emitting resolved DrawPathInstancesOp
•	SVG backend using <defs>/<use> with caching and pooling

…then SVG becomes an efficient, deterministic target that shares the same canonical pipeline as Canvas2D, without infecting the rest of the system with SVG-specific concerns.