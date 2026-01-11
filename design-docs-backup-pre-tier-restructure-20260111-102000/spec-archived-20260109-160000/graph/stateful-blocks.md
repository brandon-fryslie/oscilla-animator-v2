These are the four canonical stateful blocks that every non-toy temporal system needs in order to be continuous, controllable, and stable across time, scrubbing, speed changes, and live edits.

They are not effects.
They are time-domain primitives.
Everything else (LFOs, physics, smoothing, easing, phase, motion) is built out of these.

⸻

1) UnitDelay<T>

Role:
Make feedback and memory possible.

Definition:

y(t) = x(t-1)

Inputs
•	x : T
•	reset? : event (optional)

Outputs
•	y : T

State
•	One stored value of type T

Why it exists
Without this block:
•	No feedback loops
•	No integrators
•	No physics
•	No phase unwrapping
•	No filters
•	No accumulators
•	No continuity across frames

This is the only primitive that breaks acyclicity safely.

Everything with memory reduces to UnitDelay.

⸻

2) Accumulator

Role:
Turn velocity into position, rate into amount, phase into unwrapped time.

Definition

y(t) = y(t-1) + x(t)

Which is:

y = UnitDelay(y) + x

Inputs
•	x : number (delta per frame or per second depending on convention)
•	reset? : event

Outputs
•	y : number

State
•	One float

Why it exists
This gives you:
•	Unwrapped phase
•	Position from velocity
•	Hue drift
•	Time integration
•	Physics

It is the mathematical bridge from rate to state.

⸻

3) SampleAndHold<T>

Role:
Latch a value only when an event occurs.

Definition

if trigger(t): y(t) = x(t)
else y(t) = y(t-1)

Inputs
•	x : T
•	trigger : event

Outputs
•	y : T

State
•	One stored value of type T

Why it exists
This is how you:
•	Capture random values on beat
•	Freeze parameters
•	Lock phases
•	Do step sequencers
•	Implement “change only on wrap”
•	Stabilize things during scrubbing

It is event → state.

⸻

4) PhaseUnwrapper

Role:
Turn a wrapping phase into a continuous phase.

This is the anti-jank block.

Definition

if phase01(t) < phase01(t-1) - 0.5: turns += 1
if phase01(t) > phase01(t-1) + 0.5: turns -= 1   // reverse playback
phaseU = turns + phase01

Inputs
•	phase01 : phase
•	wrap? : event (optional, if provided overrides detection)

Outputs
•	phaseU : number

State
•	prevPhase01
•	turns

Why it exists
This is what prevents:
•	Jumping animations
•	Hue popping
•	Teleporting motion
•	Scrub glitches
•	Speed change discontinuities

This is the core continuity primitive.

⸻

Why these four are the minimal complete set

Everything else reduces to them:

Concept	Built from
LFOs	PhaseUnwrapper + sin/cos
Oscillators	Accumulator
Filters	UnitDelay + math
Physics	Accumulator + UnitDelay
Envelopes	SampleAndHold + Accumulator
Phase-locked motion	PhaseUnwrapper
“Do this once per loop”	wrap event + SampleAndHold
Scrub-stable animation	PhaseUnwrapper + Accumulator
Random on beat	SampleAndHold(Random, pulse)

No other stateful block is fundamental.

If you have these four, the system is:
•	Continuous
•	Loop-safe
•	Scrub-safe
•	Speed-change-safe
•	Live-edit-safe
•	Offline-render-exact

That is the invariant.