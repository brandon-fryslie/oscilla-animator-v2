Mostly right, but I’d tighten two boundaries and remove one capability from the ValueRenderer layer to keep contracts crisp and prevent “UI glue” leaking into renderers.

What’s right
	•	Three-layer split (source → renderer → view mode) is the right shape.
	•	HistoryService keyed by semantic DebugTargetKey and rebinding on recompile is correct.
	•	ViewMode chosen by cardinality and fed by HistoryService for signals is correct.

What to change

1) SampleSource should not be “SignalValueResult vs FieldValueResult”

Those are upstream implementation artifacts. SampleSource should expose a minimal, stable interface the UI can depend on:
	•	kind: 'signal' | 'field'
	•	type: SignalType (resolved enough for payload/unit)
	•	count(): number
	•	readSample(i, outComponents4): { stride, flags } (allocation-free)
	•	getAggregate(outStats) for fields (min/max/mean/etc)

This way you can change how runtime/debug stores values without rewriting UI.

2) ValueRenderer should render only single values (and maybe a tooltip), not series/aggregate

If you let ValueRenderer implement renderSeries and renderAggregate, you’ll get duplicated chart logic and inconsistent visuals, and you’ll end up re-implementing sparklines for multiple payloads.

Better contract:
	•	ValueRenderer: formats and displays one sample (and optionally a compact “inline” variant).
	•	Chart primitives (Sparkline, DistributionBar) live outside the registry and are reused everywhere.
	•	ViewMode composes: Sparkline + ValueRenderer + DistributionBar, etc.

So the registry stays about formatting and per-sample representation, not charts.

3) Registry keys must match canonical unit IDs

Your examples (phase01, rgba01, scalar) must be consistent with your NumericUnit union. If NumericUnit is the closed set, the registry key space is payload + NumericUnit (or payload-only).

If you want rgba01, that is not a numeric unit; it’s a color payload convention, so it should be encoded in the payload renderer selection (payload = color) and not via unit.

Net result
	•	Layer 1: SampleSource is a small, stable adapter interface.
	•	Layer 2: ValueRenderer handles only single-sample display/formatting.
	•	Layer 3: ViewMode composes chart primitives + ValueRenderer, pulling history/stats from HistoryService.

With those edits, your decomposition is correct to proceed.

---

Yes — this split is now clean and enforceable, with two precise constraints to add so it stays crisp under growth.

What’s right
	•	SampleSource is a stable interface and avoids coupling UI to DebugService internals.
	•	ValueRenderer is single-sample only (no charts), so chart logic doesn’t fragment.
	•	Chart primitives are payload-agnostic and reusable.
	•	ViewMode composes everything and is the only place where “signal vs field” policy lives.

Two constraints to add (non-negotiable)

1) readSample must define component layout per payload (closed contract)

You need a canonical mapping so renderers and charts don’t guess:
	•	float|int|phase|unit|bool → stride=1, out[0]=value
	•	vec2 → stride=2, out[0]=x, out[1]=y
	•	vec3 (if/when) → stride=3
	•	color → stride=4, out[0..3]=rgba
	•	shape → not sampleable as floats; SampleSource.readSample must reject or return a sentinel and ViewMode must show a structured “shape summary” instead (topology id + key params). Don’t let “shape” silently degrade into numeric charts.

This is the critical place where “payload governs representation” becomes explicit.

2) Unit handling must be explicit and immutable at render time

Even though the registry is keyed by payload only, ValueRenderer must receive SignalType (or at least payload + unit) so it can display unit-specific decorations without inferring. Otherwise you’ll reintroduce implicit conversion behavior.

So change interface slightly:

renderFull(type: SignalType, sample: Float32Array, stride: number): ReactNode
renderInline(type: SignalType, sample: Float32Array, stride: number): ReactNode

Everything else can stay as you wrote it.

With those two constraints, the refined split is correct to proceed to the data flow section.

That statement.