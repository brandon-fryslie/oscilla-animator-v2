# Question: 

Why is Palette a Rail?

# Answer 

Because color selection is a time-varying global modulation source, not just a lookup table — and that distinction is the entire reason it belongs next to phase and energy rather than next to user buses.

Let’s be precise.

⸻

What a Rail actually is

A Rail is:

A global, time-derived, deterministic modulation signal that exists whether or not the patch references it.

That is the defining property.

Time, phaseA, phaseB, energy, pulse, palette are not “routing constructs”.
They are global carriers of temporal structure.

A Bus is user wiring.
A Rail is part of the simulation clock fabric.

⸻

What palette actually represents

palette is not “a list of colors”.

palette is:

A time-indexed color field defined in the Time Console.

Formally:

palette : Signal<Color>
palette(t) = ColorCurve.evaluate(t)

It is a continuous, deterministic, time-dependent function.

Just like:

phaseA(t)
energy(t)

This makes palette a modulation rail — not data.

⸻

Why this cannot be a normal bus

If palette were a bus:

• It could be absent
• It could be overwritten by blocks
• It could be undefined until someone wires it
• Its timing would depend on patch topology

That breaks the core promise:

The visual identity of a patch must exist before the patch is wired.

Palette is part of the identity of time in Oscilla.

A patch with no blocks must still have:
•	a color atmosphere
•	a mood
•	a chromatic rhythm

That comes from palette(t).

⸻

What palette does in practice

Palette is used as:

• Default color source for renderers
• Global chromatic modulation
• A time-synced color curve for everything
• A semantic anchor for aesthetic continuity

If you do nothing:

RenderInstances2D.color ← palette

That is how a brand-new patch looks alive.

⸻

Why it lives with phase and energy

These are all the same class of thing:

Rail	Meaning
time	Where are we in simulation?
phaseA	Where are we in cycle A?
phaseB	Where are we in cycle B?
energy	How strong is motion right now?
palette	What color mood is active right now?
pulse	When did a temporal boundary occur?

They are not data.

They are temporal reference frames.

Palette is the chromatic reference frame.

⸻

Why modular synths do the same thing

In synths:

• LFOs modulate pitch
• Envelopes modulate amplitude
• Key tracking modulates filters

Oscilla simply extends this to:

Color is also modulated by time

Palette is just the color LFO.

⸻

The deep reason

Oscilla is not:

“a system that renders shapes”

It is:

“a system that maps time into aesthetic fields”

Color is a first-class aesthetic field.

So it gets a rail.

That’s why palette is not optional.
That’s why it is not a bus.
That’s why it lives in the Time Console.

It is part of the clock.