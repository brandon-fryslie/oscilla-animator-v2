Just before the renderer, you want a single, explicit stage whose only job is:

Resolve the compiled program’s slot/expr outputs into a fully concrete, renderer-ready RenderFrameIR made only of typed arrays + numeric topology ids + small packed structs.

Right now, your Materializer is one piece of that: it turns FieldExpr into ArrayBufferView (typed arrays) using a buffer pool + caching. What you’re missing (or what needs to be refactored into place) is the stage that uses the materializer + scalar banks to produce final render passes with no remaining “IR” concepts inside them.

Below is the “future” structure of what happens immediately before the renderer, and how Materializer fits into it.

⸻

1) The missing stage: Render Preparation / Render Assembly

Call it RenderAssembler (or keep it inside your ScheduleExecutor if you prefer, but it should be logically separate). Inputs/outputs:

Input
•	CompiledProgramIR / current compiled schedule
•	RuntimeState containing:
•	scalar banks (f32/i32/shape2d packed)
•	field expr arrays + signal expr arrays
•	instance decls (counts/layout)
•	cache + buffer pool
•	“Render plan” emitted by compilation (the render steps from the schedule)

Output
•	RenderFrameIR where everything is concrete:
•	Float32Array / Uint8ClampedArray buffers for positions/colors/sizes/rotations/etc.
•	numeric topologyId
•	and for shapes: either
•	a resolved shape record that includes a concrete points buffer (Float32Array) and pointsCount, or
•	a packed per-instance shape buffer already expanded to what the renderer needs

Responsibilities of RenderAssembler (this is the key)
1.	Resolve field references via Materializer.materialize(fieldExprId, instanceId, ...) for every field the pass needs.
2.	Resolve scalar references by reading scalar slot banks directly.
3.	Resolve shape2d by:
•	reading the packed shape2d scalar slot bank
•	fetching topology by numeric id
•	fetching the control points field buffer by slot/expr id
•	validating once-per-pass that verbs/arity/pointCount match
4.	Emit render passes that are already normalized
•	no “shape modes”
•	no “param name mapping”
•	no “controlPoints side channel”

This is where you enforce the invariant “Renderer is sink-only.”

⸻

2) How Materializer.ts fits (and what it implies)

Your Materializer is already the right kind of component: it’s pure, deterministic, and returns typed buffers. It is the correct place to evaluate:
•	Field<float>, Field<vec2>, Field<color>, etc.
•	kernels like polygonVertex, circleLayout, jitter, attractors, etc.

In your path-first design, control points are just Field<vec2>, so Materializer is exactly what produces the geometry buffer.

What’s important about the current Materializer:
•	It caches per (fieldId, instanceId) per frame (state.cache.frameId) — good.
•	It relies on instance.count being a number — that’s fine as long as the instance decls are updated during compilation/hot-swap.
•	It uses getBufferFormat(expr.type.payload) and allocates count lanes — this is where vec2 is implicitly treated as “2 floats per lane” by the buffer format.

What’s missing for your shape pipeline:

Right now, Materializer returns buffers, but there’s no stage that:
•	knows which buffers correspond to render semantics
•	correlates “a shape” with “its control points”
•	produces a render-ready structure that makes the renderer trivial

So: do not put shape logic into Materializer. Keep it in RenderAssembler.

⸻

3) What changes right before the renderer, concretely

A) Render steps should reference slot ids / expr ids, not carry buffers early

If your RenderPassIR currently carries actual buffers too early, it makes it hard to do correct caching and batching. The future structure is:
•	Schedule execution produces slot values
•	RenderAssembler reads those slots and materializes fields only for the render sinks that are actually used
•	Then it emits a RenderFrameIR with concrete buffers

This gives you:
•	late materialization
•	better caching
•	easy multi-sink support

B) Shape2D resolution happens here (not in renderer)

Shape2D should arrive at renderer already “resolved”:
•	topologyId numeric
•	topology is known (verbs)
•	points buffer is a Float32Array
•	pointsCount is known
•	flags/style are known

So the renderer doesn’t do:
•	registry lookups by string
•	checking “is shape descriptor”
•	pass.controlPoints hacks

C) Pass-level validation happens here

Any mismatch (verbs arity vs points count) is detected once per pass, and you throw/diagnose before the hot loop.

⸻

4) Practical implications / necessary refactors (nothing off-limits)

Given the type direction you chose (packed shape2d bank), here’s what almost certainly changes in core runtime plumbing:

RuntimeState: scalar banks become typed

If you currently only have Float32Array scalars, you will need separate banks (or a tagged/offset slotMeta system):
•	scalarsF32
•	scalarsI32
•	scalarsShape2D (packed Uint32Array with fixed stride)

This is the “real” solution that matches your invariants (slot-addressed, no runtime dispatch).

SlotMeta must know storage kinds

Slot allocation must record whether a scalar slot is f32, i32, or shape2d. That’s how RenderAssembler knows how to read it.

RenderIR types must be split into:
•	IR references (slot/expr ids) produced by schedule execution
•	Concrete renderer input produced by RenderAssembler

Don’t let the renderer see IR references.

⸻

5) Materializer-specific changes you’ll likely make (for the new shape pipeline)

Even though shape logic doesn’t belong inside Materializer, a few things become important when control points become first-class:
1.	Make getBufferFormat('vec2') unquestionably correct
•	It must allocate Float32Array sized count * 2
•	and the pool must treat it as one allocation unit (not “count floats”)
2.	Stop scaling vec2 fields to viewport inside the renderer
•	Control points should be local-space and scaled by instance size/transform later
•	That implies your kernels like polygonVertex should output points roughly on unit radius (or radius signals), not normalized to screen
3.	Add kernels that operate on Field<vec2> as map/zip/zipSig
•	These will be your “modulators” for geometry:
•	translate/rotate/scale in local space
•	noise warp
•	twist
•	smoothing / resample later
•	These all remain in Materializer via kernel ops, which is exactly where they belong

⸻

6) The shortest correct description of “what happens right before the renderer”
    1.	Schedule executes, filling scalar banks and defining which field expr ids are needed.
    2.	RenderAssembler walks the render sinks and:
          •	materializes required fields via Materializer
          •	reads scalar banks for uniforms
          •	resolves shape2d → (topologyId, pointsBuffer, flags/style)
          •	groups into passes and outputs a RenderFrameIR with only concrete buffers and numeric topology ids
    3.	Renderer draws that RenderFrameIR with no special cases.

That is the clean, future-proof seam between “runtime” and “renderer,” and it’s consistent with the project summary’s “Renderer is sink only; receives render commands” statement.

Yes: in your current module surface, the thing that is “just before the renderer” is executeFrame in ScheduleExecutor, because it is the only place where render data can be assembled into a RenderFrameIR. In the architecture you want, that “render assembly” step is part of the runtime (it runs every frame), and it happens after schedule evaluation has produced slot/expr outputs but before any Canvas calls.

Concretely, the correct layering is:
1.	Runtime executes the program (time → signals → fields → state → schedule steps)
2.	Runtime assembles a render-ready RenderFrameIR (materialize fields, resolve packed shape2d, validate)
3.	Renderer consumes RenderFrameIR (Canvas only)

So: it comes after “the runtime’s evaluation work,” but it still lives inside the runtime package because it is the runtime’s responsibility to turn IR outputs into render commands.

What those exports are, in that framing
•	RuntimeState, advanceFrame, continuity, etc. → core runtime state/time system.
•	materialize → field evaluation / buffer creation (a subroutine the assembly step uses).
•	executeFrame (ScheduleExecutor) → should become the orchestrator that:
•	advances time
•	evaluates schedule
•	assembles RenderFrameIR (this is the seam you’re asking about)

Right now, your renderer is doing part of what should be in the runtime (shape decoding, control-point plumbing). The “future” change is not “add a whole new layer outside runtime,” it’s:
•	Make executeFrame (or a helper it calls, e.g. RenderAssembler) output a fully resolved, normalized render IR, so the renderer no longer does any interpretation.

The specific change you want inside ScheduleExecutor.executeFrame

executeFrame should return RenderFrameIR where:
•	Every buffer is already a typed array (positions/colors/sizes/rotations)
•	Shapes are already resolved to a single normalized representation:
•	numeric topologyId
•	concrete Float32Array control points (local-space)
•	pointCount/flags/style as simple numbers
•	No ShapeDescriptor | ArrayBufferView | number unions
•	No pass.controlPoints side channel
•	No param-name mapping

So the renderer becomes a strict sink that only:
•	loops passes
•	loops instances
•	applies transforms and styles
•	draws by topology verbs + points

That is the correct “before renderer” location, and in your current structure it belongs in ScheduleExecutor (or in a new file it calls, but still under runtime/).