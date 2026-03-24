You avoid duplication by making visualization follow the same separation you already need for execution:
1.	lane-shape (cardinality) handling is a wrapper layer
2.	value rendering is payload/unit-specific and reused everywhere

So the renderer for a CardinalityGeneric output never exists as a bespoke thing; it’s always:

CardinalityAdapterView ∘ ValueRenderer(payload, unit)

1) Define a single “ValueView” interface that only cares about one value at a time

A value renderer should accept a sample shape (scalar or vector/color) and draw it.
•	ValueRenderer<float:phase01> draws a phase dial
•	ValueRenderer<vec2:ndc2> draws a point glyph / XY
•	ValueRenderer<color:rgba01> draws a swatch

Crucially: it does not know whether the source was one or many.

2) Add a cardinality wrapper that turns one/many into “samples”

For visualization, cardinality is “how many samples are available at this frame.”

Create exactly two wrapper implementations:

2.1 ScalarSource (for one)

Produces a single sample:
•	sample count = 1
•	getSample(0) returns the single value

2.2 FieldSource (for many(instance))

Produces N samples:
•	sample count = lane count (or a downsampled view)
•	getSample(i) returns lane i
•	also supports aggregations (min/max/avg/histogram) and “selected lane” access

This wrapper is the only place that knows about instances, lane counts, intrinsics, selection, downsampling, etc.

3) Visualization composition rule

Given a port type and its resolved storage:
1.	Build a SampleSource from cardinality:
•	one → ScalarSource
•	many(instance) → FieldSource
2.	Choose a ViewMode based on cardinality (not on block kind):
•	one default: dial/number/sparkline
•	many default: distribution + selected lane trace (or sample grid)
3.	Render via the payload/unit renderer:
•	In sample-grid mode: render ValueRenderer repeatedly for samples
•	In distribution mode: use a small set of generic aggregators (see below), then render aggregator result via existing ValueRenderer or a small set of statistical views

So you reuse the same payload/unit code for outputs of:
•	cardinality-specific blocks
•	cardinality-generic blocks
•	anything else

4) Where CardinalityGeneric blocks fit

A CardinalityGeneric block may produce either:
•	one output (Signal)
•	many output (Field)

Your visualization logic does not branch on “is the upstream block generic?” It only branches on the resolved cardinality at this port.

This is the key: genericity disappears once the type is resolved.

5) Preventing duplication in aggregations

Don’t write “histogram for float”, “histogram for vec2”, etc.

Write exactly these generic aggregation primitives, keyed by payload/unit category:
•	For float/int:
•	min/max/avg/std
•	histogram
•	quantiles
•	For vec2/vec3:
•	per-component min/max/avg
•	magnitude distribution
•	bounding box
•	For color:
•	per-channel min/max/avg
•	luminance distribution (if you define luminance as a kernel; otherwise omit)

These aggregators operate on the underlying buffer format and produce either:
•	a scalar result (float:scalar, float:norm01)
•	a small vector result (vec2, vec3)
•	a small stats struct that is rendered by a single “stats view” (not per block)

6) Practical API shape (conceptual)
   •	SampleSource (cardinality wrapper)
   •	kind: 'scalar' | 'field'
   •	payload, unit
   •	count()
   •	sample(i) -> Value
   •	optional intrinsics() for field sources (position, index, id)
   •	optional aggregate(kind)
   •	ValueRenderer keyed by (payload, unit)
   •	renderSingle(value)
   •	optionally renderSeries(values) for sparklines if you keep history
   •	FieldViewModes (generic)
   •	sampleGrid(source, valueRenderer)
   •	distribution(source, aggregator)
   •	selectedLaneTrace(source, historyStore)

CardinalityGeneric blocks require zero special cases.
