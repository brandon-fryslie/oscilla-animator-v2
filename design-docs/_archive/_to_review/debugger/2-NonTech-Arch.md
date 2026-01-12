I can define the exact data you should record per frame (and at what sampling rate) to support Probe Mode, Trace view, and the Performance tab without blowing up memory or CPU.

Below is the “core you must get right” to make the non-technical debug workflow actually work (Probe → Trace → Fix) without turning the runtime into molasses. I’m going to be very explicit about data structures, boundaries, sampling, and the minimum set of instrumentation hooks.

⸻

0) Non-negotiable design constraints
	1.	Debug capture must be bounded (ring buffers, fixed-size maps, no unbounded arrays).
	2.	Debug capture must be opt-in by level (Off → Basic → Trace → Perf).
	3.	Debug data must be keyed by stable IDs (busId, publisherId, listenerId, blockId, portKey).
	4.	Debug capture must not force materialization of Fields or full RenderTree traversal.
	5.	Debug queries must be cheap and mostly answered from cached snapshots, not by recomputing pipelines.

Everything else is negotiable.

⸻

1) The debug architecture in one picture

Compile-time products (deterministic, cheap to query)

From the compiler you must output a DebugGraph alongside the Program:
	•	CompiledProgram (what you already have)
	•	TimeModel (you already have)
	•	DebugGraph (new): a static graph of “how things are wired/bound”

Runtime products (sampled, bounded)

From the runtime you must emit DebugSnapshot periodically (e.g. 15 Hz), containing:
	•	bus values (lightweight)
	•	binding stage summaries (optional per debug level)
	•	performance counters (cheap)
	•	a few “health” stats (NaN/Inf counts)

UI uses both
	•	Probe/Trace uses DebugGraph to explain structure
	•	Values use DebugSnapshot to show what’s happening “now”
	•	Fix suggestions use DebugGraph + a small heuristic engine + current snapshot

⸻

2) Compile-time: DebugGraph spec (this is the backbone)

You already have buses/publishers/listeners and a compiler that resolves adapter chains and lens stacks. The debug system must reuse that resolution once at compile time, and then treat it as immutable until next compile.

2.1 Canonical identifiers

Define these string keys (avoid object keys):
	•	PortKey = "${blockId}:${slotId}" (unique port)
	•	BindingKey = publisherId | listenerId
	•	BusKey = busId

Also define:
	•	StageKey = "${bindingId}:stage:${i}" for each stage in a pipeline

These keys are what the runtime snapshots will reference.

2.2 DebugGraph data model

Minimum viable DebugGraph:

interface DebugGraph {
  patchRevision: number;

  // What exists
  buses: Record<BusId, DebugBusNode>;
  publishers: Record<PublisherId, DebugPublisherNode>;
  listeners: Record<ListenerId, DebugListenerNode>;

  // Fast reverse lookups for Probe mode
  byPort: Record<PortKey, {
    incomingListeners: ListenerId[]; // who feeds this input via bus
    outgoingPublishers: PublisherId[]; // who publishes this output to buses
    wiredIncoming?: ConnectionId[]; // if you still support wires
    wiredOutgoing?: ConnectionId[];
  }>;

  // Optional, but makes the UI instant:
  // “explain this binding” without recomputing chain every hover
  pipelines: Record<BindingKey, DebugPipeline>;
}

Where:

interface DebugBusNode {
  id: BusId;
  name: string;
  type: TypeDesc;
  combineMode: BusCombineMode;
  defaultValueSummary: ValueSummary; // formatted, not raw
  publisherIds: PublisherId[]; // already sorted by sortKey
  listenerIds: ListenerId[];
  reservedRole?: 'phaseA'|'pulse'|'energy'|'palette'|...;
}

interface DebugPublisherNode {
  id: PublisherId;
  busId: BusId;
  from: BindingEndpoint; // {blockId, port}
  fromPortKey: PortKey;
  enabled: boolean;
  adapterChain: AdapterStep[]; // resolved chain
  lensStack: LensInstance[];   // if you allow publisher lenses
  sortKey: number;
}

interface DebugListenerNode {
  id: ListenerId;
  busId: BusId;
  to: BindingEndpoint;
  toPortKey: PortKey;
  enabled: boolean;
  adapterChain: AdapterStep[];
  lensStack: LensInstance[];
}

And the pipeline (precomputed):

interface DebugPipeline {
  bindingId: BindingKey;
  kind: 'publisher'|'listener'|'wire'|'lensParam';
  fromType: TypeDesc;
  toType: TypeDesc;
  stages: DebugStage[]; // in evaluation order
}

type DebugStage =
  | { kind: 'source'; label: string; type: TypeDesc; ref: { busId?; portKey? } }
  | { kind: 'adapter'; adapterId: string; from: TypeDesc; to: TypeDesc; policy: AdapterPolicy }
  | { kind: 'lens'; lensId: string; type: TypeDesc; params: Record<string, DebugParamBindingSummary> }
  | { kind: 'combine'; busId: string; combineMode: BusCombineMode; type: TypeDesc };

Why this matters: Probe mode becomes pure UI over DebugGraph + latest snapshots. No “walk compiler structures” in React. No recompute per hover.

⸻

3) Runtime: DebugSnapshot spec (bounded + cheap)

This is the second backbone: what you sample over time.

3.1 Debug levels
	•	OFF: nothing
	•	BASIC: bus values + health
	•	TRACE: BASIC + per-binding final values (after adapters/lenses)
	•	PERF: BASIC + counters for materializations / adapter invocations / lens invocations
	•	FULL: TRACE + PERF + optional per-stage values (dangerous; keep off by default)

You can represent it as bitflags.

3.2 Value representation: don’t serialize raw objects

You need a uniform “value summary” format that:
	•	does not allocate a ton
	•	can be rendered without type branching everywhere
	•	avoids storing huge arrays

Use a tagged union of small payloads:

type ValueSummary =
  | { t: 'num'; v: number }
  | { t: 'vec2'; x: number; y: number }
  | { t: 'color'; rgba: number } // packed int
  | { t: 'phase'; v: number }    // 0..1
  | { t: 'bool'; v: 0|1 }
  | { t: 'trigger'; v: 0|1 }     // “fired this sample”
  | { t: 'none' }                // no data / not sampled
  | { t: 'err'; code: string };  // nan, inf, type mismatch, etc.

Never put Field contents in snapshots. Ever. If you need field debugging later, you do sampled probes (see §7).

3.3 Snapshot contents

Minimum DebugSnapshot:

interface DebugSnapshot {
  patchRevision: number;
  tMs: number;

  // Bus current value (summarized)
  busNow: Record<BusId, ValueSummary>;

  // Optional: final binding values
  bindingNow?: Record<BindingKey, ValueSummary>;

  // Health
  health: {
    nanCount: number;
    infCount: number;
    cycleDetected?: boolean; // runtime guard, not compiler
    silentBuses: BusId[];    // bounded list (top N)
  };

  // Perf counters (bounded)
  perf?: {
    fpsEstimate: number;
    avgFrameMs: number;
    worstFrameMs: number;

    fieldMaterializations: number;
    topMaterializers: Array<{ blockId: string; count: number }>; // top N

    adapterCalls: Array<{ adapterId: string; count: number }>;   // top N
    lensCalls: Array<{ lensId: string; count: number }>;         // top N
  };
}

Bounded lists

Every “top N” list must be capped (e.g., N=8) and computed with a cheap “heavy hitters” scheme (see below).

3.4 Ring buffers

You need time history for sparklines without storing too much.

For each bus you want history for, store a ring buffer of ValueSummary at a fixed sample rate (e.g. 15 Hz) for a fixed window (e.g. 10 seconds).

A memory-safe approach:
	•	allocate arrays by bus count at compile time
	•	store numeric channels in typed arrays when possible

Example:
	•	For num/phase buses: store Float32Array[busCount * sampleCount]
	•	For color: store Uint32Array[...]
	•	For vec2: store two float arrays

You can maintain a busIndexById map from DebugGraph.

This is critical: per-frame JS object churn will kill you.

⸻

4) Where to instrument in your runtime (the “hooks”)

You already have Player.renderOnce() calling program.signal(t, ctx). Debugging can’t just wrap everything in proxies; you need explicit taps in the compiler/runtime.

4.1 Bus evaluation is the best choke point

Because you have a bus-aware compiler, there will be a point where each bus is computed from its publishers (and their adapter/lens stacks).

At that point, you can record:
	•	bus final value (ValueSummary)
	•	(optional) each publisher contribution (ValueSummary) if TRACE is enabled

This is the single most valuable instrumentation point because:
	•	it lets you debug without caring what blocks do internally
	•	it matches your UX: “buses are the instrument channels”

4.2 Binding pipeline taps

For TRACE mode, record binding “final value at the port”:
	•	for listeners: after adapters+lenses
	•	for publishers: after adapters+lenses, before combine

Store into bindingNow[bindingId].

Do not record per-stage values unless FULL.

4.3 Materialization taps (Field)

Since you’re going lazy Fields, the most important performance/behavior visibility is:
	•	when a lazy field becomes materialized
	•	who triggered it (which render sink / which consumer block)

So in the Field materialization function (where it allocates and fills):
	•	increment fieldMaterializations
	•	increment per-block counter for the block that requested materialization

You already have RuntimeHealthSnapshot with fieldMaterializations: 0 placeholder—this becomes real.

⸻

5) Heavy-hitter counters (no huge maps)

If you do Map<string,number> increments every frame for adapters/lenses/materializers, you will allocate and slow down.

Use a bounded heavy-hitters structure:
	•	FixedTopKCounter<K> per category
	•	operations: hit(key) updates a small array
	•	if key exists, increment; else if room, insert; else decrement the minimum (“space-saving” algorithm)

This keeps your perf snapshot bounded and stable.

⸻

6) Debug query API (what UI calls)

The UI should never “dig through stores” ad-hoc. Give it a DebugService that owns:
	•	latest DebugGraph
	•	rolling snapshots / ring buffers
	•	helpers for “probe this thing”

Core methods:

interface DebugService {
  setDebugGraph(g: DebugGraph): void;             // called after compile
  pushSnapshot(s: DebugSnapshot): void;           // called from runtime
  setLevel(level: DebugLevel): void;

  // Probe
  probePort(portKey: PortKey): ProbeResult;
  probeBus(busId: BusId): BusProbeResult;
  probeBinding(bindingId: BindingKey): BindingProbeResult;

  // Timeseries
  getBusSeries(busId: BusId, windowMs: number): Series;
}

Probe results are preformatted for UI:
	•	include chain stages (from DebugGraph)
	•	include current values (from latest snapshot)
	•	include “likely issues” and “fix actions” (next section)

⸻

7) The “basic workflow” features you must support

This is what makes the debugger feel like magic to non-technical users:

7.1 “Where does this come from?” (Trace)

Implementation: probePort() uses DebugGraph.byPort[portKey].incomingListeners and returns a list of:
	•	bus name
	•	listener chain summary
	•	current value
	•	toggles (enable/disable listener, bypass lens, reorder publisher)

No graph search needed; it’s indexed.

7.2 “Why is it not doing anything?” (Rules engine)

A tiny deterministic rules engine runs on probe:

Example heuristics for bus probe:
	•	if bus has 0 enabled publishers → issue BusSilent
	•	if bus combine mode is last and >1 publisher enabled → issue LastConflict
	•	if bus value is constant over N samples → issue Flatline
	•	if bus has NaN → issue NaNPropagation

Each issue maps to:
	•	a message
	•	a severity
	•	a fix action (store op / transaction)

Fix actions must be implemented as your undoable ops.

7.3 “Show me it over time” (Sparkline)

This is just ring buffer series retrieval. The key is:
	•	series must exist without allocating
	•	UI must decimate if needed

7.4 “Make it stop flickering / stop clipping” (One-click lens insertion)

When a rule triggers, the fix action may:
	•	add a lens to the listener’s lens stack (e.g., Slew, Softclip)
	•	set its default source value to something sane
	•	optionally show a toast: “Added smoothing to radius”

This is where your “lens params are default sources” work pays off.

⸻

8) Field debugging without materializing fields

You eventually want “why are these dots weird per element?” but you cannot dump arrays.

Do it with a Field Probe Sampler:
	•	user picks a render sink (instances)
	•	chooses “sample 16 elements”
	•	runtime computes field values only for those element ids (requires your lazy field to support “sample by id” or “evaluate subset”)
	•	display as small table/mini-histogram

This is optional for first workflow; the must-have is materialization counters + domain size display.

⸻

9) How to avoid debug becoming a performance problem

The three big traps and the fixes:
	1.	Object churn
Fix: typed arrays + ring buffers + fixed-top-k counters.
	2.	Excessive sampling frequency
Fix: sample debug snapshots at 10–15 Hz, not 60. The player can still render at 60.
	3.	Deep stage tracing
Fix: keep FULL mode off by default. BASIC + TRACE are enough for most users.

⸻

10) The minimum “done” checklist for basic workflow

If you build only these pieces, you already get a usable non-technical debugger:

Compile-time
	•	DebugGraph with:
	•	byPort index
	•	pipelines for publishers/listeners
	•	bus publisher/listener lists (sorted)

Runtime
	•	DebugSnapshot at 10–15 Hz with:
	•	busNow values (ValueSummary)
	•	perf counters: fps + fieldMaterializations + topMaterializers
	•	health: nan/inf + silent bus list

UI
	•	Probe mode:
	•	hover bus → shows live meter + sparkline + publishers
	•	hover port → shows incoming listener(s) chain + current value
	•	Diagnostics drawer:
	•	Overview list of issues with “Fix” buttons

Everything else (render tree overlays, element sampling tables, change history diffing) can be layered later, but the above enables the basic workflow: inspect → understand → fix.
