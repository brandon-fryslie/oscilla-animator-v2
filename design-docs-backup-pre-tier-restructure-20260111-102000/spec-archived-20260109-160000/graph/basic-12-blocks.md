Below is the canonical, implementation-grade definition of the 12 blocks that make up the swarm-class Oscilla patch, expressed in the terms your compiler, field system, and renderer actually use.

This is not UI language — it is the contract between patch, compiler, and runtime.

⸻

1. TimeRoot

Role
Defines the single authoritative simulation clock.

Outputs
•	time : signal<float> — monotonic simulation time in seconds.

Semantics
•	Produced once per frame by the scheduler.
•	All phase, noise, and motion is derived from this.
•	Hot-swap preserves continuity via time offset (phase locking).

⸻

2. Domain

Role
Defines a population of indexed elements.

Inputs
•	count : config<int>

Outputs
•	domain : domain

Semantics
•	Domain defines a stable set of element IDs [0 … count-1].
•	Domains are not data — they are iteration topology.
•	Every field downstream is evaluated per domain element.

⸻

3. Id / U01

Role
Expose per-element identity and normalized coordinate.

Inputs
•	domain : domain

Outputs
•	id : field<int>
•	u01 : field<float>  (i / count)

Semantics
•	id is stable across frames.
•	u01 gives each element a deterministic 0–1 coordinate.
•	This is how gradients, rings, and spatial ordering work.

⸻

4. Hash

Role
Deterministic per-element random seed.

Inputs
•	id : field<int>
•	seed : signal<float>

Outputs
•	rand : field<float> (0..1)

Semantics
•	Pure function of (id, seed).
•	Produces static randomness per element.
•	Used to decorrelate noise, colors, motion.

⸻

5. Noise

Role
Time-varying smooth randomness.

Inputs
•	x : field<float> (usually Hash or Id-based)
•	time : signal<float>
•	scale : signal<float>
•	speed : signal<float>

Outputs
•	noise : field<float>

Semantics
•	Produces continuous noise over time.
•	This is the “organic motion” source.
•	Noise is evaluated per element but varies smoothly over time.

⸻

6. Add

Role
Vector or scalar addition.

Inputs
•	a : field<T>
•	b : field<T>

Outputs
•	out : field<T>

Semantics
•	Component-wise.
•	Works for float, vec2, vec3.
•	Used everywhere for steering, offsets, blending.

⸻

7. Mul

Role
Scalar or vector scaling.

Inputs
•	a : field<T>
•	b : field<float>

Outputs
•	out : field<T>

Semantics
•	Multiply vector by scalar or scalar by scalar.
•	Used for strength, speed, amplitude.

⸻

8. Length

Role
Vector magnitude.

Inputs
•	v : field<vec2>

Outputs
•	len : field<float>

Semantics
•	Distance to origin.
•	Used for attraction, falloff, orbit forces.

⸻

9. Normalize

Role
Unit direction vector.

Inputs
•	v : field<vec2>

Outputs
•	dir : field<vec2>

Semantics
•	v / |v| with zero-safe behavior.
•	Used to turn “point to target” into motion direction.

⸻

10. State

Role
Persistent per-element memory.

Inputs
•	domain : domain
•	input : field<T>

Outputs
•	value : field<T>

Semantics
•	On each frame:

value[t] = input[t-1]


	•	This is the only legal way to make feedback.
	•	Velocity, position, phase accumulators live here.

This is the entire physics engine.

⸻

11. HSV → RGB

Role
Color generation.

Inputs
•	h : field<float>
•	s : field<float>
•	v : field<float>

Outputs
•	rgb : field<color>

Semantics
•	Produces per-element color.
•	Hue almost always comes from u01 + time.

⸻

12. RenderInstances2D

Role
Bridge from math to pixels.

Inputs
•	domain : domain
•	position : field<vec2>
•	radius : field<float>
•	color : field<color>
•	opacity : field<float>

Semantics
•	Compiler lowers this to:
•	Materialize fields
•	Build instance buffers
•	Emit render pass IR
•	Renderer just draws what it’s told.

⸻

Why this set is complete

These twelve blocks give you:
•	Time
•	Identity
•	Randomness
•	Smooth motion
•	Vector math
•	Memory
•	Color
•	Rendering

Everything else (orbiting, swarming, noise fields, attractors, turbulence, trails, morphing, gradients, motion blur, flow fields) is just wiring.

No special “particle system” exists — it emerges from:

State(position)
State(velocity)
Noise
Normalize
Add
Mul

which is why this architecture scales from toys to physics-grade simulations without changing the block set.