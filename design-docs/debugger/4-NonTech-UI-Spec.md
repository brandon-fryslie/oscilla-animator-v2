Non-technical Debug UI Spec: Probe Cards + Trace View + Fix Actions

I can specify exactly:
	•	the probe-card layout structure and its data needs (so your DebugGraph fields match UI requirements),
	•	and the “Fix action” mechanism (how a diagnostic suggests and executes an undoable op).

This is the user-facing layer that sits on top of the DebugGraph + DebugSnapshot pipeline. It must feel like “instrument inspection,” not like logs.

⸻

1) Probe Mode UX

1.1 Entry + cursor behavior
	•	A single toggle in the main UI: Probe (icon: crosshair / magnifier).
	•	When enabled:
	•	Cursor changes to a probe.
	•	Hovering any “debuggable surface” shows a hover outline and a Probe Card anchored near the cursor.
	•	Clicking pins the Probe Card (turns into a floating panel). Clicking elsewhere unpins.

1.2 Debuggable surfaces (must be exhaustive)

Probe works on:
	•	Bus channel row (BusBoard)
	•	Publisher row
	•	Listener row
	•	Port badge on a block (input/output)
	•	Lens chip (on binding or port)
	•	Adapter badge (when present)
	•	Output preview layer (optional later, not required for core)

Each surface is tagged with a ProbeTarget:

type ProbeTarget =
  | { kind: 'bus'; busId: string }
  | { kind: 'publisher'; publisherId: string }
  | { kind: 'listener'; listenerId: string }
  | { kind: 'port'; portKey: string }
  | { kind: 'lens'; bindingId: string; lensIndex: number }
  | { kind: 'adapter'; bindingId: string; adapterIndex: number };


⸻

2) Probe Card layout (exact structure)

The Probe Card is a single standardized component that changes content by target kind. It has 4 stacked sections, always in the same order.

2.1 Section A: Header (identity)
	•	Title (large): e.g. energy / radius / phaseA
	•	Subtitle (small): type badge + role badge
	•	type badge: signal:number, signal:phase, signal:color
	•	role badge: Clock / Mixer / Silent / Conflicting etc
	•	Right side: Pin icon + Jump (navigates to BusBoard row / block inspector)

2.2 Section B: “Now” (live value visualization)

Shows a compact visualization that is type-specific:
	•	number: horizontal meter + numeric readout
	•	phase: circular phase ring + wrap tick if pulse recently fired
	•	color: swatch + optional palette strip if palette domain
	•	trigger: pulse lamp + recent pulses mini-strip
	•	vec2: tiny XY dot plot + numeric (x,y)

All driven from latest DebugSnapshot. No live recompute.

2.3 Section C: “Where it comes from” (trace summary)

This is the core: a human-readable chain.

It is rendered as chips in a horizontal chain:

SOURCE → (Adapter) → (Lens) → (Combine) → RESULT

Rules:
	•	Always include start and end chips.
	•	Collapse stacks into single chips with count:
	•	Lens Stack (3) expands on hover
	•	Adapters (2) expands on hover
	•	Each chip is hoverable; hovering shows a mini-tooltip with:
	•	name + short description
	•	input/output type
	•	“Bypass” toggle (for that stage)

The chain comes from DebugGraph.pipelines[bindingId] or from a constructed mini-trace:
	•	For a bus: “Publishers → Combine”
	•	For a port: “Bus → Listener chain → Port”

2.4 Section D: “Fixes” (guided actions)

This is what makes it non-technical.
	•	Up to 3 “Fix” buttons appear if diagnostics apply.
	•	Each fix has:
	•	label: “Add smoothing”, “Enable publisher”, “Change combine mode to Sum”
	•	one-line why: “Value is jumping sharply”
	•	Fixes are derived from a rules engine using:
	•	DebugGraph structure
	•	latest snapshot values + short time window stats (flatline, clipping, NaN)

Important: Fix buttons execute undoable transactions (your op system).

⸻

3) Port Probe behavior (most important)

When hovering a port:
	•	Card title: DotsRenderer.radius
	•	“Now” shows the post-transform value at the port (TRACE snapshot: bindingNow[listenerId])
	•	Trace summary shows:
	•	Bus name chip (e.g. phaseA)
	•	Listener chain chips (adapters + lenses)
	•	Port chip

3.1 Multi-listener case

If multiple listeners target the same input is possible (or ever becomes possible):
	•	show a warning badge: “Multiple feeds”
	•	list each feed as a row with:
	•	enable toggle
	•	mini-meter
	•	“solo” button (temporarily disables others via transaction, with auto-revert on exit probe)

(If your invariant is “one listener per port,” then the UI stays simpler: show exactly one.)

⸻

4) “Trace View” (expanded, still non-technical)

When user clicks “Expand Trace” in the Probe Card, it opens a larger panel (still within probe or diagnostics drawer).

4.1 Trace View layout

A left-to-right pipeline with columns:

Column 1: Sources
	•	For bus: publishers list with mini-meters
	•	For port: bus + active publisher list (since bus value derived)

Column 2: Combine
	•	combine mode selector (dropdown) shown in plain language:
	•	“Add together (Sum)”
	•	“Take strongest (Max)”
	•	“Last one wins (Last)”
	•	“Layer colors (Layer)”
	•	“Ordering” visible if combine depends on it:
	•	publisher order list with drag handles (sortKey)
	•	if user drags, underlying store updates sortKey

Column 3: Transform
	•	Adapter chain shown first (usually small and hidden)
	•	Lens stack shown as reorderable list:
	•	each lens row: enabled toggle, name, mini-graph icon
	•	click row to open lens editor

Column 4: Destination
	•	Port target info
	•	value “Now”
	•	“Range” readout (min/max of last 10s) if available

4.2 Lens editor (non-technical)

Lens editor shows:
	•	a simple “input→output” curve preview (for maprange, ease, softclip)
	•	1–3 knobs with Default Sources behind the scenes (details later)
	•	presets: “Subtle”, “Strong”, “Bouncy”, etc.

No raw math shown by default.

⸻

5) Diagnostics list (Overview tab behavior)

The Diagnostics drawer Overview tab is the global version of Probe fixes.

5.1 Diagnostic item format
	•	Icon + severity: info/warn/error
	•	Title: “Bus energy is silent”
	•	Context chips: [energy] [RenderInstances2D.radius]
	•	Suggested fix button
	•	“Show why” expands to show the reasoning in 2–3 bullets

5.2 Diagnostic generation rules (must be deterministic)

Diagnostics are produced from:
	•	DebugGraph (structure)
	•	snapshot (values)
	•	short history window statistics (flatline, clipping, pulse rate)

They must be stable across runs given same patch + seed.

⸻

6) Fix Actions: the required contract

Every fix is an object the UI can execute without “knowing” how to mutate state.

interface FixAction {
  id: string;
  label: string;
  why: string;
  apply: () => Transaction; // returns undoable transaction
}

6.1 Canonical fix actions you must support (core set)

Wiring / enablement
	•	Enable publisher/listener
	•	Create publisher from selected compatible output to a bus
	•	Bind port to a bus (create listener)
	•	Set bus silent value (edit defaultValue)

Stability / shaping
	•	Add Slew lens to a binding
	•	Add Softclip lens to a binding
	•	Add MapRange lens to a binding
	•	Replace combine mode (last → sum, sum → max, etc.)

Determinism / conflicts
	•	Reorder publishers (adjust sortKey)
	•	Disable conflicting publisher

Health
	•	Replace NaN-producing lens with safe variant (or clamp)

Each fix must be a single atomic transaction, and must be reversible.

⸻

7) Minimal UI components list for implementation

To implement the non-technical debugger, you need exactly:
	1.	ProbeToggleButton
	2.	ProbeOverlay (handles hover detection + anchoring)
	3.	ProbeCard (the 4-section card)
	4.	TraceViewPanel (expanded pipeline)
	5.	DiagnosticsDrawer (Overview + Buses + Perf at minimum)
	6.	FixButton (executes transaction)
	7.	MiniViz primitives:
	•	Meter
	•	Sparkline
	•	PhaseRing
	•	Swatch
	•	PulseStrip
	•	XYDot

Everything else is optional.

⸻

8) Data requirements from the backend (what your DebugTap must provide)

For this UI to work, you must guarantee the following are always available:
	•	DebugGraph.byPort[portKey]
	•	DebugGraph.buses[busId].publisherIds/listenerIds
	•	DebugGraph.pipelines[bindingId] for publisher + listener
	•	DebugSnapshot.busNow[busId] at BASIC
	•	DebugSnapshot.bindingNow[bindingId] at TRACE (at least for listeners)
	•	perf counters at PERF

If any is missing, the UI must degrade gracefully:
	•	show “Value unavailable (trace off)” badge
	•	offer “Enable Trace” toggle


