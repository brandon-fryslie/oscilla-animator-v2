Quick Reference: What to Show by Block Output Type
┌──────────────────────────────────────────────────────┬───────────────────────────────┬─────────────────────────────────┐
│                What you're looking at                │           Best viz            │            Worst viz            │
├──────────────────────────────────────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ Phasor/Oscillator field output                       │ DPO, single-instance          │ Band chart, histogram           │
│                                                      │ sparkline                     │                                 │
├──────────────────────────────────────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ GridLayoutUV position (static)                       │ Raster heatmap, histogram     │ Sparkline (flat), DPO (no       │
│                                                      │                               │ trigger)                        │
├──────────────────────────────────────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ Noise field                                          │ Histogram, raster heatmap     │ DPO (no period), band chart     │
├──────────────────────────────────────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ Lag/Slew during transition                           │ Band chart, multi-instance    │ Histogram (transient)           │
├──────────────────────────────────────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ HueRainbow / color field                             │ Color palette (existing)      │ Everything else (wrong domain)  │
├──────────────────────────────────────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ Clamp/Deadzone output                                │ Histogram (see clipping)      │ DPO, raster                     │
├──────────────────────────────────────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ Broadcast of a signal                                │ Sparkline (it's just one      │ Everything (N copies of same)   │
│                                                      │ value)                        │                                 │
├──────────────────────────────────────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ DomainIndex/StableIdHash                             │ Histogram (distribution       │ Sparkline, DPO, band chart      │
│                                                      │ check)                        │                                 │
├──────────────────────────────────────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ Bool field / EventToSignalMask                       │ Percentage bar (existing)     │ Histogram (2 bins), DPO         │
├──────────────────────────────────────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ CameraProjectionConst field                          │ Enum badge (existing)         │ Everything else                 │
├──────────────────────────────────────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ Math on periodic field (Add, Multiply, Modulo of     │ DPO (see waveform distortion) │ Band chart                      │
│ phasor)                                              │                               │                                 │
└──────────────────────────────────────────────────────┴───────────────────────────────┴─────────────────────────────────┘

⏺ Good point — you hover edges which connect ports, not blocks. Let me grab the actual port names.

⏺ Now I have the port-level picture. Here's the corrected reference:

  ---
Corrected: Port-Level Visualization Guide

Important context: adapters are auto-inserted. When you hover an edge, you might not be looking at Phasor.out →
Oscillator.phase directly — there could be an Adapter_UnitCast or Adapter_ScalarToPhase01 in between. The edge you're
hovering might be Adapter_UnitCast.out → Oscillator.phase. The type on the edge is what matters for choosing the
visualization, not the source block.

When Each Viz is a Dud (port-referenced)

Single-Instance Sparkline
Shines: Phasor.out (float:turns) — sawtooth waveform
Dud: GridLayoutUV.position (vec3:world3) — constant per instance, flat line
────────────────────────────────────────
Shines: Oscillator.out (float:none, [-1,1]) — sine/saw/square shape
Dud: Broadcast.field — every instance identical, sparkline = the input signal
────────────────────────────────────────
Shines: Lag.out, Slew.out — see smoothing character
Dud: DomainIndex.out (float) — constant integer per instance
────────────────────────────────────────
Shines: Accumulator.value — ramp/integration shape
Dud: StableIdHash.out (float) — constant hash per instance
────────────────────────────────────────
Shines: Noise.out (float) — see random walk character
Dud: Reduce.signal — this is already a signal, use the normal sparkline
────────────────────────────────────────
Shines: ExternalInput.out, ExternalVec2.out — user input shape
Dud: FieldConstColor.out — constant, flat forever
────────────────────────────────────────
Shines: Clamp.out, Deadzone.out — see clipping/gating in action
Dud: Any adapter output where the input was already constant
────────────────────────────────────────
Shines: SampleHold.out — staircase pattern
Dud:
────────────────────────────────────────
Shines: Any Adapter_*.out downstream of a periodic source
Dud:
Current-Frame Histogram
Shines: Phasor.out after Broadcast — phase distribution shape
Dud: CameraProjectionConst output — only 2 values, use enum badge
────────────────────────────────────────
Shines: Noise.out field — Gaussian vs uniform?
Dud: Broadcast.field of a Const — all identical, one bin
────────────────────────────────────────
Shines: HueRainbow.out (color:oklch) — hue spread uniformity
Dud: DomainIndex.out with N instances — N bins each with count 1
────────────────────────────────────────
Shines: Clamp.out field — spikes at boundaries = clamping rate
Dud: Any color payload — palette strip is better
────────────────────────────────────────
Shines: Adapter_Wrap01.out field — did wrapping create uniform dist?
Dud: Bool fields — two bins, percentage bar is better
────────────────────────────────────────
Shines: Hash.out field — hash quality (should look uniform)
Dud: vec3/vec4 ports — which component do you histogram? Ambiguous
────────────────────────────────────────
Shines: NormalizeRange.out — did it actually map to [0,1]?
Dud:
────────────────────────────────────────
Shines: Extract.out from a vec3 field — per-component distribution
Dud:
Raster Heatmap
Shines: Oscillator.out field (after Broadcast of Phasor) — traveling wave stripes
Dud: Instance count < ~8 — just use sparkline overlay
────────────────────────────────────────
Shines: Lag.out / Slew.out field — see smoothing propagate across instances
Dud: Broadcast.field of signal — all rows identical, solid bands
────────────────────────────────────────
Shines: Add.out field (periodic + offset) — phase offset patterns
Dud: color payload — single-channel heatmap loses color info
────────────────────────────────────────
Shines: Noise.out field — spatial correlation visible
Dud: Unordered instances (random DomainIndex) — vertical axis is meaningless without reordering
────────────────────────────────────────
Shines: Any field downstream of GridLayoutUV that varies over time
Dud: Static fields (GridLayoutUV.position alone) — solid horizontal stripes, no temporal info
Band Chart (min/max/p25/p75/mean) — the current one
Shines: GridLayoutUV.position — spatial extent (min/max = layout bounds)
Dud: Phasor.out field — min≈0, max≈1, mean≈0.5 forever
────────────────────────────────────────
Shines: Lag.out field during transition — band narrows as instances converge
Dud: Oscillator.out field — same, stats are constants
────────────────────────────────────────
Shines: Construct.out (vec3) — see xyz ranges of constructed positions
Dud: Hash.out / StableIdHash.out — statistics of hashes = meaningless
────────────────────────────────────────
Shines: Accumulator.value field — diverging envelope = runaway accumulation
Dud: DomainIndex.out — mean of indices = center index, useless
────────────────────────────────────────
Shines: Slew.out field after step change — settling time visible as band width
Dud: Any steady-state periodic field
────────────────────────────────────────
Shines: Add.out where one operand is growing — drift visible in band migration
Dud: Broadcast.field of anything — min=max=mean, zero-width band
DPO (Triggered Waveform + Phosphor Persistence)
Shines: Phasor.out field — THE use case, see phase spread as band thickness
Dud: GridLayoutUV.position — constant, no trigger crossings
────────────────────────────────────────
Shines: Oscillator.out field — waveform shape + amplitude variation
Dud: Noise.out — aperiodic, trigger fires randomly, display is chaos
────────────────────────────────────────
Shines: Smoothstep.out of phasor field — see the smoothstep curve directly
Dud: DomainIndex.out — constant integers, no oscillation
────────────────────────────────────────
Shines: Clamp.out of oscillator field — clipping visible as flat band tops
Dud: ExternalInput.out — user-driven, no periodic trigger
────────────────────────────────────────
Shines: PowerGamma.out of phasor — gamma distortion curve visible
Dud: Lag.out / Slew.out (non-periodic settling) — one-shot, not periodic
────────────────────────────────────────
Shines: Modulo.out of accumulator field — wrapping pattern
Dud: Low-frequency signals (period > ~3s) — sweep too slow to fill
────────────────────────────────────────
Shines: Adapter_UnipolarToBipolar.out — remapping curve shape
Dud: Sum of incommensurate frequencies — no single trigger period
────────────────────────────────────────
Shines: Multiply.out (oscillator × envelope) — AM modulation visible
Dud: Reduce.signal — already cardinality one, use normal sparkline
Multi-Instance Overlay (2-4 traces)
Shines: Comparing Lag.out at 2 different time constants
Dud: When you don't know which instances matter (most of the time)
────────────────────────────────────────
Shines: Verifying phase relationship between specific instances
Dud: Broadcast.field — all traces overlap perfectly
────────────────────────────────────────
Shines: Before/after comparison (same instance, different points in chain)
Dud: High-instance-count fields where instances aren't individually meaningful
  ---

Adapter Edge Gotcha

When the user hovers an edge like Adapter_UnitCast.out → Oscillator.phase, the type on that edge is float:turns (the
adapter cast the unit). The visualization selector should work on the edge type, which it already does. But worth noting:

- Adapter_ScalarToPhase01.out — float with turns unit, likely periodic → DPO candidate
- Adapter_UnitCast.out — preserves payload, changes unit → same viz as source
- Adapter_Wrap01.out — wrapped values, interesting histogram (should show uniform if wrapping is working)
- Adapter_UnipolarToBipolar.out — remapped range, sparkline shows the curve
- Adapter_HslToRgba.out — color payload, use palette strip
- Adapter_MsToSeconds.out — just a unit change, same value character as source

The key principle: the edge type (payload + unit + cardinality) determines the visualization, not which block produced it.
Adapters don't change what viz is useful — they change the type annotation, which the renderer selector already
dispatches on.

