Good, this is exactly the place to make things sharp.

Right now applySignalKernel is doing three different jobs with one name-space:
•	oscillator-ish phase-domain stuff (sin, cos, tan, triangle/square/saw),
•	generic math (abs, log, pow, min, max, clamp, …),
•	0–1 shaping / easing (easeInQuad, smoothstep, etc.) and noise.

That blurs semantics. You want three clean layers:
1.	Opcodes – raw math, scalar or vec, no special domain.
2.	Signal kernels – domain-specific scalar → scalar building blocks (oscillators, easing, noise).
3.	Field kernels – vec/field operations (geometry, layout, vec2 trig, etc.).

applySignalKernel is layer 2 only.

⸻

1. Canonical contract for signal kernels

Make this the rule:

A signal kernel is a pure number^N → number function with a fixed arity, well-defined input domain and well-defined output range, and it is not type-generic (no vec2, no shape, no state).

Concretely:
•	Type: (values: number[]) => number with a fixed values.length (1–3).
•	No access to RuntimeState beyond the arguments given.
•	No vec2, vec3, color, etc. Those go to field kernels / opcodes.
•	Domain and range are part of the kernel spec and never change once shipped.
•	Any kernel that has no special domain/range semantics should not be a kernel; it should be an opcode.

So the “what belongs here?” test is:
•	Is this function semantically different from a raw math opcode (e.g. phase-based sin, bounce easing, seed-based noise)?
→ Kernel.
•	Is this generic math/transcendental/compare (abs, log, max, pow, …)?
→ Opcode only.

⸻

2. Categories you actually want in applySignalKernel

I’d restrict this to three categories:

(A) Oscillator / phase-domain kernels
•	Input: phase, logical domain p ∈ [0,1), but you must wrap internally.
•	Output: usually [-1,1] or [0,1], defined per kernel.
•	Trig kernels that act on phase, not radians.

Canonical set:
•	oscSin(p) → [-1,1]
•	oscCos(p) → [-1,1]
•	oscTan(p) → unbounded, but still phase → radians.
•	oscTriangle(p) → [-1,1]
•	oscSquare(p) → {-1,1}
•	oscSaw(p) → [-1,1]

Contracts:
•	They always wrap with pWrapped = p - floor(p); user doesn’t have to.
•	They never change domain/range across versions.

(B) Shaping / easing kernels (0..1 domain)
•	Input: t ∈ [0,1] (but you clamp internally).
•	Output: u ∈ [0,1].
•	Examples:
•	easeInQuad
•	easeOutQuad
•	easeInOutQuad
•	easeInCubic
•	easeOutCubic
•	easeInOutCubic
•	easeInElastic
•	easeOutElastic
•	easeOutBounce
•	smoothstep(edge0, edge1, x) – this is a shaping function.
•	You might keep step(edge, x) here as a shaping primitive.

Rule:
•	For 1-arg easings: clamp t into [0,1] internally.
•	For smoothstep(edge0, edge1, x):
•	treat edge0 != edge1 as required; if equal, define behavior (e.g., return 0).
•	clamp inside the kernel.

(C) Noise kernels
•	Input: arbitrary real (phase/time/whatever).
•	Output: u ∈ [0,1) or [-1,1] depending on variant.
•	Must be deterministic given the input and the program’s seed.

Examples:
•	noise1(x) – 1D noise, [0,1).
•	Later: noiseSigned1(x) – 1D noise, [-1,1].
•	Later: noise2(x,y) – but that’s 2-arg; still signal if we treat it scalar.

⸻

3. What should not be in applySignalKernel

All of these should live only in applyOpcode:
•	abs, floor, ceil, round, fract
•	sqrt, exp, log
•	pow
•	min, max
•	clamp (unless you want a domain-specific mapping; I’d keep it as opcode)
•	mix
•	sign

You already have an opcode interpreter; duplication here is unnecessary and blurs the contract.

Also, field/layout kernels:
•	polarToCartesian
•	offsetPosition
•	circleLayout
•	circleAngle

You correctly reject them already; they should stay out completely.

⸻

4. Concrete changes to your existing function

4.1 Rename + re-spec trig kernels

Right now:

case 'sin': // expects phase [0,1)
return Math.sin(values[0] * 2 * Math.PI);

That’s surprising: name says “math sin”, behavior is “oscillator sin”.

Change to:
•	Opcode sin → radians, generic math (lives in applyOpcode).
•	Kernel oscSin → phase.

Implementation:

case 'oscSin': {
if (values.length !== 1) throwArity('oscSin', 1, values.length);
const p = wrapPhase(values[0]);   // p ∈ [0,1)
return Math.sin(p * 2 * Math.PI); // [-1,1]
}
case 'oscCos': {
if (values.length !== 1) throwArity('oscCos', 1, values.length);
const p = wrapPhase(values[0]);
return Math.cos(p * 2 * Math.PI);
}
case 'oscTan': {
if (values.length !== 1) throwArity('oscTan', 1, values.length);
const p = wrapPhase(values[0]);
return Math.tan(p * 2 * Math.PI);
}

Where:

function wrapPhase(p: number): number {
const t = p - Math.floor(p);
// t ∈ [0,1)
return t;
}

And add at top:

function throwArity(name: string, expected: number, got: number): never {
throw new Error(`Signal kernel '${name}' expects ${expected} input(s), got ${got}`);
}

4.2 Make oscillator kernels all phase-wrapped

You already do % 1 on triangle/square/sawtooth; keep that and align trig:

case 'triangle': {
if (values.length !== 1) throwArity('triangle', 1, values.length);
const t = wrapPhase(values[0]);   // [0,1)
return 4 * Math.abs(t - 0.5) - 1; // [-1,1]
}
case 'square': {
if (values.length !== 1) throwArity('square', 1, values.length);
const t = wrapPhase(values[0]);
return t < 0.5 ? 1 : -1;
}
case 'sawtooth': {
if (values.length !== 1) throwArity('sawtooth', 1, values.length);
const t = wrapPhase(values[0]);
return 2 * t - 1; // [-1,1]
}

4.3 Move generic math out

Delete these cases from applySignalKernel:
•	abs, floor, ceil, round, fract, sqrt, exp, log, pow, min, max, clamp, mix, smoothstep, step, sign.

Re-introduce only those you consider shaping functions as kernels under explicit names, e.g.:
•	smoothstep can stay – it’s a shaping primitive, nicely named.
•	step can stay – but you might want step(edge, x) as a shader-style shaping function.

If you keep them, treat them as shaping category, not generic math, and be explicit:

case 'smoothstep': {
if (values.length !== 3) throwArity('smoothstep', 3, values.length);
const edge0 = values[0], edge1 = values[1], x = values[2];
if (edge0 === edge1) return x < edge0 ? 0 : 1; // defined behavior
const t = clamp01((x - edge0) / (edge1 - edge0));
return t * t * (3 - 2 * t);
}

Where:

function clamp01(x: number): number {
return x < 0 ? 0 : x > 1 ? 1 : x;
}

4.4 Keep easing + noise as the “signal-kernel” sweet spot

The easing functions and noise are good examples of “this belongs here”:
•	They are scalar → scalar
•	Have specific domains/ranges
•	Are not generic math

Just add consistent input clamping comments:

case 'easeInQuad': {
if (values.length !== 1) throwArity('easeInQuad', 1, values.length);
const t = clamp01(values[0]);
return t * t;
}
...
case 'easeOutBounce': { /* clamp t into [0,1] first */ }

And for noise:

case 'noise': {
if (values.length !== 1) throwArity('noise', 1, values.length);
const x = values[0];
const n = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
const f = n - Math.floor(n); // [0,1)
return f;
}

You might rename to noise1 if you later add more noise variants.

⸻

5. How to keep contracts crisp when adding new functionality

Rule 1 – Pick the layer deliberately

When you add a new function, ask:
•	Is it a generic numeric op? → add an opcode, not a kernel.
•	Does it have strong domain/range semantics (phase, 0–1, [-1,1], etc.) or composer-level meaning (oscillator, envelope, noise)? → kernel.
•	Does it operate on vec2/vecN/fields? → field kernel or opcode.

Codify that in comments at the top of each file:

// Signal kernels:
// - scalar in → scalar out
// - domain/range defined per kernel
// - phase/easing/noise semantics only
// - NO vec2, NO generic math; those are opcodes

Rule 2 – Encode semantics in names

Avoid generic names with special semantics; they’re traps.
•	Use oscSin / oscCos instead of bare sin, cos.
•	Use noise1, noiseSigned1 instead of noise if you have multiple ranges.
•	Use easeIn..., easeOut... prefixes consistently.

This stops you from later adding a “different” sin or noise that behaves differently but shares a name.

Rule 3 – Domain checks at runtime, invariants in docs

Each kernel should:
•	Validate arity.
•	Normalize or clamp its inputs according to its domain.
•	Return values within a documented range.

And the doc comment (and your IR/type docs) should state for each kernel:
•	Input domain: x ∈ [0,1] or “any real, internally wrapped to [0,1)” etc.
•	Output range: f(x) ∈ [-1,1] or [0,1].
•	Behavior outside domain, if relevant.

Rule 4 – Type system helps prevent misuse

Don’t allow shapeRef or anything non-scalar to ever reach applySignalKernel:
•	The IR builder should only emit PureFn.kind='kernel' for scalar signals.
•	Type checker must ensure kernel call sites only have payload='float' signals.
•	In evaluateSigExpr, the shapeRef branch must not call applySignalKernel at all.

You already have a guard comment; backing it with type-level rules keeps the line crisp.

⸻

6. A reduced, canonical applySignalKernel after cleanup

Conceptually, it should look like this:

function applySignalKernel(name: string, values: number[]): number {
switch (name) {
// Oscillators (phase-domain [0,1) → [-1,1] or derived)
case 'oscSin':
case 'oscCos':
case 'oscTan':
case 'triangle':
case 'square':
case 'sawtooth':
return applyOscKernel(name, values);

    // Shaping / easing (0..1 → 0..1)
    case 'smoothstep':
    case 'step':
    case 'easeInQuad':
    case 'easeOutQuad':
    case 'easeInOutQuad':
    case 'easeInCubic':
    case 'easeOutCubic':
    case 'easeInOutCubic':
    case 'easeInElastic':
    case 'easeOutElastic':
    case 'easeOutBounce':
      return applyEasingKernel(name, values);

    // Noise
    case 'noise':
      return applyNoiseKernel(values);

    default:
      throw new Error(`Unknown signal kernel: ${name}`);
}
}

No generic math, no vec2, no geometry.

That’s your “canonical kernel surface”: small, high-semantic-density, and clearly distinct from opcodes and field kernels.