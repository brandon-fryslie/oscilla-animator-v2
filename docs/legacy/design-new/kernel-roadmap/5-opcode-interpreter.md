Short answer: this is a good opcode interpreter, not a kernel table. Don’t rename it to OpcodeKernel – that’ll blur the distinction we just carved out between:
•	opcodes = generic numeric primitives (this file)
•	signal kernels = domain-specific scalar → scalar shapes (oscillators, easing, noise wrappers)

So keep this as your SINGLE ENFORCER for math, and keep kernels in the SignalEvaluator.

Now the detailed pass.

⸻

1. What belongs here (and does belong)

This file is almost perfectly aligned with the “opcode” role:
•	Unary, generic math:
•	neg, abs, sin, cos, tan, wrap01
•	N-ary, generic math:
•	add, sub, mul, div, mod, min, max, clamp, lerp
•	Deterministic hash:
•	hash(value, seed) → [0,1)

These all fit the contract:

Pure numeric operations, no notion of phase/world/local, no vec2/shape/field awareness, no runtime state.

And your header comment nails the critical separation:

Opcode sin/cos/tan operate on radians, not phase.
For phase-based oscillators, use SignalEvaluator kernels.

That’s exactly the boundary we want.

So:
•	✅ Name OpcodeInterpreter is good.
•	✅ Contents are mostly the right set of primitives.
•	✅ This should not be renamed to OpcodeKernel (kernels are a separate layer).

⸻

2. What’s missing (if you want a canonical math surface)

You don’t have to add these now, but if you want the opcode layer to be “complete enough that nobody bypasses it,” you typically include:

More unary math:
•	floor, ceil, round
•	fract (x − floor(x))
•	sqrt
•	exp, log
•	sign (−1/0/1)

Binary math:
•	pow(a, b) – probably better as opcode than a kernel.

These are all pure, generic math and fit here nicely.

You already have:
•	wrap01 – good generic helper (R → [0,1)), also useful for kernels.
•	hash – low-level primitive you can use to build noise kernels.

So: nothing is wrongly here; you’re just light on some obvious math ops.

⸻

3. What doesn’t belong here (and currently doesn’t exist here, which is good)

Given the separation we defined earlier, do not let these sneak into OpcodeInterpreter:
•	Phase-based oscillators (oscSin, triangle, square, sawtooth) – those live in SignalKernel/SignalEvaluator.
•	Easing functions (easeInQuad, easeOutBounce, etc.) – also kernels.
•	Noise with semantic domain/range (noise1, noiseSigned1) – kernels that internally call hash.

Also keep vec2/geometry/layout out of here:
•	No polarToCartesian, circleLayout, offsetPosition, etc.
Those are field kernels or higher-level ops, not opcodes.

You’ve already kept that separation in practice, which is why this file looks pretty clean.

⸻

4. Design smells / cleanup inside this file

The main thing that could bite you later is fuzzy arity semantics.

4.1 Fuzzy arity right now

Examples:
•	sub:

case 'sub':
return values.length >= 2 ? values[0] - values[1] : -values[0];

What happens with 3+ args? Right now it silently ignores everything after values[1].

	•	div, mod behave the same.
	•	clamp:

case 'clamp':
return values.length >= 3
? Math.max(values[1], Math.min(values[2], values[0]))
: values[0];

If you accidentally pass 2 args, you get a no-op instead of an error.

	•	lerp behaves similarly.

This is convenient in the moment, but it makes it hard to reason about patches and encourages subtle bugs.

4.2 Make opcode arity strict and explicit

Given your “SINGLE ENFORCER” rule, I’d tighten this:
•	Some ops are genuinely variadic: add, mul, min, max.
•	Some should be exactly 1: neg, abs, sin, wrap01, etc.
•	Some should be exactly 2: sub, div, mod, hash, pow.
•	Some should be exactly 3: clamp(x, min, max), lerp(a,b,t).

So:
•	If arity doesn’t match, throw, don’t degrade to identity or ignore extra args.
•	That gives you a clear semantic contract and easier debugging.

Pattern:

function expectArity(op: string, got: number, expected: number | [number, number]) {
// throw with useful error
}

Then:

case 'clamp':
expectArity('clamp', values.length, 3);
return Math.max(values[1], Math.min(values[2], values[0]));

4.3 Remove the “fallback unary from n-ary” path

At the bottom:

default:
// Try unary if single value
if (values.length === 1) {
return applyUnaryOp(op, values[0]);
}
throw new Error(`OpCode ${op} not implemented for ${values.length} args`);

This is mostly redundant because applyOpcode already routes 1-arg calls to applyUnaryOp directly.

Better:
•	Keep routing only in applyOpcode.
•	Make applyUnaryOp and applyNaryOp assume they were given correct values.length and just throw if the op doesn’t exist.

That reduces surprise and simplifies reasoning about dispatch.

⸻

5. Crisp contract for this file (what to write at the top and enforce)

You’re very close; I’d formalize it as:

OpcodeInterpreter.ts:
•	This is the only place that defines scalar numeric operations.
•	All opcodes are:
•	Pure: no side effects, no access to runtime state.
•	Scalar: number[] → number.
•	Domain-agnostic: no notion of phase/local/world; they operate on plain numbers.
•	Arity for each opcode is:
•	Variadic for: add, mul, min, max.
•	Exactly 1 for: neg, abs, sin, cos, tan, wrap01, and any other unary math.
•	Exactly 2 for: sub, div, mod, hash, pow, atan2, etc.
•	Exactly 3 for: clamp, lerp.
•	Radian trig only (sin, cos, tan).
•	Phase-based oscillators must be implemented as signal kernels.

And then separately:

SignalKernel / SignalEvaluator:
•	Only contains domain-specific scalar kernels:
•	Phase-domain oscillators (oscSin, triangle, square, sawtooth)
•	Easing functions (easeIn*, easeOut*, smoothstep, etc.)
•	Noise wrappers (noise1, noiseSigned1) that are built on hash.

Field kernels:
•	Only contain vec2/field/geometry operations:
•	polarToCartesian, circleLayout, warpPoints, etc.

If you keep those boundaries in mind, OpcodeInterpreter.ts is in good shape:
•	Don’t rename it to “kernel”.
•	Possibly add a few math ops.
•	Tighten arity and simplify dispatch.
•	Keep it the only source of scalar math truth.