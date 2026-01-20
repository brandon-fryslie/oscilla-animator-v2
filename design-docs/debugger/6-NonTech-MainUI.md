Non-technical Debug Spec: Always-on Affordances in the Main UI

I’ll cap off the non-technical debug UI with the final missing piece: the “Debug affordances in the main UI” spec (what small badges, chips, highlights you add to BusBoard/Inspector so users don’t need to enter Probe mode just to know what’s alive, silent, conflicting, or heavy).

Probe mode is for investigation. Non-technical users still need the UI to telegraph health continuously—without opening any debug panel. This spec defines the minimal, always-visible signals (badges, meters, highlights) that make the system feel “self-explanatory.”

⸻

1) Global Debug “Health Bar” (top of preview)

1.1 Placement
	•	Above the preview canvas, replace the current basic player bar with a compact strip:
	•	Status Light (dot)
	•	FPS / Frame cost micro readout (optional but recommended)
	•	Issues pill (count of errors/warnings)

1.2 Behavior
	•	Status Light:
	•	Green: no errors, warnings <= 2
	•	Yellow: warnings > 2 OR performance warning active
	•	Red: any error
	•	Clicking Issues pill opens Diagnostics drawer (Overview tab), filtered to active issues.

1.3 Data source
	•	severity computed from the same diagnostics rules engine.
	•	frame timing from Player health snapshot.

⸻

2) BusBoard: channel strips as living meters + state badges

This is where non-technical users live. It must “feel like a mixer.”

2.1 Each bus row shows 6 elements (left to right)
	1.	Name + type badge
	2.	Live meter (type-specific)
	3.	Publisher count and “hot” indicator
	4.	Listener count
	5.	Combine mode chip
	6.	State badge cluster (icons)

2.2 Live meter spec (type-specific)
	•	signal:number: thin sparkline + current value
	•	signal:phase: ring + wrap tick
	•	signal:color: swatch that updates; if “palette,” show 3–5 swatches (sampled)
	•	trigger: pulse lamp + last pulse time (“0.4s ago”)
	•	vec2: tiny XY scope (dot in a square)

Update rate: 10–15 Hz (snapshot rate), not 60fps.

2.3 Bus row states (badges)

Badges are small icons that appear at right edge of row:
	•	Silent (moon icon): 0 enabled publishers → bus is using silent default
	•	Conflict (⚠︎): combineMode=last and enabled publishers > 1
	•	Clipping (⌁): detected out-of-range / clamp suggested
	•	Jittery (≈): sharp motion detected → slew suggested
	•	Heavy (🐘): bus evaluation or its downstream chain caused high materialization / cost

Hovering a badge shows a 1-line tooltip and a “Fix” button inline:
	•	“Bus is silent — set silent value / add publisher”

This lets users fix common issues without entering diagnostics.

⸻

3) Binding chips on ports: “what feeds this?” without wires

You are explicitly avoiding edges, so the port itself must show its source clearly.

3.1 Input port renders with a small binding chip

Inside the block UI, every input row shows:
	•	input label
	•	small chip showing source:
	•	phaseA (bus)
	•	Default Source (if default source is attached)
	•	— (should not exist if you enforce default sources)

Chip is color-coded by bus type/domain.

3.2 Chip interactions
	•	Click chip: opens quick menu:
	•	Change bus…
	•	Add lens…
	•	Bypass lenses (toggle)
	•	Mute binding (toggle)
	•	Hover chip: shows mini “Now” value preview (tiny meter/swatch)

3.3 Output ports show publisher chip if published

If an output publishes to a bus:
	•	show a small → energy chip
	•	click opens publisher settings (enable, sortKey reorder, lens/adapters)

⸻

4) Block “activity halo” (alive / dead / heavy)

Each block has a subtle state visualization so users can scan the patch without wiring.

4.1 Activity states
	•	Alive: block is participating in output graph this frame (reachable from Render output)
	•	Idle: block exists but has no effect (not contributing)
	•	Heavy: block caused materialization or costly operations recently

4.2 Visual treatment
	•	Alive: faint glow around block border
	•	Idle: lowered contrast, small “idle” dot
	•	Heavy: small “hot” badge (🐘) + optional red tick on border

4.3 Determining reachability

Compiler emits reachability:
	•	mark blocks reachable from output + buses they influence
Runtime can also detect: “value requested this frame” per block output.

⸻

5) “Focus Mode” (the critical way to view a complex patch)

This replaces the need for seeing the entire graph at once.

5.1 Trigger
	•	clicking a bus row’s “listeners count”
	•	clicking a port binding chip
	•	clicking a diagnostic item’s “show in context”

5.2 Behavior

The UI enters a temporary focus mode:
	•	dims everything except:
	•	the selected bus
	•	its publishers
	•	its listeners + their blocks
	•	shows a lightweight overlay:
	•	“Publishers → Bus → Listeners”
	•	each item as a clickable pill (no wires)

Exit with Esc or clicking outside.

This gives users a mental model of flow without requiring edges.

⸻

6) Inline “Fix” affordances (small, predictable)

Do not centralize all fixes in one panel. Put them where the user already is.

6.1 Where Fix buttons appear
	•	Bus row badges tooltip
	•	Port binding chip menu
	•	Diagnostics drawer item

6.2 What fixes are allowed inline

Inline fixes must be low-risk and reversible:
	•	enable/disable publisher/listener
	•	add Slew / Clamp lens
	•	change combine mode (with confirmation if it will radically change)
	•	reorder publishers (drag list)

Anything bigger routes to “Open Trace View.”

⸻

7) Default Source visibility rules

Default Sources must be visible as a concept but not as blocks.

7.1 UI representation
	•	The port chip shows: Default Source
	•	Clicking it opens:
	•	value control (knob/slider/text)
	•	range hint
	•	“Animate…” shortcut (suggest adding an oscillator publisher to a bus and binding it)

7.2 Debug behavior
	•	Flatline diagnostics should consider Default Source:
	•	If a motion-critical input is on Default Source and unchanged: suggest binding to phaseA/energy or adding modulator.

⸻

8) Diagnostics drawer minimal structure (non-technical)

Even if you later build a deep technical mode, the non-technical drawer must stay simple.

Tabs (only these 3):
	1.	Overview (actionable list with fix buttons)
	2.	Buses (list of buses with badges + meter)
	3.	Performance (only top 3 causes + simple suggestions)

No raw logs. No stack traces.

⸻

9) What this requires from the engine (hard requirements)

To implement these affordances, your runtime+compiler must supply:
	•	Snapshot rate 10–15 Hz containing:
	•	busNow summaries for all buses
	•	severity flags per bus (silent/conflict/clipping/jitter/heavy)
	•	Reachability / participation info per block
	•	Materialization counters and “top offenders”
	•	Per-port binding mapping (portKey → listenerId or Default Source id)

If any is missing, the UI can’t reliably show “alive vs idle vs heavy,” so treat these as required.

⸻

10) Acceptance test (non-technical)

A non-technical user should be able to:
	•	see immediately which buses are doing something (meters moving)
	•	see which ones are silent/conflicting/heavy (badges)
	•	understand what feeds any input (binding chip)
	•	fix the top 3 common failure modes without entering a special debug mode:
	1.	silent bus
	2.	conflicting last-writer
	3.	jittery value needing smoothing

If that holds, your debugging UX is “basic workflow complete.”

