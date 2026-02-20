It would be cool if we could integrate these ideas WITH the adapters/lenses concepts in some way.  that would be
insanely useful.  lenses are just adapters that are added manually and are used to intentionally transform the data
(ie 'scale') instead of being mechanical changes to fix mismatched types (ie 'Phase->Degrees').  Lenses are not fully
implemented yet but they will be essentially identical to adapters with a different chip on the edge.

it should be obvious how useful it would be to be able to see a comparison of the data before and after an
adapter/lens.  If we could snap our fingers and have your visualizations optimized perfectly to be adapter/lens
aware, how would that change things?

⏺ This is a fantastic question because the answer is "it changes almost everything."

The fundamental shift: when you hover an edge that passes through an adapter/lens, you're not asking "what is this value?"
— you're asking "what did this transformation do?" That's a completely different question, and it unlocks a visualization
that none of the previous ones cover.

The Transfer Curve — The Missing Visualization

When a value passes through an adapter or lens, there's an input and an output. For a pure function (most
adapters/lenses), you can plot input on X, output on Y. This is called a transfer curve, and it's the single most
informative visualization for understanding a transformation.

For a field with 400 instances, you get 400 dots. For a pure function, those dots all lie on a single curve — you're
literally seeing the function:

- Clamp.out: Piecewise linear. Flat at the bottom, 45-degree ramp, flat at the top. The flat regions show you exactly
  where clamping kicks in. If 200 of your 400 dots are piled on the upper flat region, you instantly know half your field is
  being clipped.
- Smoothstep.out: S-curve between the bounds. You see the exact shape of the easing — how aggressive the transitions are,
  where the inflection point sits.
- PowerGamma.out: The gamma curve. Concave or convex depending on the exponent. You see how much the midtones are being
  pushed.
- Adapter_Wrap01.out: Sawtooth — the input keeps climbing but the output wraps. Each sawtooth tooth is one wrap cycle.
- Adapter_UnipolarToBipolar.out: Straight line, y = 2x - 1. Boring, but confirming — you can see it's a pure linear remap.
- NormalizeRange.out: Straight line from (inputMin, 0) to (inputMax, 1). The slope tells you the scaling factor.
- Deadzone.out: Zero in the center, linear ramps outside. You see the dead band width directly.
- Mask.out: Two clusters — dots at y=0 (masked) and dots on y=x (passed through). The ratio tells you what fraction is
  being masked.
- Adapter_UnitCast.out: y=x exactly. Identity line. Confirms the adapter is mechanical, not transforming values.

The killer insight for stateful lenses: Slew.out and Lag.out are NOT pure functions — the output depends on history. The
transfer curve shows a cloud instead of a clean line. A tight cloud hugging y=x means the filter is keeping up with the
input. A wide cloud means significant lag. A cloud that's wider on one side reveals asymmetric slew rates. You can
literally see the filter's transient behavior as scatter width.

How This Changes Each Visualization

Adapter/Lens-Aware Sparkline

When hovering an adapter/lens edge, show two overlaid traces — dim trace for the input port's source value, bright trace
for the output. For Slew.out receiving a square wave: you see the sharp square wave (dim) and the smoothed output (bright)
overlaid. The gap between them IS the slew behavior. No separate "before" panel needed — the overlay is the comparison.

Adapter/Lens-Aware Histogram

Two overlaid distributions — dim outline for input, solid fill for output. For Clamp.out: the input distribution extends
beyond the clamp bounds (dim outline with tails), the output distribution is truncated with spikes at the boundaries
(solid fill). For NormalizeRange.out: the input distribution is some arbitrary range (dim), the output is stretched to
[0,1] (solid). The shape change between the two tells you everything.

Adapter/Lens-Aware DPO

Two intensity layers — dim phosphor for input waveform, bright phosphor for output waveform. For Smoothstep.out of a
phasor field: you see the sharp sawtooth (dim band) and the smoothed S-curve (bright band) simultaneously. The shape
difference between the two bands IS the lens effect. For Clamp.out of a sine field: the sine wave (dim) with
flat-topped/bottomed version (bright). Clipping literally visible as the bright band diverging from the dim band at the
extremes.

Adapter/Lens-Aware Raster Heatmap

Side-by-side or difference mode. Side-by-side: input heatmap on left, output on right, same color scale. Difference:
single heatmap showing output - input, with zero = neutral gray, positive = teal, negative = red. For Adapter_Wrap01.out:
the difference heatmap lights up in bands wherever wrapping occurred — you see the wrap boundaries as colored stripes.

Data Availability

All of this requires one thing: access to both the input and output values of the adapter/lens at the same time. The
output is already on the edge you're hovering. The input is the value on the source side of the adapter — which is a
different slot in the runtime. The debug system would need to resolve "this edge passes through adapter block X; also read
slot Y which is X's input." That's a lookup in the expansion provenance + debug edge map, not a new runtime mechanism.

For fields, both the input and output buffers exist in the same frame — 400 input values and 400 output values, paired by
instance index. The transfer curve is just (inputBuffer[i], outputBuffer[i]) for i in 0..399.

Summary Table — What Adapter/Lens Awareness Adds
┌──────────────────┬────────────────────────────────────┬────────────────────────────────────────────────────────────────┐
│      Base        │     Without Adapter Awareness      │                     With Adapter Awareness                     │
│  Visualization   │                                    │                                                                │
├──────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Sparkline        │ "What is this value doing?"        │ "How is the transformation changing the waveform?" (dual       │
│                  │                                    │ trace)                                                         │
├──────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Histogram        │ "What's the distribution?"         │ "How did the distribution reshape?" (overlay)                  │
├──────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ DPO              │ "What does the periodic waveform   │ "How did the lens distort the waveform?" (dual phosphor)       │
│                  │ look like?"                        │                                                                │
├──────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Raster heatmap   │ "What's the spatiotemporal         │ "Where in space/time does the transformation have the most     │
│                  │ pattern?"                          │ effect?" (difference mode)                                     │
├──────────────────┼────────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Transfer curve   │ doesn't exist                      │ "What IS this function?" — the adapter/lens's behavior plotted │
│                  │                                    │  directly                                                      │
└──────────────────┴────────────────────────────────────┴────────────────────────────────────────────────────────────────┘
The transfer curve is the unique one — it only exists in the adapter/lens context. Everything else is "the existing viz
but with a before/after overlay," which is valuable but incremental. The transfer curve is genuinely new information that
no other visualization provides.

✻ Churned for 1m 6s

❯ Wow!  Incredibly useful.  Previously you expanded on 'I love all the ideas!  I've written them down.  I'm wondering
if you can provide a bit more context about each so it
doesn't get lost.  Anything that would be useful to an agent implementing it, but nothing that you need to search
for
or read any files.
'.  Can you do that same thing but within the context of 'Adapter/Lens awareness'?  Also include "Most effective for
X" and "Least effective for Y", focusing on criteria that will let me automatically determine the visualization to
use in particular scenarios (do it by 'type', not by 'block', so it's generalizable to new blocks as well)


⏺ Adapter/Lens-Aware Visualizations — Implementation Context

  ---
Transfer Curve (XY Scatter)

What it is: Plot input value (X axis) vs output value (Y axis) for every instance in the current frame. For a field with N
instances, you get N dots. Pure functions produce a clean curve. Stateful transforms produce a cloud whose width reveals
lag/hysteresis.

Data source: Two Float32Arrays from the same frame — the adapter/lens block's input slot and output slot, both at field
cardinality. For signals (cardinality one), you get a single dot per frame; accumulate dots over time (ring buffer of (in,
out) pairs, ~128 frames) to trace the curve via temporal sampling instead of spatial sampling.

Rendering: Canvas, 80x80px. Auto-scale both axes independently from min/max of each buffer. Draw dots at 1px radius, teal
(#4ecdc4) at ~30% opacity so overlap creates natural density. For signal-mode (accumulated pairs), use the same dot
approach — older pairs dimmer (multiply opacity by age decay). Draw y=x reference line as a dim diagonal — deviations from
this line ARE the transformation. Axis labels: input range on bottom edge, output range on right edge.

Stateful detection: If the same input value maps to different output values across instances (or across time for signals),
the transform is stateful. Quantify as: partition input range into 8 bins, measure variance of output within each bin.
High variance = stateful (cloud), low variance = pure function (curve). This could drive a subtle label: "pure" vs
"stateful" — but even without the label, the visual difference is self-evident.

Most effective for:
- Stride-1 payloads (float, int) — one clean 2D plot
- Adapters/lenses where input and output share the same payload kind (float→float)
- Any cardinality (signals accumulate temporally, fields sample spatially)
- Unit-changing adapters — the transfer curve shows whether it's pure scaling (linear) or nonlinear
- Stateful lenses — cloud width is diagnostic information you can't get any other way

Least effective for:
- Payload-changing adapters (Adapter_HslToRgba: color→color but internal structure changes across 4 components — which
  component pair do you plot? You'd need 4 curves or a component selector)
- Stride > 1 payloads (vec3, vec4) where the transform operates on components independently — you'd need 3-4 overlaid
  curves, getting cluttered. Could work if color-coded per component (x=red, y=green, z=blue)
- bool payload — transfer curve of a boolean is meaningless (two dots)
- Identity adapters (Adapter_UnitCast) — the curve is y=x, technically correct but carries zero information. Detect
  identity transforms (input type equals output type except unit) and show a compact "identity (unit relabel)" badge instead

Auto-selection criteria: Show transfer curve when: (1) the edge passes through an adapter or lens, AND (2) input payload
stride equals output payload stride, AND (3) stride <= 2 (for stride 3-4, prefer per-component stats). For stride 2, plot
both components as differently-colored dots on the same axes.

  ---
Dual-Trace Sparkline

What it is: Two overlaid sparklines — dim trace for the value entering the adapter/lens, bright trace for the value
leaving it. Shows temporal waveform transformation for one instance.

Data source: Two ring buffers, each sampling instance 0's value per frame. One buffer for the adapter/lens input slot, one
for the output slot. Same ring buffer infrastructure as the existing signal sparkline — just two of them pointing at
different slots. Stride must match (or use component 0 of each if stride differs).

Rendering: Same Sparkline component rendered twice into the same canvas. First pass: input trace in dim color (rgba(78,
205, 196, 0.3), lineWidth 1). Second pass: output trace in full color (#4ecdc4, lineWidth 1.5). Shared Y axis auto-ranged
to encompass both traces' ranges. Key: the Y range must cover both traces or the comparison is misleading — don't
auto-range them independently.

Gap visualization: The vertical distance between traces at any time point is the instantaneous transformation delta. For a
Slew lens tracking a step change: the gap starts large (output lagging behind input) and closes over time (output catches
up). The gap closing rate IS the slew rate, directly visible.

Most effective for:
- Stride-1 payloads (float, int) at any cardinality
- Periodic signals/fields — waveform shape distortion is immediately visible
- Stateful lenses (Slew, Lag) — the temporal lag between traces IS the filter behavior
- Unit-preserving transforms where input and output are on the same numerical scale
- Time-varying inputs where you want to see HOW the transformation responds to dynamics

Least effective for:
- Unit-changing adapters where the numerical scales differ wildly (e.g., Adapter_MsToSeconds: input ~16.6, output ~0.0166
  — the dim trace is 1000x the bright trace, shared Y axis makes one trace a flat line at zero). Detect scale mismatch
  (ratio of input range to output range > 10 or < 0.1) and either normalize both to [0,1] or show separate Y axes with a
  label
- Stride mismatch (input stride != output stride) — can't meaningfully overlay. Fall back to showing them separately
- Static fields where neither trace changes over time — two flat lines, sparkline adds nothing
- color payload — sparkline of RGBA channels is noisy and hard to interpret, palette strip comparison is better
- bool payload — two overlapping square waves, hard to distinguish. Prefer the percentage bar comparison

Auto-selection criteria: Show dual-trace when: (1) adapter/lens edge, AND (2) both input and output are sampleable (stride
> 0), AND (3) the edge is NOT a static field (check: if band chart min≈max over last 30 frames, it's static). For
scale-mismatched pairs, add a "normalized" badge and map both traces to [0,1] of their respective ranges.

  ---
Distribution Overlay (Dual Histogram)

What it is: Two overlaid distributions for the current frame — dim outline for the input buffer, solid fill for the output
buffer. Shows how the transformation reshapes the value distribution across instances.

Data source: Two Float32Arrays from the current frame — input and output buffers of the adapter/lens. Both at field
cardinality. For signals, this visualization doesn't apply (N=1, no distribution).

Rendering: Canvas or SVG, 280×40px. Compute histograms for both buffers using shared bin edges (important — bins must
align for visual comparison). 16-24 bins spanning the union of both ranges. Input distribution: outlined bars, stroke
rgba(78, 205, 196, 0.4), no fill. Output distribution: filled bars, fill rgba(78, 205, 196, 0.25), stroke rgba(78, 205,
196, 0.7). Overlay them — where they differ is where the transformation has effect. For the KDE enhancement: same approach
but with smooth curves instead of bars.

Diagnostic patterns:
- Bars shift left/right: bias (the transform adds/subtracts a constant)
- Bars compress toward center: normalization/clamping
- Outline has tails, fill doesn't: clipping (values beyond bounds get truncated)
- Fill has spikes at edges that outline doesn't: clamping accumulation (clipped values pile up at boundaries)
- Distributions identical: identity transform (flag it)

Most effective for:
- Field cardinality (many) — needs multiple instances to form a distribution
- Stride-1 payloads (float, int) — clean single histogram
- Range-modifying transforms (Clamp, NormalizeRange, DenormalizeRange, Deadzone) — distribution shape change IS the
  behavior
- Adapter_Wrap01 — input distribution may be wide, output is always [0,1), the reshaping is visually dramatic

Least effective for:
- Signal cardinality (one) — no distribution to show, single value
- bool payload — two-bin histogram, the percentage bar comparison is cleaner
- color payload — per-channel histograms would require 4 overlaid pairs, too noisy. Prefer palette strip before/after
- Stride > 1 payloads — need to pick a component or show multiple histograms
- Identity adapters (unit-only changes) — distributions are identical, visualization shows nothing. Detect and skip.
- Very low instance count (< ~16) — histogram is sparse and unreliable, prefer transfer curve

Auto-selection criteria: Show distribution overlay when: (1) adapter/lens edge, AND (2) field cardinality (many), AND (3)
stride == 1, AND (4) instance count >= 16. For stride > 1, could show component 0 only with a "[component 0]" label.

  ---
Dual-Layer DPO

What it is: Digital phosphor oscilloscope with two intensity layers — dim phosphor for the input waveform, bright phosphor
for the output waveform. Both triggered on the same reference instance, both showing all instances.

Data source: Same as the standard DPO, but two 2D intensity grids. Both grids triggered simultaneously from the same
reference instance's zero crossing. During each sweep, for each instance i: plot (sweepTime, inputBuffer[i*stride]) into
grid A, and (sweepTime, outputBuffer[i*stride]) into grid B. Both grids decay at the same rate.

Rendering: Canvas, 280×80px. Render grid A (input) with a dim cool colormap (dark blue → muted blue → dim cyan). Render
grid B (output) with the bright warm colormap (dark → teal → bright white). Composite both layers. Where they overlap: the
colors blend, showing agreement. Where they diverge: distinct color bands, showing the transformation's effect. The
visual separation between the two phosphor bands at any time point IS the transformation magnitude at that phase.

Most effective for:
- Periodic field data (float:turns from Phasor, float:none from Oscillator) through a waveform-shaping lens
- Lenses that distort waveform shape: Smoothstep (rounds the corners), PowerGamma (shifts the midpoint), Clamp (flattens
  peaks)
- High instance count — more instances = denser phosphor = clearer curve
- Same-stride input/output on the same numerical scale

Least effective for:
- Non-periodic data — trigger detection fails, both layers are garbage. This is the same limitation as standard DPO,
  doubled
- Scale-mismatched transforms — the two layers occupy different Y ranges, hard to compare. Would need normalized Y axis
  (both mapped to [0,1] of their ranges) with clear labeling
- Static fields — no temporal variation, phosphor shows a single horizontal band
- bool, color, stride > 1 — same limitations as standard DPO
- Low instance count — phosphor is sparse, transfer curve is more informative

Auto-selection criteria: Show dual-layer DPO when: (1) adapter/lens edge, AND (2) the standard DPO would have been
selected for this edge (periodic, stride 1, field cardinality), AND (3) input and output numerical ranges overlap by at
least 50% (otherwise scale mismatch makes overlay unreadable).

  ---
Difference Raster Heatmap

What it is: Single heatmap showing output[i] - input[i] per instance per frame. Zero delta = neutral (dark), positive
delta = teal, negative delta = warm red. Reveals WHERE in space (instance index) and WHEN in time the transformation has
the most effect.

Data source: Both input and output field buffers each frame, differenced. Store the delta buffer in the same
ring-buffer-of-snapshots structure as the standard raster heatmap. Each snapshot is outputBuffer[i*stride + component] -
inputBuffer[i*stride + component] for all instances.

Rendering: Canvas, 280×80px. Diverging colormap centered at zero: negative = #ff4444 through dark through #000000 (zero)
through dark through #4ecdc4 = positive. Auto-range the color scale symmetrically around zero (use max absolute delta).
Pixels at zero stay dark — the bright regions ARE where the transformation is active.

Diagnostic patterns:
- Horizontal bright bands (specific instances always affected): those instances are at the transform boundary (e.g.,
  clamped)
- Vertical bright bands (all instances affected at specific times): input crossed a threshold simultaneously
- Diagonal bands: wave propagation through the transformation
- Uniform color: transform applies equally to all instances (e.g., linear scale)
- All dark: identity transform or zero-effect region

Most effective for:
- Field cardinality with moderate-to-high instance count (>= ~20)
- Stride-1 payloads
- Spatially non-uniform transforms — where WHICH instances are affected matters
- Time-varying effects (the input changes, so which instances hit the clamp boundary changes)
- Clamp, Deadzone — the boundary between "pass-through" (dark) and "active" (bright) is the most informative thing about
  these lenses

Least effective for:
- Linear transforms (scale, unit cast) — uniform delta across all instances, featureless solid color
- Signal cardinality — one row, degenerates to a sparkline of the delta
- color payload — delta of RGBA channels is hard to interpret as a single heatmap
- Static fields — no temporal variation, single column repeated
- Very low instance count (< 8) — too few rows for spatial patterns

Auto-selection criteria: Show difference heatmap when: (1) adapter/lens edge, AND (2) field cardinality, AND (3) stride ==
1, AND (4) instance count >= 20, AND (5) the transform is NOT linear (detect: if delta/input ratio is constant across
instances within epsilon, it's linear — show a "linear scale ×{ratio}" badge instead).

  ---
Auto-Selection Decision Tree

The selection criteria above compose into a decision tree based purely on type properties:

Is this edge adapter/lens-aware?
├─ NO → use standard visualization selection (existing logic)
└─ YES
├─ payload stride == 0 (bool) → percentage bar before/after
├─ payload is color (stride 4, color semantics) → palette strip before/after
├─ cardinality == signal (one)
│   ├─ periodic (trigger detected) → dual-layer DPO (accumulated temporally)
│   └─ non-periodic → dual-trace sparkline + transfer curve (accumulated temporally)
└─ cardinality == field (many)
├─ stride == 1
│   ├─ periodic → dual-layer DPO + transfer curve
│   ├─ static (no temporal variation) → transfer curve + distribution overlay
│   └─ dynamic non-periodic → transfer curve + distribution overlay + difference heatmap
└─ stride > 1 (vec2/vec3/vec4)
├─ per-component transfer curves (one per component, color-coded)
└─ distribution overlay on component 0

Detection heuristics (all derivable from type + runtime data, no block knowledge needed):
- Periodic: trigger crossing detected in last 2 seconds on instance 0
- Static: field stats min≈max (within epsilon) over last 30 frames
- Linear transform: (output - input) / input is constant (within 1%) across all instances
- Identity transform: input and output types differ only in unit kind
- Scale mismatch: ratio of input range to output range > 10 or < 0.1
