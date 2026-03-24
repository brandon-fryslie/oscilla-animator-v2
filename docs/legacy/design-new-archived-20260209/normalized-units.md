“Normalized input” usually means mapped into a known, dimensionless range, most often 0..1 (sometimes -1..1 depending on the convention). In the lenses list, I meant 0..1.

You should not try to keep everything normalized 0..1. You should keep specific channels normalized where that convention buys you composability, and keep everything else in the most natural unit/range for its meaning.

Where 0..1 should be the default
•	Phase / cyclic parameters: phase, hue, anything that wraps → [0,1) with wrap.
•	Weights / mix factors / masks: t for lerp, opacity/alpha, blend amount → [0,1] with clamp.
•	Easings / curves: easing input/output usually 0..1.
•	Normalized indices: normalizedIndex → [0,1].

These are the “glue signals” that make graphs composable, because blocks can assume consistent semantics.

Where 0..1 should not be forced
•	Time: keep in seconds or milliseconds, not 0..1. You can derive normalized time locally if you want.
•	Angles: keep radians (or degrees) as a unit, not 0..1, unless it’s explicitly “phase”.
•	Positions / lengths: keep in world/view/screen units (whatever your coordinate system is), not 0..1.
•	Velocities / accelerations: keep in natural units; normalization hides meaning and breaks physical composition.
•	Audio-like / bipolar modulation signals: often better as [-1,1] than [0,1].

If you force these into 0..1, you end up with constant renormalize/denormalize lenses everywhere, which is exactly the duplication you’re trying to avoid.

Practical rule that stays coherent with your type system
•	Use UnitType to encode the convention, and only normalize when the unit says so.
•	Example: unit: {kind:'scalar', unit:'normalized01'} vs unit:'seconds' vs unit:'radians'.
•	Provide a small set of explicit lenses:
•	NormalizeRange(inMin,inMax) → 0..1
•	DenormalizeRange(outMin,outMax) from 0..1
•	Wrap01, Clamp01
•	Bipolar↔Unipolar: u = (b+1)/2, b = u*2-1

That keeps 0..1 as a deliberate interface for the right concepts, not a blanket constraint across the whole graph.

You should normalize the “glue” signals (phase, mix, masks, easings, normalizedIndex) and keep time/space/physics in real units.