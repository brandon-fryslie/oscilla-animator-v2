Great—discarding the score simplifies things a lot, and I think your instinct about spending UI budget on power, not plumbing is exactly right.

I’ll focus on (2) The Modulation Table as the primary paradigm, and then show how (3) the Recipe / Instrument Builder becomes a structured façade over the same underlying system rather than a competing model.

I’ll stay concrete and implementation-minded.

⸻

Core decision

Primary UI = Modulation Table
Secondary UI = Recipe View (derived, optional, collapsible)

There is one underlying model:
	•	buses
	•	lenses (adapters)
	•	time roots
	•	domains
	•	render sinks

The two views are simply different projections of the same graph, not different systems.

This keeps engineering complexity sane.

⸻

The Modulation Table — canonical model

What the table actually represents

The table is not “UI sugar.”
It is the authoritative representation of signal flow.

Formally:
	•	Columns = Signal sources (buses)
	•	Rows = Addressable targets (ports on renderers, domains, cameras, etc.)
	•	Cells = Lens chains (transformers) binding a source to a target

Nothing else exists.

No wires.
No spatial graph.
No layout logic.

⸻

Column model (sources)

Each column corresponds to exactly one bus.

Examples:
	•	phaseA
	•	phaseB
	•	energy
	•	pulse
	•	noise.low
	•	noise.high
	•	time.secondary
	•	audio.low (future)

Column header contents

Each column header shows:
	1.	Bus name
	2.	World + domain badge
	•	Signal · phase
	•	Signal · number
	3.	Combine mode
	•	last, sum, max, etc.
	4.	Activity indicator
	•	subtle animated bar or dot
	5.	Source summary
	•	“3 publishers”
	•	click → jump to publishers list

This makes it immediately clear:
	•	what signals exist
	•	which ones are driving the system
	•	whether you’re overusing a bus

⸻

Row model (targets)

Each row corresponds to a single bindable port, not a block.

Examples:
	•	Dots.radius
	•	Dots.opacity
	•	Dots.position.x
	•	Dots.position.y
	•	Camera.zoom
	•	Stroke.width
	•	Color.hue
	•	Domain.jitterAmount

Rows are grouped hierarchically:

Render: Dots
  ├─ radius
  ├─ opacity
  ├─ color.hue
  └─ color.sat

Camera
  └─ zoom

Domain
  ├─ position.x
  └─ position.y

Rows do not exist unless the underlying block exists.

This is critical:
	•	adding a renderer creates rows
	•	removing a renderer removes rows
	•	no dangling connections possible

⸻

Cell behavior (the real power)

A cell answers exactly one question:

“How does this signal affect this attribute?”

A cell can be in four states:
	1.	Empty
	•	no influence
	2.	Direct
	•	raw bus value
	3.	Lens chain
	•	sequence of transforms
	4.	Muted
	•	binding exists but disabled

Cell UI

Visually:
	•	Empty = blank
	•	Direct = small dot or icon
	•	Lens chain = compact chip, e.g.

scale(3→15) · ease(inOut)



Hover:
	•	expands inline
	•	shows live preview of value
	•	shows per-element vs signal badge

Click:
	•	opens Lens Editor
	•	reorder, add, remove transforms
	•	replace entire chain

Right-click:
	•	copy lens chain
	•	paste into another cell
	•	convert to preset

⸻

Lens Editor (inside a cell)

This is where most interaction happens.

Features:
	•	linear list of transforms
	•	each transform has:
	•	type
	•	params (animated or static)
	•	enable toggle
	•	real-time preview graph (tiny sparkline)

Example chain:

phaseA
 → scale(0..1 → 3..15)
 → ease(inOut)
 → jitter(±1)

Internally:
	•	this compiles directly to your adapter chain system
	•	no additional graph nodes needed

⸻

How blocks appear in this world

Adding a block

Example: user adds DotsRenderer

What happens:
	1.	Renderer appears in a Renderer Panel
	2.	Corresponding rows appear in the table
	3.	Table auto-scrolls to show them
	4.	Rows glow briefly to indicate “new targets”

The user never positions anything.

⸻

Adding a signal source

Example: user adds PhaseClock

What happens:
	1.	PhaseClock publishes to a bus (or auto-creates one)
	2.	Column appears in the table
	3.	Column glows briefly
	4.	User immediately sees where it could be applied

⸻

Discovery: guiding users without forcing topology work

This is where your idea shines.

Clicking an empty cell

Clicking an empty cell opens a contextual picker:
	•	Filters compatible buses automatically
	•	Shows live previews on hover:
	•	temporarily applies the lens
	•	animates only that row
	•	Shows “recommended” lenses first
	•	Shows “recently used” lenses

This answers:

“What fits here?”

without the user needing to know types.

⸻

Swapping is trivial

Because bindings are declarative:
	•	remove a column → everything updates
	•	swap lens → instant feedback
	•	replace a renderer → rows remap or vanish cleanly

No rewiring.
No cleanup.

⸻

The Recipe View — derived, not primary

The Recipe / Instrument Builder is just a projection of the table.

It groups related rows into semantic sections:
	•	Time
	•	Domain
	•	Motion
	•	Appearance
	•	Rendering

Each section:
	•	summarizes which buses affect it
	•	shows human-readable descriptions:
	•	“Radius breathes with phaseA”
	•	“Color cycles slowly with phaseB”

Clicking a line:
	•	jumps to the corresponding table rows
	•	highlights the relevant cells

This gives you:
	•	approachability
	•	storytelling
	•	documentation

without sacrificing rigor.

⸻

Why this solves your core concerns

1. No graph toil
	•	No positioning
	•	No wires
	•	No routing puzzles

2. Encourages bus-first thinking

The table is a bus-centric UI.

If everything feels same-y:
	•	you will literally see the same column filled everywhere

That’s feedback, not a hidden mistake.

⸻

3. Scales to complexity
	•	5 buses × 20 rows = manageable
	•	20 buses × 50 rows = scrollable, filterable
	•	You can collapse row groups, hide columns, save views

Graphs do not scale this cleanly.

⸻

4. Engineering-friendly

From your side:
	•	table = mapping of (busId, portId) → adapterChain
	•	no layout engine
	•	no edge routing
	•	no hit-testing nightmares
	•	trivial undo/redo

It aligns perfectly with:
	•	buses
	•	adapters
	•	lazy fields
	•	no-jank live edits

⸻

Important final note

This UI is not limiting.

Under the hood, the system is more expressive than a node graph:
	•	multiple influences per attribute are explicit
	•	ordering and combination are visible
	•	transforms are first-class

What you’re removing is busywork, not power.

If you want, next we can:
	•	design the exact data structures backing the table
	•	or walk through a full ambient patch built only through this UI