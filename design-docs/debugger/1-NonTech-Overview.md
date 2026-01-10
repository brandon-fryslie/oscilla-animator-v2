A good debug system for Oscilla shouldn’t feel like “logs.” It should feel like instrument diagnostics: “what’s feeding this?”, “why is it flat?”, “why is it jittering?”, “what changed when I touched that?”, and “is this patch actually looping or just replaying?”

Below is a full, user-facing, non-technical debug design that fits your buses + Default Sources + lenses/adapters + TimeRoot model.

⸻

The Debug Philosophy
	1.	Always show a picture first, numbers second.
	2.	Everything is localized: debug is attached to a bus, binding, block, or output—not a global console.
	3.	Debug answers one question at a time:
	•	“Where does this come from?”
	•	“What is it right now?”
	•	“What is it over time?”
	•	“What is shaping it?”
	•	“What is wrong?”

⸻

The Debug Surface Area

A) Debug HUD (always available, minimal)

A small strip near the player with 4 lights:
	•	Clock: Finite / Cyclic / Infinite (with period/window)
	•	Health: OK / Warning / Error
	•	Performance: FPS + “heavy fields” count
	•	Stability: “Scrub-safe” / “Live-only” indicator

Clicking any light opens the corresponding panel pre-filtered.

⸻

B) “Probe Mode” (the main user-friendly debugger)

A toggle button: Probe (cursor becomes a probe).

In Probe mode:
	•	Hover anything (bus row, block, port, lens chip, output preview)
	•	A probe card pops up with:
	•	What it is
	•	Live value visualization
	•	Source chain
	•	Common fixes (one-click)

This is the non-technical equivalent of “inspect element.”

Probe card examples
Hover a bus energy:
	•	Meter (bar + peak hold)
	•	Sparkline history (last 10s)
	•	Publisher list with contributions (sorted)
	•	Combine mode label (“Sum”)
	•	“Why does it clip?” → suggests Softclip lens on bus listeners or gain down on top publisher

Hover a listener binding (bus → port):
	•	Shows bus value → adapters → lenses → final port value
	•	Each stage has a tiny visualization
	•	“Disable this lens” toggle
	•	“Swap mapping” (MapRange presets)

⸻

C) The Debug Drawer (structured, searchable)

A panel that slides up from bottom: Diagnostics.

Tabs:
	1.	Overview
	2.	Buses
	3.	Time
	4.	Output
	5.	Performance
	6.	Changes (history)

The drawer is how you go from “something feels off” to “I know why.”

⸻

What Each Tab Contains

1) Overview Tab: “What’s happening right now?”

A single page summary:
	•	Patch mode: Infinite / Cyclic / Finite
	•	Primary clock: TimeRoot name
	•	Current phase(s): phaseA/phaseB meters
	•	Bus heatmap: small grid showing which buses are active (color intensity)
	•	Top issues list (plain language):
	•	“Pulse bus is silent (nothing triggers).”
	•	“Radius is constant (no modulation).”
	•	“Palette is conflicting (3 layers fighting).”
	•	“Field materialized 12× per frame (heavy).”

Each issue has a Fix button.

⸻

2) Buses Tab: the “Mixer Inspector”

This is basically BusBoard + instrumentation.

For each bus:
	•	Live visualization appropriate to type:
	•	number: meter + sparkline
	•	phase: phase ring + wrap tick markers
	•	color: swatch strip + blend result
	•	trigger: pulse train timeline
	•	Publisher table:
	•	enable toggle
	•	contribution meter
	•	lenses applied on publisher
	•	adapters badge (only if present)
	•	Listener table:
	•	port name + block label
	•	lens stack summary
	•	“solo” (temporarily isolate this listener for debug)

Critical feature: Trace view
Click any bus → “Trace” opens a left-to-right pipeline:

Publishers → Combine → Listener Transform → Port

Everything is visible as chips. No wires.

⸻

3) Time Tab: “Looping & playback truth”

Non-technical users need to know whether they made a real loop, an internal loop, or a replay.

Time Tab shows:
	•	TimeRoot kind (Finite/Cyclic/Infinite)
	•	If cyclic: period + pingpong/loop
	•	If infinite: “window” used for preview (and why)
	•	Phase publication:
	•	“phaseA is driven by TimeRoot” (badge)
	•	“pulse is generated on wrap events” (badge)
	•	Wrap events visualization:
	•	a timeline strip showing wrap ticks
	•	“Loop integrity check”:
	•	If render output is periodic-ish: “seamless loop likely”
	•	If discontinuities detected (big jumps): “loop seam detected” with suggestions:
	•	add Slew on energy
	•	avoid reducing field to signal abruptly
	•	ensure no time clamping lenses

This tab is where you make looping feel real and intentional.

⸻

4) Output Tab: “Why does it look like this?”

A set of output-focused tools:
	•	Layer tree (RenderTree summary, but friendly):
	•	groups, instance sets, effects
	•	“What’s controlling this?” click targets:
	•	click a rendered group/instance set in preview → highlights which blocks and buses contribute
	•	Visual overlays:
	•	show element ids (briefly)
	•	show bounds
	•	show velocity vectors (if available)
	•	show alpha/size heatmap

This is critical for Field debugging without talking about arrays.

⸻

5) Performance Tab: “What is expensive?”

This is not a profiler; it’s a diagnostic.

Shows:
	•	FPS estimate + worst frame ms
	•	Count of:
	•	field materializations per frame
	•	heavy adapters invoked
	•	number of active elements (Domain size)
	•	Top 5 expensive operations (human readable):
	•	“Field Reduce (mean) on bus ‘energy’”
	•	“RenderInstances2D materializing 6 fields”
	•	“Large Domain (10,000 elements)”
	•	Each item includes:
	•	Why it costs
	•	How to fix
	•	“Jump to source”

This is where your lazy field system pays off: you can surface “materialized here.”

⸻

6) Changes Tab: “What changed?”

This is the non-technical superpower.

A timeline of patch edits (from your event system / transaction log):
	•	“Connected phaseA → radius”
	•	“Added lens MapRange”
	•	“Changed combine mode energy: sum→max”
	•	“Moved Default Source value: 5→12”

Click an entry to:
	•	highlight impacted buses/blocks
	•	show before/after value at the probed target
	•	revert just that change (branching history)

This makes experimentation safe and addictive.

⸻

Error Taxonomy for Non-Technical Users

Instead of “CycleDetected” or “TypeMismatch,” show:

“Signal Not Reaching”
	•	“This input is not receiving anything.”
	•	likely causes:
	•	listener disabled
	•	bus has no publishers
	•	fix: “Add publisher” / “Enable binding” / “Set silent value”

“Conflict”
	•	“Two things are fighting over this.”
	•	shown when:
	•	combineMode = last and multiple publishers
	•	palette layering unexpectedly
	•	fix: reorder publishers (sortKey UI), change combine mode, reduce publishers

“Too Sharp”
	•	“This is changing too abruptly.”
	•	fix: suggest Slew lens on listener, or soften publisher

“Too Heavy”
	•	“This is costly to compute.”
	•	fix: reduce elements, remove field→signal reduce, reduce lens stack depth

“Time Disagreement”
	•	“Your patch loop and the player loop don’t match.”
	•	fix: align TimeRoot, set cyclic, or adjust preview window

Everything in this taxonomy links to the relevant panel and provides a one-click remedy.

⸻

Key Implementation Hooks You Already Have

You already emit RuntimeHealthSnapshot with room to grow. Extend it to include:
	•	per-bus stats:
	•	current value snapshot (for simple types)
	•	nan/inf counts
	•	publisher count enabled
	•	evaluation stats:
	•	field materialization count + who triggered it
	•	adapter invocations by id
	•	lens invocations by id
	•	time model:
	•	current phase, wrap events count

This powers the whole debug UX without “console logs.”

⸻

The One Feature That Makes It Feel Magical

“Why?” button everywhere.

On any port/bus/value display:
	•	“Why is this 0?”
	•	“Why is this flickering?”
	•	“Why is nothing moving?”
	•	“Why is it slow?”

It runs a small rules engine over the current graph + runtime stats and returns:
	•	1–3 likely causes
	•	direct navigation
	•	an explicit fix action

This is how non-technical users debug generative systems without reading graphs.
