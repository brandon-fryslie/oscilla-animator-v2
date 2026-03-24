You want the renderer to become a pure sink for RenderIR, with zero “shape interpretation” logic beyond: dispatch by topology id, read point buffers, issue canvas calls. The big difference from what you have now is that today your renderer is still doing three jobs that do not belong there long-term:
1.	Decoding heterogeneous “shape modes” (ShapeDescriptor | ArrayBufferView | number)
2.	Looking up and remapping params dynamically (param0..N → name)
3.	Owning an out-of-band geometry channel (pass.controlPoints separate from pass.shape)

In the future design, the renderer should see one normalized shape representation, already resolved, and it should not contain any policy about “what a shape is,” only “how to rasterize this draw op.”

Below is the concrete future-proof renderer contract and what you change.

⸻

1) Change the RenderIR contract: renderer receives only resolved data

A. Remove ShapeDescriptor objects entirely

Replace pass.shape: ShapeDescriptor | ArrayBufferView | number with:
•	shape: Shape2DRef for uniform shape, or
•	shapeRefBuf: Uint32Array (packed) for per-instance shapes

Where Shape2DRef is the packed record you defined (topologyId, pointsSlot/buffer, count, flags, styleRef).

Critical point: the renderer does not know about “slots.” Slot resolution happens in the executor (or a render-assembly step) before calling the renderer.

So the renderer sees either:
•	shape: { topologyId, points: Float32Array, pointsCount, flags, style... }
or
•	a per-instance buffer of these (or struct-of-arrays), already pointing to concrete arrays.

No registry of slots, no maps, no “fieldSlots,” no runtime state inside renderer.

B. Remove pass.controlPoints

Geometry must be reachable from the shape reference. The render pass should never carry “extra geometry that only some shapes use.”

⸻

2) Make the renderer’s shape pipeline path-first and topology-dispatched

You already have topology verbs and a path draw loop; keep that as the only mechanism for arbitrary drawables.

A. Renderer input for paths (uniform)

type RenderPathShape = {
topologyId: number;
verbs: Uint8Array;        // or keep in registry keyed by topologyId
pointsPerVerb: Uint8Array; // optional if you can compute arity from verb
points: Float32Array;     // x,y interleaved, local space
pointsCount: number;      // number of vec2 points
flags: number;            // closed/fillRule/etc
};

But to keep the renderer tiny, you do not pass verbs every time; you pass topologyId and the renderer looks up a pre-registered immutable topology object (verbs, arities). That lookup is a constant-time array index, not a string map.

So: getTopologyByNumericId(topologyId): PathTopologyRuntime.

B. Topology lookup must be numeric + stable

Right now you do getTopology(shape.topologyId) where topologyId looks stringy. Change that.
•	Registry assigns numeric ids at init/compile time
•	topologyId in RenderIR is numeric
•	Renderer uses topologies[topologyId] array indexing

No string lookups, no hash maps. This matches your slot-addressed philosophy.

⸻

3) Fix coordinate space and transforms: local geometry + instance transform

Your current renderPathAtParticle multiplies control points by width/height, which bakes viewport into geometry. That makes “size” meaningless for paths and makes modulation unintuitive.

Future design:
•	All shape geometry points are in local space (centered around origin, typical range ~[-1..1] or in “shape units”)
•	Instance data supplies transform: translate/rotate/scale
•	Renderer applies transform once per instance: translate, rotate, scale
•	Then it draws path with points in local space: no width/height scaling

So path drawing becomes:

ctx.translate(xPx, yPx);
ctx.rotate(rot);
ctx.scale(sizePx, sizePx);
drawPathLocal(ctx, topology, points);

Where points are already “unit-ish.”

This is the single most important change for future expressiveness: it makes every path respond to the same modulators (position, rotation, size) in the same way as any other shape.

⸻

4) Separate geometry from style: renderer consumes explicit style ops

Right now style is implied by color and fill(). In the future you want:
•	fill vs stroke
•	stroke width
•	join/cap
•	dash pattern + dash phase
•	blend mode / globalAlpha

Don’t hide these inside “shape” or topology. They are render state, and should be explicit in RenderIR.

A. Make style part of pass data, not shape

Add fields (all can be uniform or per-instance):
•	fillColor (you already have)
•	strokeColor (optional)
•	strokeWidth
•	fillRule (uniform)
•	dash (uniform for now)
•	globalAlpha (optional)
•	blendMode (uniform per pass is fine)

Then per instance:
•	set style (or group by style keys for batching later)
•	draw path
•	fill/stroke accordingly

Canvas has stateful style, so you’ll want to minimize state changes later. But that optimization belongs in “render pass assembly/batching,” not inside topology logic.

⸻

5) Remove “determineShapeMode” and all branching on runtime types

The renderer should not do type-guard logic. That’s the executor’s responsibility.

So delete:
•	ShapeMode
•	determineShapeMode
•	legacy numeric encoding
•	perParticle placeholder branch

Instead the renderer gets two distinct pass kinds (future-proof):

A. Pass kind: uniform shape instancing

kind: 'instances2d_uniformShape'
shape: Shape2DResolved

B. Pass kind: per-instance shapes

kind: 'instances2d_shapeField'
shapeRefs: Uint32Array // packed shape refs, or arrays of ids + points buffers

This makes the renderer code path fully explicit, and it will stay clean as you add more.

⸻

6) Add “prevalidation” and “fast fail” at pass boundaries, not per instance

Your current code throws inside the particle loop if controlPoints missing. That’s correct to fail, but it’s in the wrong place.

Future design:
•	Validate once per pass:
•	topology exists
•	points buffer exists
•	pointsCount matches expected
•	Then loop instances with no checks

This is both faster and easier to debug.

⸻

7) Structure renderer internals around “draw ops,” not shape semantics

Long term you’ll have more than paths (images, text, sprites, gradients). If you start now with a “DrawOp” model, you won’t regret it.

Even if you only implement paths today, structure as:
•	RenderFrameIR
•	passes
•	ops (already batched)
•	DrawPathInstancesOp
•	later: DrawImageInstancesOp, DrawTextOp, etc.

Your current “pass.kind === ‘instances2d’” is okay, but the future shape of the renderer is “execute ops,” not “interpret high-level intent.”

⸻

8) Concrete “different than what you’ve got now” checklist

Delete / move out of renderer
•	ShapeDescriptor decoding
•	param name mapping
•	pass.controlPoints
•	legacy encoding support
•	perParticle placeholder errors

Add / enforce
•	numeric topology ids
•	resolved Shape2D values with embedded points buffer references (no slot awareness)
•	local-space geometry + instance transforms (size/rotate)
•	explicit style controls in RenderIR (fill vs stroke, stroke width)
•	pass-level validation + no checks inside hot loops
•	explicit pass kinds for uniform vs per-instance shape

⸻

The north-star mental model

Renderer = bytecode interpreter for drawing.
It should execute a compact, explicit render program (RenderIR) that already encodes all decisions: which topology, which points, which style, which transforms, in which order.

What you have now is a renderer that still participates in meaning-making (“what kind of shape is this?”). The future renderer should only participate in rasterization (“given this topology + points + style + transforms, draw”).