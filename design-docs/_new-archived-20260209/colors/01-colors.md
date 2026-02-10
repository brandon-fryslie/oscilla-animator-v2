Canonical conventions

Color representation in user-space
•	HSL uses normalized floats:
•	h ∈ [0,1) (wrap)
•	s ∈ [0,1] (clamp)
•	l ∈ [0,1] (clamp)
•	a ∈ [0,1] (clamp)
•	A "color value" in the graph is a `color` payload (stride 4):
•	colorHsl = (h, s, l, a).

Field vs signal

Every block below is cardinality-polymorphic:
•	If inputs are signals → outputs are signals.
•	If any input is a field (same instance extent) → outputs are fields.
•	No separate signal/field implementations; it's the same lowering shape with per-lane opcode dispatch for the scalar ops and a small set of structural intrinsics for pack/unpack and HSL→RGB.

Required intrinsics (minimal)

You need these runtime intrinsics (they can be registry kernels or dedicated ValueExpr kinds; see note at end):
•	construct(payloadKind, components...) for `color` payload
•	extract(componentIndex) for `color` payload
•	hslToRgb() (returns `vec3` or `color`; spec below)
Everything else can be opcodes.

⸻

1) ColorPicker (source)

Purpose

A constant authoring source that produces a user-space color (HSL+A).

Block identity
•	type: ColorPicker
•	category: color
•	role: user block

Ports

Inputs: none

Outputs:
•	color: `color` payload with unit colorHsl
CanonicalType:
•	payload: `color`
•	unit: `{ kind: 'color', unit: 'hsl' }`
•	extent: cardinality=one, temporality=continuous

Optional convenience outputs (if you want ergonomic wiring):
•	h: `float`
•	s: `float`
•	l: `float`
•	a: `float`

(These are derived from the same stored constant; no separate state.)

Parameters (UI-controlled, not graph inputs)
•	h: number default 0.0
•	s: number default 1.0
•	l: number default 0.5
•	a: number default 1.0

Lowering
•	Emit a single ConstValue color:
•	(wrap01(h), clamp01(s), clamp01(l), clamp01(a))
•	If you expose the scalar outputs, also emit scalar consts or extract from the color const (preferred: extract from color for consistency).

Invariants
•	Always outputs a valid HSL color:
•	h wrapped, others clamped at construction.

⸻

2) MakeColorHSL

Purpose

Pack scalar channels into a color value for ergonomics + composability.

Block identity
•	type: MakeColorHSL
•	category: color

Ports

Inputs:
•	h: `float`
•	s: `float`
•	l: `float`
•	a: `float` (default 1.0 via explicit upstream const if needed)

Outputs:
•	color: `color` payload, unit colorHsl

Cardinality rule: preserve / unify
•	If any input is field, output is field.
•	All field inputs must share the same instance extent.

Lowering semantics
•	h' = wrap01(h)
•	s' = clamp01(s)
•	l' = clamp01(l)
•	a' = clamp01(a)
•	Output: construct(color, h', s', l', a')

Notes
•	The wrap/clamp here is important: it means color validity is locally enforced, and downstream blocks can assume invariants.

⸻

3) SplitColorHSL

Purpose

Unpack a colorHsl color into channels for ergonomic graph editing.

Block identity
•	type: SplitColorHSL
•	category: color

Ports

Inputs:
•	color: `color` payload, unit colorHsl

Outputs:
•	h: `float`
•	s: `float`
•	l: `float`
•	a: `float`

Lowering semantics
•	h = extract(color, 0)
•	s = extract(color, 1)
•	l = extract(color, 2)
•	a = extract(color, 3)

Invariants
•	No additional clamping/wrapping (assume upstream enforced).
(If you want defensive behavior: wrap/clamp again, but that's usually redundant.)

⸻

4) HueShift

Purpose

Shift hue by an offset, preserving s/l/a.

Block identity
•	type: HueShift
•	category: color

Ports

Inputs:
•	color: `color` payload, unit colorHsl
•	shift: `float` (units: "turns", i.e. 1.0 = full cycle)

Outputs:
•	color: `color` payload, unit colorHsl

Lowering semantics
1.	Unpack:
•	h,s,l,a = SplitColorHSL(color)
2.	Compute:
•	h2 = wrap01(h + shift)
3.	Repack:
•	MakeColorHSL(h2, s, l, a)

Constraints
•	shift can be signal or field; output cardinality follows "any-field makes field".
•	No other channel changes.

⸻

5) MixColor

Purpose

Blend between two colors with parameter t.

Block identity
•	type: MixColor
•	category: color

Ports

Inputs:
•	a: `color` payload, unit colorHsl
•	b: `color` payload, unit colorHsl
•	t: `float` (usually clamped 0..1, but you can allow overshoot)

Outputs:
•	color: `color` payload, unit colorHsl

Semantics (HSL-space mix with hue wrap)

Mix rules:
•	t' = clamp01(t) (recommended; if you want power-user overshoot, skip clamp)
•	For s,l,a: linear interpolation:
•	s = lerp(sa, sb, t')
•	l = lerp(la, lb, t')
•	a = lerp(aa, ab, t')
•	For hue, do shortest-arc interpolation on the circle:
•	dh = wrapSigned(bh - ah) where result is in (-0.5, 0.5]
•	h = wrap01(ah + dh * t')

Definitions:
•	wrap01(x) = x - floor(x)
•	wrapSigned(x) = ((x + 0.5) - floor(x + 0.5)) - 0.5

Lowering shape
•	Split both colors → 8 scalars
•	Compute shortest-arc hue mix
•	Lerp other channels
•	Pack with MakeColorHSL (which wraps/clamps again)

Notes
•	This is the "correct" behavior artists expect; plain lerp on hue gives ugly jumps at wrap.

⸻

6) AlphaMultiply

Purpose

Opacity control that is easy to compose.

Block identity
•	type: AlphaMultiply
•	category: color

Ports

Inputs:
•	color: `color` payload, unit colorHsl
•	alpha: `float`

Outputs:
•	color: `color` payload, unit colorHsl

Semantics
•	alpha' = clamp01(alpha)
•	a2 = clamp01(a * alpha')
•	Other channels unchanged.

Lowering
•	Split → multiply → pack.

⸻

7) HSL → RGB (conversion)

You have two reasonable shapes. Pick one and be consistent.

Option 7A (recommended): convert colorHsl → rgba01 at materialization

This makes conversion the explicit boundary into render formats.

Block identity
•	type: HslToRgba
•	category: color or render

Ports

Inputs:
•	color: `color` payload, unit colorHsl
•	If you need it field-wise, this block should accept either signal or field.

Outputs:
•	rgba: `color` payload, unit `{ kind: 'color', unit: 'rgba01' }`
•	For signals: treat as a single-lane buffer or restrict to fields only; I'd restrict to field output used by render sinks.

Semantics
1.	Unpack h,s,l,a.
2.	Convert HSL→RGB in float [0,1]:
•	Define:
•	If s == 0: r=g=b=l
•	Else:
•	q = l < 0.5 ? l * (1 + s) : l + s - l*s
•	p = 2*l - q
•	r = hue2rgb(p, q, h + 1/3)
•	g = hue2rgb(p, q, h)
•	b = hue2rgb(p, q, h - 1/3)
•	hue2rgb(p,q,t):
•	t = wrap01(t)
•	if t < 1/6 return p + (q - p) * 6*t
•	if t < 1/2 return q
•	if t < 2/3 return p + (q - p) * (2/3 - t) * 6
•	else return p
3.	Output as `color` payload with unit rgba01:
•	Store (r, g, b, a) as float components in [0,1].
•	Quantization to 8-bit is a render concern, not a type system concern.

Implementation placement
•	This should be a registry field kernel (or a dedicated materializer intrinsic) because it involves color space conversion and is stride/type-specific.

Properties/tests
•	For random h,s,l,a in range:
•	output components are floats in [0,1]
•	deterministic

⸻

Option 7B: convert to float RGB first, pack later

If you want more composable "color math" in RGB space:
•	Add HslToRgb outputting `vec3` (r,g,b without alpha).
•	Then a separate step to pack with alpha into `color` payload with rgba01 unit.

This is more blocks, but it makes some effects easier later.

⸻

Answers to the key architectural questions embedded in this

Should extract/construct be registry kernels or new ValueExpr kinds?

Treat them as structural intrinsics (new ValueExpr kinds or ValueExprIntrinsic variants), not registry kernels:
•	They're not "named" domain operations; they're type-level structure.
•	They want to be inlined, validated, and potentially optimized.
•	They're used everywhere, so you don't want lookup overhead or "missing kernel" failure modes for them.

Do you need new kernel kinds?

No. All blocks above lower using:
•	existing opcode path for math
•	structural intrinsics for extract/construct
•	one registry kernel for HSL→RGB conversion
Everything fits your current map/zip/zipSig/broadcast/reduce shapes.

⸻

Small but important implementation rules
1.	MakeColorHSL is the enforcement point: wrap/clamp there.
2.	HueShift + MixColor must use wrap-aware hue logic.
3.	HslToRgba is the only place you do HSL→RGB conversion.
4.	Color uses the existing `color` payload kind (stride 4) — no new payload types needed. HSL vs RGB is distinguished by UnitType, not payload kind.
