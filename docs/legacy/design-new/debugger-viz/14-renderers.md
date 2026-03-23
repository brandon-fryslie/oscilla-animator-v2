It’s close, but there are a few hard spec violations and one structural mismatch with the constraints you already locked in.

A. Registry / lookup corrections

A1) Delete resolveUnit() and use type.unit directly

Your canonical CanonicalType has unit?: NumericUnit where NumericUnit is already the unit identifier. There is no “unit object” to resolve.
•	Replace: const unit = resolveUnit(type.unit);
•	With: const unit = type.unit; // NumericUnit | undefined

Keys become:
•	exact: ${payload}:${unit} only if unit !== undefined
•	payload-only: ${payload}

A2) Remove resolveExtent() from getValueRenderer()

Renderer selection is payload/unit only. Cardinality/temporality gating happens in ViewMode / SampleSource / HistoryService guards, not in the formatting registry.

So const resolved = resolveExtent(type.extent); must be removed.

A3) The fallback ladder must end in payload-category, not “generic numeric”

You already spec’d: exact → payload-only → payload-category fallback.

So you need:
•	categoryFallbacks['numeric'|'boolean'|'color'|'shape']

and genericNumericRenderer is only the category fallback for numeric.

A4) Don’t use string for unit in registry keys

Use NumericUnit (your closed union). That prevents “norm01 vs normalized” drift.

So the registered exact key is float:normalized (or float:phase, etc.), not float:norm01 unless you formally add norm01 to NumericUnit.

B. RendererSample type mismatch

You defined RendererSample as { mode:'scalar'; value:number } and { mode:'aggregate'; stats:AggregateStats }.

That cannot support color (stride 4) at all, because color is multi-component, and you explicitly want renderers to consume the component-wise AggregateStats (Float32Array length 4). Good.

But for scalar multi-component payloads (vec2/vec3/color signals later), value:number is insufficient. You have two choices; pick one and lock it:

Option (canonical, future-proof): scalar sample always uses a fixed 4-float buffer + stride

type RendererSample =
| { mode: 'scalar'; components: Float32Array; stride: Stride; type: CanonicalType }
| { mode: 'aggregate'; stats: AggregateStats; type: CanonicalType };

This matches your existing “sampleEncoding single source of truth” and prevents a second scalar encoding path later.

Given you already committed to AggregateStats being Float32Array(4) per component, do the same for scalar samples. It’s consistent and keeps ValueRenderer pure formatting.

C. FloatValueRenderer unit semantics must match NumericUnit

Your unit rules currently mention:
•	norm01
•	phase
•	scalar

But your NumericUnit union contains:
•	'phase' | 'radians' | 'normalized' | 'scalar' | 'ms' | '#' | 'degrees' | 'seconds'

So:
•	Replace norm01 with normalized
•	If you want to show clamp range behavior, it applies to unit === 'normalized', not a made-up unit.

Also: phase should not show any “wrap indicator” in the numeric renderer (you already locked “no instantaneous wrap detection”; history-delta only, in Sparkline). So FloatScalarDisplay can show “unit: phase” as metadata, but no wrap glyphs.

D. ColorValueRenderer: correct the “v1 constraint” reasoning

You wrote: “color signals won’t flow through the scalar path because updateSlotValue is scalar and HistoryService stride=1.”

That’s mixing two unrelated things:
•	HistoryService is scalar-signal-only for v1 (stride=1). True.
•	ValueRenderer is not limited by HistoryService. It formats whatever the SampleSource hands it.

So ColorValueRenderer should not rely on “color only appears as fields”. The correct spec statement is:
•	v1 SampleSources only emit scalar samples (stride=1) for signals (because only numeric payloads are sampleable in v1), but aggregate samples for fields may have stride 4 (color) and are valid.

In other words, ColorValueRenderer supports aggregate now; scalar color can be unsupported by SampleSource guards, not by renderer logic.

E. Concrete edits you should make to this section
1.	Registry lookup (payload+unit → payload-only → category):

	•	remove resolveExtent
	•	remove resolveUnit
	•	use NumericUnit directly
	•	add payload-category fallback

	2.	Change RendererSample scalar shape to (components, stride) instead of value:number.
	3.	Float renderer:

	•	unit === 'normalized' shows range/warn
	•	unit === 'phase' no wrap glyph
	•	unit === 'scalar' no range
	•	NaN/Inf badges ok

	4.	Color renderer:

	•	Primary path: aggregate uses mean/min/max arrays
	•	scalar color not required in v1; if encountered, generic fallback is fine, but the reason is “SampleSource doesn’t emit it yet”, not “impossible.”

With those changes, yes—this covers what you need for the formatting renderer architecture, and you can proceed to Sparkline + ViewModes.