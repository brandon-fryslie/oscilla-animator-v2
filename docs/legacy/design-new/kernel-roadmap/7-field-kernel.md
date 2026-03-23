Yeah, this file is absolutely doing double-duty right now. It’s both:
1.	Field evaluator / materializer (the thing that turns FieldExpr into buffers), and
2.	Field-kernel library (all the geometry/layout/jitter/color ops).

Those are conceptually different layers, and they’re also entangled with a third thing:
3.	Scalar math kernels (sqrt/floor/ceil/round) that really belong in the opcode layer.

Let me walk through what it’s doing today and how I’d split it, then call out what should change concretely.

⸻

1. What this file is actually doing now

1.1 Core materializer (good, should stay)

These parts are the right responsibilities for Materializer:
•	materialize(...)
•	cache lookup + frame stamp
•	get FieldExpr
•	look up InstanceDecl
•	allocate buffer via BufferPool
•	call fillBuffer(...)
•	cache result
•	fillBuffer(expr, buffer, instance, ...)
This is the IR dispatcher over FieldExpr.kind:
•	'const'
•	'intrinsic'
•	'broadcast'
•	'map'
•	'zip'
•	'zipSig'
•	'array'
•	'layout'

This is all correct “IR → buffer” orchestration logic.

1.2 Intrinsics + layout (also belongs here)

These are also “materializer” responsibilities:
•	fillBufferIntrinsic(...)
•	index
•	normalizedIndex
•	randomId
•	position
•	radius
•	fillLayoutPosition(...)
•	fillLayoutRadius(...)
•	pseudoRandom(...)

These are per-instance, per-element base fields that depend on InstanceDecl.layout. They’re not generic kernels; they’re part of the “instance identity + layout” layer.

1.3 Field-kernel layer (this is where it’s mixed)

These chunks are effectively your FieldKernel system:
•	applyMap(...) (kernel branch)
•	applyZip(...) (kernel branch → applyKernel)
•	applyZipSig(...) (kernel branch → applyKernelZipSig)
•	applyKernel(...)
•	applyKernelZipSig(...)

Inside that you have a mix of:
•	Scalar numeric kernels (sqrt, floor, ceil, round in applyMap)
•	Vec2 / geometry / layout kernels:
•	makeVec2
•	fieldPolarToCartesian
•	polygonVertex
•	circleLayout, circleAngle
•	fieldGoldenAngle, fieldAngularOffset, fieldRadiusSqrt
•	Field effects / dynamics:
•	jitter2d, fieldJitter2D
•	attract2d
•	fieldPulse
•	fieldAdd
•	Color kernels:
•	hsvToRgb (both in applyKernel and applyKernelZipSig)
•	applyOpacity
•	fieldHueFromPhase

That’s the double-duty: some of these are true “field kernels” (vec2/color/field ops), but some are just scalar math that should be opcodes.

⸻

2. The correct split

There are three distinct layers that want to exist:
1.	Opcode layer – scalar math only.
2.	Signal kernel layer – scalar, domain-specific (oscillators/easing/noise).
3.	Field kernel layer – vec2/color/field-level operations (what you highlighted).

Materializer.ts should only own:
•	IR + instance + buffer orchestration
•	intrinsic field production
•	calling out into the field kernel registry / helpers

The actual “what kernel X does to these typed arrays” should live in a separate conceptual unit, even if you keep it in the same file for now.

So:

2.1 What stays in Materializer
•	materialize(...)
•	fillBuffer(...) (but slimmed to just IR dispatch)
•	fillBufferIntrinsic(...)
•	fillLayoutPosition(...)
•	fillLayoutRadius(...)
•	pseudoRandom(...)

2.2 What moves to a FieldKernel registry (conceptually)

These should be treated as field kernels:
•	makeVec2
•	hsvToRgb (both forms)
•	jitter2d, fieldJitter2D
•	attract2d
•	fieldAngularOffset
•	fieldRadiusSqrt
•	fieldAdd
•	fieldPolarToCartesian
•	fieldPulse
•	fieldHueFromPhase
•	applyOpacity
•	circleLayout (zipSig)
•	circleAngle
•	polygonVertex

And they should be the only things behind fn.kind === 'kernel' in this file.

2.3 What should move out of “kernel” and into opcode

These should not be kernels at all:

In applyMap:

case 'sqrt'
case 'floor'
case 'ceil'
case 'round'
case 'fieldGoldenAngle'

	•	sqrt, floor, ceil, round → scalar math opcodes.
	•	fieldGoldenAngle is conceptually a field kernel (it’s a shaping for angular field), not a scalar kernel used only in map.

So:
•	Remove scalar sqrt/floor/ceil/round branches from applyMap’s kernel path.
•	Add them as opcodes in OpcodeInterpreter.
•	Let map always route scalar math through fn.kind === 'opcode'.

fieldGoldenAngle should be moved to the field-kernel side (like fieldAngularOffset).

⸻

3. How fieldPolarToCartesian fits, and its contract

The selected bit:

} else if (kernelName === 'fieldPolarToCartesian') {
// Polar to Cartesian: (centerX, centerY, radius, angle) -> vec2
// Inputs: [centerX, centerY, radius, angle]
...
outArr[i * 2 + 0] = cx + r * Math.cos(a);
outArr[i * 2 + 1] = cy + r * Math.sin(a);
}

This is exactly what a field kernel should be:
•	Input fields:
•	centerX: Field<float>
•	centerY: Field<float>
•	radius: Field<float>
•	angle: Field<float>
•	Output:
•	Field<vec2>

The kernel itself is coordinate-space agnostic: it just adds cx + r cos(a), cy + r sin(a).

The space semantics come from the ports:
•	If you feed it world-normalized centerX/Y and world-normalized radius, the result is world coordinates.
•	If you feed it (0,0) and local radius, the result is local geometry for a shape.

So the crisp contract is:

fieldPolarToCartesian is a generic vec2 field kernel: (centerX, centerY, radius, angle) → vec2, applied lane-wise. It does not know or care about coord space; the block that uses it defines whether it’s local or world.

That keeps it from doing double-duty semantically in the kernel itself; it’s just a mechanical transform.

Where you must be disciplined is at the block level:
•	CircleLayout or “world polar positioning” block:
•	interpret inputs as world center/radius/angle
•	feed fieldPolarToCartesian to compute world position fields.
•	ShapePolygon or “local polar geometry” block:
•	interpret radiusX/Y as local units
•	either use polygonVertex directly or call fieldPolarToCartesian with center=(0,0) to compute local control points.

⸻

4. Concrete code changes I’d make

4.1 Tighten applyMap

Right now:

if (fn.kind === 'opcode') {
const op = fn.opcode;
for (let i = 0; i < N; i++) {
outArr[i] = applyOpcode(op, [inArr[i]]);
}
} else if (fn.kind === 'kernel') {
// sqrt, floor, ceil, round, fieldGoldenAngle
...
} else {
throw new Error(...);
}

Change to:
•	Move sqrt, floor, ceil, round to opcodes.
•	Move fieldGoldenAngle into applyKernel as a field kernel (it clearly depends on per-element id/normalized index semantics).

Then simplify:

if (fn.kind === 'opcode') {
const op = fn.opcode;
for (let i = 0; i < N; i++) {
outArr[i] = applyOpcode(op, [inArr[i]]);
}
} else {
throw new Error(`Map function kind ${fn.kind} not implemented (map only supports opcodes)`);
}

Result: no scalar kernels here, only opcodes.

4.2 Treat applyKernel and applyKernelZipSig as the FieldKernel registry

You don’t have to move them to another file today, but conceptually:
•	Rename the parameter kernelName → fieldOp or similar.
•	Add a comment:

// Field kernels:
// - vec2/color/field operations applied element-wise
// - no scalar-only math (that’s opcodes)
// - coord space is defined by calling block, not by this kernel itself

Keep only true field ops here:
•	makeVec2
•	hsvToRgb
•	jitter2d / fieldJitter2D
•	attract2d
•	fieldAngularOffset
•	fieldRadiusSqrt
•	fieldAdd
•	fieldPolarToCartesian
•	fieldPulse
•	fieldHueFromPhase
•	applyOpacity
•	circleLayout
•	circleAngle
•	polygonVertex
•	fieldGoldenAngle (moved here)

Anything that is scalar math-only or domain-agnostic belongs in OpcodeInterpreter.

4.3 Keep intrinsics/layout separate from kernels

Right now you already do this well:
•	position intrinsic → fillLayoutPosition
•	radius intrinsic → fillLayoutRadius

Don’t try to reuse fieldPolarToCartesian or circleLayout for those; keep them as “base layout” semantics, not just another kernel. That keeps the hierarchy clear:
•	Intrinsics + layout = “where are my lanes”
•	Field kernels = “how do I transform/combine lanes”

4.4 A small arity hygiene pass

Same as I suggested for opcodes: for field kernels, enforce arity explicitly:
•	fieldPolarToCartesian requires exactly 4 inputs.
•	circleLayout zipSig requires normalizedIndex + [radius, phase].
•	polygonVertex requires 3 signals.

You already throw when lengths mismatch; keep that pattern strict (no partial fallbacks).

⸻

5. Summary: what’s double-duty and how to unmix it
   •	✅ materialize, fillBuffer, intrinsics, layout = correct responsibilities for Materializer.
   •	✅ applyKernel / applyKernelZipSig = de facto FieldKernel layer (this is good, we just need to name it as such).
   •	❌ applyMap’s fn.kind === 'kernel' branch doing scalar math = double-duty with OpcodeInterpreter.
   •	✅ fieldPolarToCartesian is correctly a field kernel: it’s just vec2 polar transform; coord space is defined by the blocks that feed its inputs.

So the “correct split” is:
•	OpcodeInterpreter: scalar numeric operations only, no coord semantics.
•	SignalEvaluator kernels: scalar phase/easing/noise.
•	Materializer:
•	translates FieldExpr into buffers
•	provides intrinsics + instance layout
•	calls a field-kernel registry for vec2/color/field operations (fieldPolarToCartesian, polygonVertex, etc.)

And then on top of that, your blocks define whether a given kernel is being applied to world positions or local control points, so the kernel code itself stays mechanically simple and coordinate-agnostic.