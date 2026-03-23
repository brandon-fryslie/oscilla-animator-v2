Debug Mini-View Spec

0) Purpose and hard constraints
   •	The mini-view is hover-scoped: it explains exactly the hovered port or edge value at the current frame, with a tiny amount of recent history.
   •	It is non-interactive: no clicking, no selection changes, no navigation.
   •	It must be fast: O(1) to render for signals; O(N) scans are allowed only if they are already computed/cached for the full debug system (otherwise use sampled estimates).

⸻

1) Placement and sizing
   •	Fixed max width/height (e.g. 360×220). Never grows with lane count beyond a reasonable max height
   •	Content must degrade gracefully (truncate long IDs, elide sections) rather than resize.

⸻

2) Shared structure (every hover target)

2.1 Header (single line)
•	Label: "<fromNode>.<fromPort> → <toNode>.<toPort>" for edges, "<node>.<port>" for ports.
•	Target kind badge: Edge or Port.
•	Frame badge: f=<frameIndex> or t=<tMs> (pick one; prefer frame index for deterministic debugging).

2.2 Type line (single line, always present)

Show the fully resolved type in compact canonical form:
•	payload/unit · cardinality · temporality
•	Examples:
•	float:phase01 · one · cont
•	float:scalar · many(I=inst-12) · cont
•	unit:none · one · disc (events)
•	shape:none · one · cont

If an adapter is active on that connection, append:
•	+ adapter: <Kind> (or + adapters: <KindA>,<KindB> if you allow the two-end case)

2.3 Provenance (one line)
•	Source: <producer> where producer is one of:
•	Block output
•	Intrinsic(<name>)
•	Const
•	StateRead(<stateId>)
•	Adapter(<kind>) (if hovering the adapted edge, this is useful)

2.4 Storage / runtime reference (one line)
•	If available: Slot: <valueSlot> for signals/fields, StateSlot: <id> for state, EventId: <id> for events.
•	If not available at hover time, omit entirely (don’t show “unknown”).

⸻

3) Value section (varies by temporality and cardinality)

3.1 Signals (one + continuous)

Display:
1.	Current value (biggest text)
•	value = … formatted by payload/unit:
•	float: fixed precision + compact scientific when needed
•	phase: show [0..1) with wrap indicator (e.g. 0.83 ↺)
•	int: integer formatting
2.	Micro-history (tiny strip, last N frames)
•	For numeric: sparkline (autoscale, but show scale markers min/max)
•	For phase: wrap-aware sparkline (no big jump at 1→0)
•	For bool: bit-strip
3.	Guards summary (single line, only if non-zero)
•	NaN: <count>  Inf: <count>  OOR: <count>
(“OOR” means out-of-range relative to unit contract, e.g. norm01 outside [0,1].)

3.2 Fields (many(instance) + continuous)

The mini-view must never imply the user can pick lanes here. It shows:
1.	Instance summary
•	Instance: <instanceId>  N=<count>
•	Identity: stable|none (if known)
2.	Aggregate stats (2 lines max)
•	Numeric payloads:
•	min / max / mean (like your screenshot)
•	If you have std cheaply: include σ
•	vec2/vec3:
•	show min/max per component only if already cached; otherwise show mean vector and bbox scalar (diagonal length)
•	color:
•	show average swatch + channel min/max only if cached
3.	Micro-distribution
•	Numeric: tiny histogram (e.g. 16 bins) OR a min→max bar with mean tick if histogram not available
•	If you do not have full stats cached: compute from a deterministic sample:
•	sample size fixed (e.g. 256 lanes)
•	sample selection stable:
•	if stable elementId exists: include lanes where hash(elementId) mod K == 0
•	else stratified by index
•	label the line: Stats: sampled(256) so it’s not confused with exact
4.	Selected lane echo (optional, but deterministic)
•	If there is an existing global selection {instanceId, lane} from the main debug panel and it matches this instance, show:
•	selected[k]=… using the signal renderer formatting
•	If no selection exists, omit (do not invent one).

3.3 Events (discrete)

Display:
1.	Fired this frame: yes/no
2.	Recent activity (micro-timeline, last N frames)
•	tick marks where fired
3.	Rate (optional if cached): rate: X/s
4.	If per-lane events ever exist: show N lanes, fired lanes: <count> plus a tiny raster sample (deterministic sample only).

3.4 Shape payload (shape:none)

Display:
1.	Topology: topologyId
2.	Param snapshot (compact list)
•	show up to 4 params: p0=…, p1=… (with unit formatting if units exist for params)
3.	Thumbnail preview
•	render in local space in a tiny square (no instance placement here)
4.	If path topology: show controlPoints: <count> and a tiny outline preview.

3.5 State (if you allow hovering state reads/writes)

If the hover target is a state read/write edge:
•	StateId: <id> + per-lane|scalar
•	show current state value(s) using the same signal/field formatting
•	show last migration status if cached: migrate: copied|reset|transformed

⸻

4) Unit and contract display rules
   •	Only show unit-specific contract details when they matter:
   •	phase01: wrap semantics indicator
   •	norm01: clamp range indicator
   •	ms: time formatting
   •	Do not show a generic “range” line for scalar unless it violated guards.
   •	For adapters:
   •	always display the adapter kind(s)
   •	optionally show “before → after” type in one line:
   •	float:phase01 → float:scalar (or whatever your adapter table says)

⸻

5) Content priority order (for truncation)

If space is limited, drop in this order:
1.	Micro-distribution / histogram
2.	Micro-history
3.	Provenance
4.	Slot line
Never drop:

	•	Header label
	•	Type line
	•	Current value or aggregate stats

⸻

6) Performance requirements
   •	Mini-view must not trigger full materialization or full-field scans.
   •	It may read:
   •	current slot values
   •	cached stats/histograms computed elsewhere
   •	deterministic small samples (fixed upper bound)
   •	It must not allocate large arrays; any sampling uses existing buffers and constant-time indexing.

⸻

7) Examples mapped to your current float field view

For Field<float:scalar>(instance=I, N=5000) hovering an edge:
•	Header: b4.offset → b5.b
•	Type: float:scalar · many(I=…) · cont
•	Instance: I=…  N=5000  Identity=stable|none
•	Stats: min/max/mean (±σ if cached)
•	Distribution: tiny histogram or min→max bar with mean tick
•	Slot: slot=20 (if available)

That statement.