Debug Panel Spec

0) Scope of what exists (and what else you might be missing)

In your model, “signals” and “fields” cover continuous values. You also have two additional first-class runtime categories that need their own debug UX:
1.	Events / triggers (temporality: discrete)
2.	Stateful primitives + continuity (persistent state, migration, and effective-vs-base values)

So the debug panel must support:
•	Signal: one + continuous
•	Field: many(instance) + continuous
•	Event: one|many + discrete
•	State: persistent storage keyed by StateId / lane
•	Continuity: base vs effective, mapping, gauge, policy

Everything below is structured around those.

⸻

1) Panel layout

1.1 Left rail: Target Browser

A navigable list of debug targets, grouped by:
•	By node/block (outputs and key intermediates)
•	By instance (all fields aligned to instanceId)
•	By sink/pass (render passes, if you expose them)
•	By diagnostics (errors/warnings)

Each target shows:
•	stable ID (short form) + human label
•	resolved type (payload, unit, extent) in compact form
•	cardinality summary (one or N@instance)
•	temporality badge (cont / disc)

1.2 Main area: Inspector

The selected target is shown in a consistent inspector with:
1.	Header

	•	target name, stable ID
	•	resolved type (payload/unit + extent axes)
	•	source attribution (which block output / expr / intrinsic / adapter chain)
	•	last update time / frame index

	2.	Primary View (chosen by rules below)
	3.	Secondary Views (optional but explicit, user-selectable)
	4.	Raw Data (structured dump + buffer metadata)
	5.	Diagnostics & Contracts (type mismatches, NaN, out-of-range, continuity warnings)

⸻

2) Signal debug view spec (one + continuous)

2.1 Primary view (type-driven)

Selected by (payload, unit):
•	float:phase01 → phase dial + wrap marker, plus time strip view
•	float:norm01 → clamped bar/slider with 0/1 markers
•	float:radians/degrees → angle dial (explicit unit label)
•	float:scalar → numeric readout + sparkline
•	int:ms → time readout + sparkline (in seconds on axis labels)
•	int:count → integer readout + step chart
•	vec2:ndc2/world2 → XY point + short trail
•	vec3:world3/ndc3 → xyz readout + 2D projections (XY, XZ, YZ) or a simple 3D dot view
•	color:rgba01 → swatch + per-channel sparklines
•	bool:none → LED + change log
•	shape:none → local-space shape preview (topology + params), with control points overlay for paths

2.2 Time history (always available)

Every signal inspector has an explicit “History” view:
•	ring buffer of last N frames
•	can show as sparkline (numeric) or “timeline” (bool/events)
•	explicit sampling rate / frame count display

2.3 Contracts & guards

For numeric units, show:
•	expected range semantics (phase wraps, norm clamps)
•	out-of-range counters (per second)
•	NaN/Inf counters
•	last frame where it occurred

⸻

3) Field debug view spec (many(instance) + continuous)

Fields are two problems: lane context and value rendering.

3.1 Required header section: Instance context

Every field inspector must show:
•	instanceId, domainType
•	lane count N
•	identity mode (stable vs none)
•	if stable: elementId presence + sample elementId
•	available intrinsics (index, normalizedIndex, randomId, position, radius) for this instance
•	continuity mapping status (if active)

3.2 Primary view selection

Primary view is chosen by payload/unit plus whether a usable spatial intrinsic exists.

A) Spatial view (if position intrinsic exists OR the field itself is vec2/vec3 interpreted as position)
•	Scatter/Glyph View: one glyph per lane (dot by default)
•	hit-test + select lane
•	highlight selected lane strongly
•	optional overlays: color-by, size-by, label-by (only from aligned fields/intrinsics)

This is the default for:
•	Field<vec2:ndc2>(I) and Field<vec3>(I)
•	any other field where you choose “visualize over position” and position intrinsic exists

B) Distribution view (default for non-spatial fields)
•	histogram / density curve for floats/ints
•	per-component histograms for vec2/vec3
•	channel distributions for color
•	frequency table for bool

C) Sample grid view (debug-friendly)
•	shows first M lanes as small cells
•	cell rendering uses the same signal value renderers
•	deterministic decimation when N is large

3.3 Secondary views (always available, explicit)
•	Selected lane inspector: renders lane k as if it were a signal (same renderers)
•	Selected lane history: time trace for that lane
•	Aggregates: min/max/avg/std + quantiles, explicitly computed and shown
•	Raw buffer view: typed array format, stride, min/max scan, sample values

3.4 Field selection mechanics

The UI stores selection as:
•	{ instanceId, elementId } if identity is stable
•	else { instanceId, laneIndex }

Selection can be set by:
•	clicking a glyph in spatial view
•	clicking a row in a lane list
•	typing an index / searching elementId

⸻

4) Event debug view spec (temporality: discrete)

Events are not signals; they are sparse occurrences.

4.1 Event primary views
•	Timeline: per-frame tick marks (like a drum sequencer row)
•	Rate meter: events/sec + last fired time
•	Per-lane event raster (for many(instance) + discrete): lanes on Y, time on X, marks where fired (with decimation)

4.2 Event payload (if any)

If events carry payload (future), show:
•	last payload value(s)
•	payload type renderer (same (payload, unit) logic) for “last event payload”

⸻

5) Stateful primitive debug view spec (persistent state)

Every stateful primitive (UnitDelay/Lag/Phasor/SampleAndHold) has:
•	a StateId
•	optionally per-lane state storage

5.1 State inspector must show
•	StateId + owning block id
•	state shape: scalar vs per-lane
•	last migration result on last hot-swap:
•	copied / transformed / reset
•	diagnostic if reset
•	current state values:
•	signal-style renderer if scalar
•	field-style renderer if per-lane

5.2 “Base vs effective” (continuity-aware)

If continuity is applied to a target, the debug panel for that target must allow toggling:
•	base buffer
•	effective buffer
•	delta buffer (effective - base) in the gauge’s semantic space

⸻

6) Continuity debug view spec (mapping + policy)

Continuity has first-class concepts that must be inspectable.

6.1 Continuity target inspector

For each continuity-applied target:
•	targetKey + semantic (position, color, etc.)
•	policy (slew/crossfade/project…) with parameters
•	gauge type
•	mapping source (byId / byPosition)
•	mapping quality metrics (counts of matched/unmatched)

6.2 Mapping visualization

If field is spatial:
•	show old positions ghosted vs new positions
•	draw correspondence lines for a sampled subset
If non-spatial:
•	show match statistics + a sampled table of (oldId -> newId)

⸻

7) Render pass / sink inspector (optional but strongly recommended)

Even if it’s not a “value” in the type system, it’s how users validate the patch.

7.1 Pass inspector shows
•	sinkId / pass kind
•	instanceId (if applicable)
•	bound slots for position/color/size/shape/controlPoints
•	draw stats (count, batches, ms)

This is the “bridge” between values and what appears on canvas/SVG.

⸻

8) Global debug utilities (always present)

8.1 Type trace

For any selected value:
•	show the chain of producers:
•	port → edge → adapter → block output → expr → intrinsic → slot
•	show where unit conversions occurred (adapters) with stable IDs

8.2 Performance counters
•	materialization time per field
•	renderer time per pass
•	continuity time per target
•	worst offenders list

8.3 Determinism aids
•	seed info
•	frame index
•	snapshot ID
•	“replay checksum” if you add one

⸻

9) Default rules (so engineers don’t improvise)
   •	Every debug target has exactly one primary view chosen by deterministic rules.
   •	Every view mode is explicit and user-selectable; no silent mode switching except the explicit LOD rule with an indicator.
   •	Blocks may only provide default view hints, never bespoke untyped drawing logic (except the shape payload renderer, which is type-driven anyway).
