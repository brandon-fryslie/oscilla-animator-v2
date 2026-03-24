Port identity conclusion is correct given your stated invariant: blockId:portName is stable as an ID (not a user label), so it’s acceptable as a DebugTargetKey.port key for now.

For Section 4, the overall shape is right, but you need to reconcile units, remove implicit heuristics, and tighten two rendering rules.

2) Remove “value ≈ 0 or ≈ 1” wrap detection (it’s implicit / heuristic)

A phase value being near 0/1 is not “wrap happened”; it’s just the value. The only correct wrap indicator is derived from history discontinuity, not the instantaneous sample.

Canonical rule:
•	The FloatValueRenderer does no wrap detection.
•	The Sparkline (or ViewMode) may optionally draw a small “wrap marker” when successive samples show a discontinuity consistent with wrap (e.g., prev > 0.9 && curr < 0.1), and only when type.unit === 'phase'.

That keeps semantics truthful and avoids magic thresholds in formatting.

3) Clamp indicator: keep it explicit and unit-scoped

Your “⚠ if outside [0,1]” is fine only when type.unit === 'normalized' or payload is unit. For plain float/scalar, don’t invent bounds.

Rule:
•	normalized or payload unit: warn if <0 or >1
•	phase: never warn (values may be out of range transiently before wrap depending on kernels, but your canonical phase contract says 0..1 with wrap; if you enforce wrap upstream, then warn only if violated by a bug)
•	scalar: no bounds warning

4) Color renderer: correct, with one required canonical encoding decision

Your runtime spec earlier said color is RGBA 0..1 each, but your renderer file earlier used Uint8ClampedArray for pass color.

For debug UI, you must pick one canonical representation at the debug layer:
•	Either debug samples for color are always float RGBA (0..1) (recommended; matches canonical payload semantics)
•	Or you declare debug color as u8 RGBA and the ValueRenderer converts

Don’t allow both. Debug UI should not guess which it is.

5) Sparkline: “auto-scale to min/max” needs one guard

Auto-scaling is fine, but you must handle flat-lines and NaN/Inf:
•	If min≈max: render a centered flat line.
•	If any NaN/Inf in window: show “invalid” badge and skip sparkline (or clamp to finite samples only, but that’s another implicit heuristic—better to surface invalid).

Also, for stride=4 luminance: that is a ViewMode projection choice and is fine, but it must be stated as:
•	color sparkline uses derived luminance projection (explicit), not “payload-agnostic.”

6) DistributionBar: include std or don’t mention it

Your AggregateStats includes std. Either use it (e.g., shaded ±1σ band) or remove it from this section to keep it crisp. If you keep it unused, engineers will cargo-cult it.

⸻

Minimal corrections to your Section 4 text
•	Remove instantaneous wrap indicator from FloatValueRenderer; move wrap markers (optional) into Sparkline/ViewMode using history deltas and only when unit is phase.
•	Define one canonical debug encoding for color samples (float RGBA 0..1 is the cleanest).
•	Add NaN/Inf + flatline handling to Sparkline.
•	Either use std or drop it from AggregateStats here.

With those adjustments, the two renderer specs are correct and implementable.

That statement.