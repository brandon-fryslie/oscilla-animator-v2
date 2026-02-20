Tier 1: Actually Useful

Single-instance sparkline — 9/10
Pick instance 0 (or a user-selected instance) and show its actual waveform over time. This is what every oscilloscope on
earth does. For a phasor field, you'd see a clean sawtooth. For a sine field, a clean sine. For position, the actual
trajectory of one point. Immediately interpretable by any human.

- Data needed: Store one float per frame (instance 0's value) in a ring buffer, same as signal sparklines already work
- Render: Exact same Sparkline component we already have
- Complexity: Low — piggyback on existing signal history infrastructure, just sample buffer[0 * stride] each frame
- Limitation: Only shows one instance. But one real value beats 400 summarized into nothing.

What it shows: The actual waveform of instance 0 over time. For a phasor field, a clean sawtooth. For a sine field, a
clean sine. One real value per frame, plotted left-to-right like a traditional oscilloscope trace.

Why it matters: The current field visualization shows min/max/mean statistics across all instances. When 400 instances are
phase-offset oscillators, those statistics are near-constant — the mean is ~0.5, min is ~0, max is ~1, every frame. The
sparkline shows what one instance is actually doing, which is what the user wants to see 90% of the time.

Architecture context: Signal-cardinality values already have per-value sparklines via HistoryService — it manages ring
buffers of Float32Array keyed by DebugTargetKey, sampled each frame. Fields don't get sparklines because they're
multi-lane (400 values per frame, not 1). The trick is: sample buffer[0] (instance 0, component 0) from the field's
EdgeValueResult.buffer each frame and feed it into the same sparkline infrastructure. The Sparkline component in
src/ui/debug-viz/charts/Sparkline.tsx already handles rendering — it just needs a HistoryView (ring buffer + writeIndex +
capacity + stride + filled).

Implementation approach: Add a fieldInstanceHistory ring buffer to HistoryService for tracked field edges. Each frame when
DebugService computes field stats, also sample buffer[0 * stride .. 0 * stride + stride] into this ring buffer. Pass the
resulting HistoryView down to FieldValueSection in DebugMiniView.tsx and render it with the existing Sparkline component.
Place it above the band chart — it's the primary temporal visualization, the band chart is secondary context.

Edge cases: If instance 0 is eliminated or the field has 0 instances in a frame, write NaN (sparkline already handles
gaps). Stride > 1 (vec3 fields): sample component 0 of instance 0, same as band chart only shows component 0.

EXTRA

Single-instance sparkline — frequency annotation:
Auto-detect the dominant frequency from the sparkline buffer (zero-crossing count or simple autocorrelation — don't need
FFT for a single dominant frequency). Display as a subtle label: ~3.2 Hz or ~192 BPM. For a phasor, this directly tells
you the oscillation rate. For a position field, it tells you if something is vibrating. The autocorrelation peak also
gives you a confidence measure — if the peak is sharp, annotate with the frequency. If it's broad/absent, don't show
anything (the signal isn't periodic).

WHEN TO USE

Great for: Anything periodic or time-varying where the waveform shape matters. Phasor output (sawtooth), Oscillator output
(sine), Accumulator output (ramp), Lag/Slew output (smoothed transitions), Noise output (random walk character),
SampleHold output (staircase). Also ExternalInput/ExternalVec2 — "is the mouse doing what I think?"

Dud when: The field's value is spatially interesting but temporally static. GridLayoutUV position output is a great
example — 400 positions that are constant over time. The sparkline would show a flat line for whichever instance you
picked. You'd learn "instance 0 is at x=0.05" which tells you nothing about the layout pattern. Same for Broadcast of a
Const — every instance has the same constant value, sparkline shows a flat line forever. Also a dud for FieldConstColor —
constant field, no temporal variation.

Also a dud for: DomainIndex / StableIdHash — these are integer/hash fields where the per-instance identity is the point,
not the waveform. A sparkline of "instance 0's domain index = 0" is tautological.


===


Raster heatmap — 8/10
Each column is a frame (time →), each row is an instance (0..399 ↓), pixel brightness = value. For a phasor field with
staggered phases, you'd see diagonal stripes (a traveling wave). For random data, static noise. For synchronized data,
vertical bands. Reveals spatiotemporal structure that no single statistic can capture.

- Data needed: Store full buffer snapshots per frame. At 400 instances × stride 1 × 64 frames = 25.6KB. Totally fine.
- Render: Canvas, one fillRect per cell (or ImageData for speed)
- Complexity: Medium — need a FieldBufferHistory ring buffer (separate from stat snapshots)
- This is the "holy shit" visualization. Phase relationships, wave propagation, coupling — all visible at a glance.

Raster heatmap — 8/10

What it shows: A 2D image where X = time (frame), Y = instance index (0..N-1), and pixel brightness/color = value. For
phase-staggered phasors, you see diagonal stripes (a traveling wave). For synchronized data, vertical bands. For random
noise, static. Reveals spatiotemporal structure that no single statistic can capture.

Why it matters: This is the only visualization that shows relationships between instances over time. A sparkline shows one
instance's waveform. A histogram shows one frame's distribution. The heatmap shows how the entire field evolves — phase
propagation, synchronization, clustering, wave speed. It's the "X-ray" view.

Architecture context: Currently FieldStatsAccumulator stores per-frame stat snapshots (min/max/mean/p25/p75/count) in a
ring buffer, but discards the raw per-instance buffer. The heatmap needs the raw buffer preserved. A new
FieldBufferHistory structure would store downsampled buffer snapshots — at 400 instances × 1 float × 64 frames = 25.6KB,
memory is not an issue. For higher strides (vec3 = stride 3), store only component 0 to keep it manageable.

Implementation approach: New accumulator: FieldBufferHistory with a ring buffer of Float32Array snapshots (one per frame,
length = instanceCount). Each frame, copy component 0 from every lane: for (i = 0; i < count; i++) snapshot[i] = buffer[i
* stride]. Render as a canvas: for each (frame, instance) cell, map value to a luminance or color ramp. The teal theme
  suggests mapping 0→black, 1→#4ecdc4. Canvas dimensions: width = frameCount (64 pixels scaled to ~280px CSS), height =
  min(instanceCount, 128) pixels (downsample if > 128 instances by taking every Nth).

Rendering detail: Use ImageData for performance — create a Uint8ClampedArray, write RGBA per pixel, putImageData once.
Much faster than individual fillRect calls for 64×400 = 25,600 cells. The canvas element should be the same size pattern
as FieldBandChart (width prop, height prop, 2x DPR retina). Color mapping: normalize value to [0,1] within the visible Y
range, then teal ramp: r = v * 78, g = v * 205, b = v * 196, a = 255.

Instance ordering: By default, use instance index order (0..N-1). This preserves spatial structure from layout blocks
(CircleLayout instances are ordered around the circle). Sorting by current value would destroy spatial information.

Edge cases: Instance count changes between frames (shouldn't happen in steady state, but could during recompile). Handle
by clamping to min(snapshotLength, currentCount). Stride 0 payloads (bool): skip heatmap, it's not meaningful for discrete
values.

EXTRA

Raster heatmap — instance reordering:
After rendering the basic heatmap (rows = instances, columns = time), apply a one-time sort: reorder instance rows by
similarity (e.g., sort by phase at frame 0, or by mean value). Adjacent rows become similar colors, and spatial structure
becomes visible as contiguous colored bands. A traveling wave through the field appears as a smooth diagonal gradient
instead of random noise. The sort should be computed once when the heatmap first fills, then held stable (re-sorting every
frame would be nauseating). A subtle divider line or fade at the boundary between "similar groups" makes clusters pop.

WHEN TO USE

Great for: Revealing spatiotemporal structure — patterns across instances AND across time simultaneously. GridLayoutUV
position fed through Oscillator or Phasor: traveling wave patterns appear as diagonal stripes. Noise with different seeds
per instance: reveals correlation (are instances independent or coupled?). Lag/Slew applied to a field: you can literally
see the smoothing propagate. HueRainbow → HueShift with animated shift: the color wheel rotation is visible as a scrolling
gradient.

Dud when: Instance count is very small (< ~8). With 3 instances, you get 3 rows — it's just 3 sparklines stacked, and a
sparkline overlay would be clearer. Also poor when instance ordering is meaningless — the heatmap rows are ordered by
instance index, and if instance index has no spatial meaning (e.g., randomly assigned IDs), the vertical axis is noise.
The instance-reordering enhancement fixes this, but without it, a field of 400 random-phase oscillators looks like TV
static.

Also a dud for: color payload — you'd need an RGB heatmap (3 channels) or HSL conversion. A single-channel intensity
heatmap loses the color information that the palette strip shows perfectly.


===



Current-frame histogram — 7/10
Right now, what's the distribution of values across instances? Render as a small vertical histogram (8-16 bins). For
uniformly-phased oscillators: flat. For clustered phases: peaked. For boolean-like fields: two spikes. Updates at the standard debug frequence (5hz I believe, do not change the data rate for this or any graph, this is a performance concern).

- Data needed: Just the current frame's buffer (already available as EdgeValueResult.buffer)
- Render: Canvas, simple bar chart, ~20 lines of drawing code
- Complexity: Low — no new history infrastructure needed
- Shows the shape of the field at this instant. Combined with the band chart's temporal axis, you get both spatial and
  temporal views.

Current-frame histogram — 7/10

What it shows: A small bar chart showing the distribution of values across all instances right now. 16 bins spanning
min→max of the current frame's buffer. For uniformly-phased oscillators: flat bars (uniform distribution). For clustered
phases: peaked bars. For boolean-ish fields: two spikes at 0 and 1.

Why it matters: Answers "what does this field look like right now?" without any temporal averaging. The band chart's
mean/IQR tells you "the average is 0.5" — the histogram tells you "values are uniformly distributed between 0 and 1" or
"80% of values are clustered near 0.3". Different shapes instantly tell you different things: flat = uniform phase spread,
peaked = synchronized, bimodal = two clusters.

Architecture context: The raw buffer is already available in FieldValueSection via EdgeValueResult.buffer when value.kind
=== 'field'. No new history infrastructure needed — this is a pure render-time computation from the current frame's data.

Implementation approach: New component FieldHistogram in src/ui/debug-viz/charts/. Props: buffer: Float32Array, stride:
number, count: number, width: number, height: number. Canvas-based, same retina pattern as Sparkline/FieldBandChart.
Compute: scan buffer to find min/max (or reuse stats.min[0]/stats.max[0] passed as props), divide range into 16 bins,
count values per bin, draw vertical bars. Place it in FieldValueSection between the renderer stats and the band chart.

Rendering detail: Bar width = chartWidth / 16, bar height = (binCount / maxBinCount) * chartHeight. Fill with the teal
theme (rgba(78, 205, 196, 0.6) for bars, darker background). Add min/max scale labels at left and right edges (same
scaleLabel helper from FieldBandChart). For stride > 1, histogram component 0 only (consistent with band chart).

Edge cases: All values identical (min === max): show single full-height bar in the center. Very few instances (< 16): use
fewer bins (one per instance). count === 0: show "no data" placeholder.

EXTRA

Histogram — KDE overlay:
Instead of (or on top of) blocky bins, render a smooth kernel density estimate curve. A Gaussian KDE with bandwidth =
range / 20 turns 400 discrete samples into a smooth probability density. Render it as a filled curve with the same teal
gradient. This looks dramatically more polished than bar charts AND is more informative (you can see subtle bimodality
that bins might straddle). The KDE computation for 400 samples with ~50 evaluation points is trivial (<1ms).

EXTRA

Histogram — reference distribution ghost:
Overlay a dim "expected" distribution behind the actual distribution. For a phasor (0→1 sawtooth), the expected
distribution is uniform. For a sine wave, the expected distribution is the arcsine distribution (high density near peaks,
low near zero crossings). Render this as a dim dashed outline. Deviations from expected immediately pop — "why are there
more instances near 0.7 than expected?" This turns a simple histogram into a diagnostic tool.

WHEN TO USE

2. Current-Frame Histogram

Great for: Understanding the distribution shape across instances right now. Phasor → Broadcast → Add (phase-staggered
oscillators): are the phases uniformly spread or clustered? Noise field: is the noise Gaussian-ish or uniform? HueRainbow
output: are the hues evenly spread across the spectrum? NormalizeRange / DenormalizeRange output: did the normalization
actually map to [0,1]? Clamp output: how many instances are hitting the clamp boundaries (spikes at edges = many clamped)?

Dud when: The field has very few distinct values. CameraProjectionConst output: it's either 0 or 1, the histogram is two
spikes — the percentage bar we already built is strictly better. EventToSignalMask (bool field): same, two bins.
DomainIndex with 400 instances: you get 400 bins each with count 1 — it's just a uniform bar, tells you nothing. Also poor
for color payload: a 1D histogram can't show color distribution (you need the palette strip we already have).

Also awkward for: Very high-stride payloads (vec3, vec4) — a histogram of which component? You'd need to pick one, or show
3-4 overlaid histograms, which gets noisy.


  ---
Tier 2: Useful in Specific Cases

Animated percentile fan — 6/10
Like the current band chart, but instead of min/max (which are dominated by outliers), show p10/p25/median/p75/p90 as
nested bands. More informative than min/max for understanding how tight the distribution is. Still just statistics though
— doesn't show structure.

- This is "the current chart but less bad." Percentile bands tell you about convergence/divergence but still can't show
  phase relationships.
- The smoothing we just added helps, but the fundamental problem remains for phased data.

Animated percentile fan — 6/10

What it shows: Same temporal axis as the current band chart, but instead of just min/max + IQR, show 5 nested bands:
p5↔p95 (outer), p10↔p90, p25↔p75 (inner), with median as the center line instead of mean. Creates a "fan" shape that shows
how tight or spread the distribution is and whether it's symmetric.

Why it matters: The current band chart uses min/max for the outer band, which is dominated by single outliers — one
instance at 0.001 while 399 are at 0.5 stretches the band to the floor. Percentile bands are robust to outliers and show
the bulk of the distribution. The fan width tells you at a glance: narrow = instances are converging, wide = high
variance, asymmetric = skewed distribution. Still not useful for phased data (the fan is constant-width), but
significantly more informative than min/max for non-periodic fields like position spread, accumulated values, or fields
with outliers.

Architecture context: FieldStatsAccumulator already computes and stores p25/p75 per frame snapshot. It does NOT currently
compute p5/p10/p90/p95. Adding these would require expanding FieldFrameSnapshot with additional percentile arrays. The
percentile computation in the accumulator uses sorted sampling — extending it to more percentiles is straightforward (same
sorted array, different index lookups). Median is not currently stored either (it's p50).

Implementation approach: Extend FieldFrameSnapshot with p5, p10, p50 (median), p90, p95 arrays (all Float32Array[4], same
as existing p25/p75). In the accumulator's addFrame, compute these from the sorted sample alongside existing percentiles.
In FieldBandChart, draw 3 nested filled bands (p5↔p95 lightest, p10↔p90 medium, p25↔p75 darkest) plus the median line.
Replace the mean line with median — median is more robust and more intuitive for the "center" of a distribution.

Visual design: Three band opacities: outer (p5↔p95) = rgba(78, 205, 196, 0.06), middle (p10↔p90) = rgba(78, 205, 196,
0.12), inner (p25↔p75) = rgba(78, 205, 196, 0.22) (current IQR opacity). Median line stays #4ecdc4. The gradient of
opacity from outer to inner creates the "fan" effect — dense in the middle, fading at the edges.

WHEN TO USE

Great for: Same situations as the band chart, but gives more information about distribution shape. If p25-p75 is narrow
but p10-p90 is wide, you know there are outliers. Clamp output over time: watching the percentile bands compress as values
get squeezed to the clamp range. Position convergence scenarios where you want finer-grained envelope information than
just min/max.

Dud when: Same duds as the band chart — fundamentally useless for periodic data. The extra percentile bands don't help
when all percentiles are approximately constant.


===

Multi-instance overlay (2-4 traces) — 6/10
Show 2-4 selected instances' sparklines overlaid with different colors. Shows phase relationships between specific
instances. Like a multi-channel oscilloscope.

- Data needed: 2-4 instance histories (small ring buffers)
- Useful for debugging specific inter-instance relationships
- Not great as the default — requires knowing which instances to watch

Multi-instance overlay — 6/10

What it shows: 2-4 instance sparklines overlaid on the same chart with different colors. Like a multi-channel oscilloscope
— you can see phase relationships, correlation, and timing differences between specific instances.

Why it matters: The single-instance sparkline shows one instance. The heatmap shows all instances but as a density image.
The overlay lets you compare specific instances: "is instance 0 leading instance 50 by a quarter cycle?" or "are instances
0 and 199 (opposite sides of a circle layout) perfectly anti-phased?" Useful for debugging spatial relationships in
layout-driven fields.

Architecture context: Requires per-instance history for multiple instances. The single-instance sparkline approach
(instance 0 only) could be extended to track N instances. Memory: 4 instances × 64 frames × stride 1 = 256 floats =
trivial. The question is which instances to track. Options: (a) fixed set [0, N/4, N/2, 3N/4] to sample across the field
evenly, (b) user-selectable via clicking on the heatmap, (c) instance 0 + a few automatically chosen to maximize visual
diversity.

Implementation approach: Extend the field instance history to track 4 ring buffers instead of 1. New component
MultiInstanceSparkline that renders 4 traces on the same canvas with distinct colors. Color palette: instance 0 = #4ecdc4
(teal), instance 1 = #ff6b6b (coral), instance 2 = #ffd93d (yellow), instance 3 = #6bcb77 (green). Y-axis shared across
all traces (auto-scaled from global min/max across all 4). Small legend showing instance index → color mapping.

Instance selection strategy: Default to evenly-spaced: indices [0, floor(N/4), floor(N/2), floor(3N/4)]. This samples
across the field's spatial structure. For a CircleLayout with 400 instances, this picks 0° (instance 0), 90° (instance
100), 180° (instance 200), 270° (instance 300) — immediately showing quadrature phase relationships if they exist.

Interaction (future): If the heatmap is also implemented, clicking a row in the heatmap could add that instance to the
overlay set. But for v1, the automatic evenly-spaced selection is good enough and requires no UI interaction.

Great for: Debugging specific phase relationships. "Instance 0 and instance 200 should be exactly 180 degrees out of phase
— are they?" Two Lag outputs with different smoothing times overlaid. Comparing Oscillator output at different points in
the signal chain (before/after Slew, before/after Clamp). Targeted debugging where you know which instances to compare.

Dud when: You don't know which instances matter (most of the time). With 400 instances, picking "instance 0 and instance
1" is arbitrary. Also bad when instances are identical (after a Broadcast of a signal, all instances have the same value —
overlaying 4 of them shows one line).

===

WHAT WE HAVE NOW (Basic and lame)

4. Band Chart (min/max/p25/p75/mean — what we have now)

Great for: Fields where the envelope is the interesting thing. GridLayoutUV position over time: are the positions
converging, diverging, or stable? The min/max band shows the spatial extent, mean shows the center of mass. Lag applied to
a step change: the band narrows over time as instances converge — you can see the settling time. Reduce output debugging:
the reduction collapses a field to a signal, and comparing the band chart before/after shows you what information was
lost. Position fields in general where you want to know "are things spreading out or clustering?"

Dud when: Everything you just saw. Phased periodic data (Phasor, Oscillator fields): min/max are constants, mean is a
constant, the chart shows nothing. Hash/StableIdHash fields: statistics of hash values are meaningless. Any field where
the distribution is stable but the individual values are interesting — which is most animation fields.

  ---
