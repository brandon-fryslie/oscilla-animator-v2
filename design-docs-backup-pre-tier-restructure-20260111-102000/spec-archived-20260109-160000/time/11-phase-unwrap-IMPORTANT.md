You’re seeing the correct behavior: phase01 is discontinuous at wrap (0.999… → 0.0). If a patch uses phase01 directly as a position, hue, index, etc., that discontinuity becomes a visible jump.

The fix is not “make phase not wrap.” The fix is: make the thing you’re animating continuous, and only use wrapped phase as a selector (where discontinuity is acceptable), not as a state.

Below is a spec-level solution that is easy to make look great and hard to misuse.

⸻

1) Introduce a canonical “Loop” abstraction that is continuous

Define a LoopClock output bundle that every time source can provide:
•	phase01 : number in [0,1) (wraps)
•	turns : integer turn counter (monotonic, increments on wrap)
•	phaseU : unwrapped phase in ℝ, continuous (the core)
•	dPhase : per-frame delta of phaseU (continuous velocity)
•	wrap : event trigger on wrap (edge)
•	progress01 : (optional) only for finite time

Core definition:

phaseU(t) = φ_base(t) + Δφ   // NOT wrapped
phase01(t) = wrap(phaseU(t))
turns(t) = floor(phaseU(t))   // or an integer counter derived from wrap detection
dPhase(t) = phaseU(t) - phaseU(t-1)

The rule users should learn
•	Use phaseU for anything that should not jump (position, rotation, accumulated hue drift, index scrolling).
•	Use phase01 only for cyclic “within the loop” shapes (LFOs, oscillators, lookup in a cyclic palette).
•	Use wrap only for “once per cycle” actions (reseed, shuffle, spawn).

This alone makes it hard to do it wrong because the correct signal is explicitly exposed.

⸻

2) Provide “safe oscillator” blocks that take LoopClock, not raw numbers

Make oscillators accept a LoopClock (or phaseU) and output a continuous value:

Canonical blocks
•	OscSin(clock) → sin(2π * phaseU)
•	OscTri(clock) → triangle
•	OscSaw(clock) → saw (this one will still be discontinuous if you output raw saw; so provide a “bandlimited” variant or steer users to sin/tri for motion)
•	OscPulse(clock, duty) → discontinuous by nature (fine for gating, not for motion)

Key constraint:

Any block marketed as “motion” must not output a discontinuity at cycle boundaries.

So:
•	Rotate2D should take phaseU or angleRad that is continuous.
•	HueDrift should take phaseU and apply wrapping internally for HSV conversion.

⸻

3) Provide an explicit “unwrap” adapter and make it the default in UI affordances

Even if internally you carry phaseU, users will still grab phase01 out of habit.

So you add:
•	Adapter: Phase01 → PhaseU called UnwrapPhase
•	Inputs: phase01
•	Optional: wrapEvent (if you have it)
•	Output: phaseU

Implementation: persistent accumulator

if phase01 < prevPhase01 - 0.5: turns += 1
if phase01 > prevPhase01 + 0.5: turns -= 1   // if reverse playback allowed
phaseU = turns + phase01
prevPhase01 = phase01

UI rule (hard-to-do-wrong)

Whenever a user connects phase01 into any port whose type/role implies “continuous quantity” (position, angle, index scroll, time-like), the editor auto-inserts the UnwrapPhase structural block on the edge.

This is the exact same mechanism you already want for default sources and state-on-wire: it’s a structural block insertion, not compiler magic.

⸻

4) Provide “loop-safe” mapping helpers

Most jumps happen because users do:
•	x = lerp(a,b,phase01) (jumps at wrap)
•	hue = phase01 (jumps in hue)
•	index = floor(phase01 * N) (jumps)

Give them canonical alternatives that accept phaseU:

Continuous lerp along a closed loop

If they want a looping traversal without a teleport, they want a closed curve or modulo domain.

Provide blocks:
•	LoopIndex(phaseU, N) → continuous index in ℝ (not floored)
•	SampleRing(field, phaseU) → samples a ring buffer smoothly (uses fractional index + wrap)
•	HueWheel(phaseU) → hue computed from phaseU but wrapped internally (visual continuity preserved because hue wrapping is perceptually cyclic)

And for position:
•	Orbit(center, radius, clock) uses sin/cos of phaseU, not phase01.

⸻

5) Define a strict type split: phase01 is not a number

If you keep phase as a distinct domain (you do), use it to enforce safety.

Make this illegal by default:
•	phase01 → number adapter auto-exists silently

Make the only standard conversion be:
•	Phase → PhaseU (unwrap)
•	Phase → AngleRad (using unwrapped or wrapped depending on intent, but default to unwrapped for motion)
•	Phase → Gate (wrap event or comparator on phase01)

So “I’ll just adapt it to number” becomes deliberately frictionful, and the safe path becomes the ergonomic one.

⸻

6) Provide “wrap smoothing” only as a specialized effect, not the default

Sometimes users want a saw-like discontinuity but want to hide it visually (e.g., opacity crossfade around wrap). That’s not fixing the underlying issue, it’s an effect.

Provide:
•	WrapCrossfade(phase01, width) → outputs two weights w0, w1 that smoothly cross at wrap boundary
•	BlendAtWrap(valueA, valueB, phase01, width) → blends only near wrap

But keep this as an advanced tool. The default is still: use phaseU for continuous motion.

⸻

7) Minimal “rules of use” you can bake into docs + UI labels

In the UI, label outputs like:
•	Phase (loop) = wraps, for cyclic shapes
•	Phase (continuous) = unwrapped, for motion

And enforce these constraints:
•	Ports tagged continuous auto-insert UnwrapPhase when fed phase01.
•	Blocks tagged motion must not output discontinuities.
•	Wrapping events are explicit (wrap) and are the only intended place for “do something once per cycle”.

That makes “great” the path of least resistance.

That is the complete solution.