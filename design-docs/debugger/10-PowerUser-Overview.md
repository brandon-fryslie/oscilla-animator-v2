Technical Power-User Debug Spec: Trace Engine, Deterministic Causality, and Deep Inspection

This spec is for the person who needs to know exactly what the system is doing: evaluation order, bus combine, lens/adapters, lazy Field materialization, and what changed after an edit. It must be precise, queryable, and mechanically truthful.

⸻

0) Core principles (power-user mode)
	1.	Everything is inspectable as data: structure (DebugGraph), values (snapshots), and evaluation decisions (TraceEvents).
	2.	Two speeds:
	•	Snapshot mode (cheap, always safe)
	•	Trace mode (expensive, explicitly enabled per target and time window)
	3.	Deterministic truth: the debugger must expose the actual ordering keys and combine steps used.

⸻

1) Data model: DebugGraph + Snapshot + TraceEvents

1.1 DebugGraph (structure, compile-time)

Extend your existing DebugGraph with explicit pipeline nodes and indices so you can render it without reconstructing logic.

interface DebugGraph {
  patchId: string;
  patchRevision: number;

  // stable indices for fast arrays
  buses: DebugBusNode[];
  publishers: DebugPublisherNode[];
  listeners: DebugListenerNode[];
  ports: DebugPortNode[];
  blocks: DebugBlockNode[];

  busIndexById: Record<string, number>;
  publisherIndexById: Record<string, number>;
  listenerIndexById: Record<string, number>;
  portIndexByKey: Record<string, number>;
  blockIndexById: Record<string, number>;

  // pipelines
  publisherPipelines: DebugPipeline[]; // by publisher id
  listenerPipelines: DebugPipeline[];  // by listener id

  // determinism contracts surfaced explicitly
  determinism: {
    busCombineOrder: 'publisher.sortKey asc, tie by publisher.id';
    topoOrder: 'stable topological order, tie by block.id';
    timeModelSource: { blockId: string; kind: string };
  };
}

1.2 DebugSnapshot (cheap, periodic)

Keep snapshot cheap and indexed-array based:

interface DebugSnapshot {
  patchRevision: number;
  tMs: number;

  // indexed by bus index
  busNow: ValueSummary[];        // BASIC+
  busStats?: BusStats[];         // PERF+ (range, deltaMean, wraps)

  // indexed by binding index
  bindingNow?: ValueSummary[];   // TRACE only

  // evaluation/perf
  perf: {
    fpsEstimate: number;
    avgFrameMs: number;
    worstFrameMs: number;
    fieldMaterializations: number;
    topMaterializers: { blockId: string; count: number }[];
    topLenses: { lensId: string; count: number }[];
    topAdapters: { adapterId: string; count: number }[];
  };

  health: {
    nanCount: number;
    infCount: number;
    cycleDetected?: boolean; // if runtime detects runaway
  };
}

1.3 TraceEvents (expensive, explicit)

Trace mode emits a time-ordered log of actual operations performed during evaluation.

This is the core of power-user truth.

type TraceEvent =
  | { tMs: number; kind: 'BusEvalStart'; busId: string }
  | { tMs: number; kind: 'PublisherEval'; publisherId: string; value: ValueSummary }
  | { tMs: number; kind: 'AdapterApplied'; bindingId: string; adapterId: string; before: ValueSummary; after: ValueSummary }
  | { tMs: number; kind: 'LensApplied'; bindingId: string; lensId: string; before: ValueSummary; after: ValueSummary }
  | { tMs: number; kind: 'CombineStep'; busId: string; mode: string; acc: ValueSummary; next: ValueSummary; out: ValueSummary }
  | { tMs: number; kind: 'BusEvalEnd'; busId: string; value: ValueSummary }
  | { tMs: number; kind: 'ListenerDeliver'; listenerId: string; value: ValueSummary; portKey: string }
  | { tMs: number; kind: 'FieldMaterialize'; who: { blockId: string; outputPort?: string }; size: number; reason: string }
  | { tMs: number; kind: 'BlockEval'; blockId: string; outputs: { port: string; value: ValueSummary }[] }
  | { tMs: number; kind: 'Error'; code: string; message: string; where?: any };

Important constraints
	•	Trace is scoped (see §2): you do not record everything by default.
	•	Trace events must be bounded (ring buffer) to prevent memory blowups.

⸻

2) Trace mode controls (how it’s enabled)

Power users choose:
	•	what to trace
	•	how long
	•	at what sampling rate

2.1 Trace session config

interface TraceConfig {
  enabled: boolean;

  // Scope: record only events relevant to these targets
  targets: ProbeTarget[];  // bus / binding / port / block

  // Window control
  durationMs: number;      // e.g. 2000ms
  maxEvents: number;       // e.g. 50_000

  // Detail level
  includeCombineSteps: boolean;
  includeBeforeAfter: boolean; // heavy; off by default
  includeFieldMaterialize: boolean;
}

2.2 How scoping works (required algorithm)

When Trace is enabled, the evaluator checks event relevance:
	•	A bus event is relevant if:
	•	busId is targeted OR any targeted listener depends on it OR any targeted port reads it.
	•	A binding event is relevant if bindingId targeted OR binding is in the dependency chain of targeted port.
	•	A field materialization is relevant if it occurred in a targeted block OR is downstream of targeted bus/port.

You must compute dependency closure from DebugGraph once when starting trace.

⸻

3) UI: Technical Debug Panel (layout)

This is a dedicated panel (drawer or full screen). It has 5 tabs:
	1.	Graph
	2.	Buses
	3.	Bindings
	4.	Trace
	5.	Diff

No compromises: this is where truth lives.

⸻

3.1 Graph tab (structural truth)

What it shows
	•	A schematic graph view (not user layout) built from DebugGraph:
	•	Blocks (nodes)
	•	Buses (nodes)
	•	Edges: publisher → bus → listener → block input
	•	Wires (if still exist): block out → block in
	•	Topological order list (actual stable sort result)
	•	SCC/cycle report if any

Interactions
	•	Click any node to set it as trace target
	•	Hover shows:
	•	type info
	•	deterministic ordering keys (sortKey, id tie-break)
	•	compile-time pipeline steps

⸻

3.2 Buses tab (per-bus deep inspection)

Bus inspector fields (must include)
	•	id, name
	•	TypeDesc full: world/domain/category/semantics/unit
	•	combineMode
	•	silent default (rendered + raw JSON)
	•	publisher list sorted by actual order:
	•	enabled toggle
	•	sortKey
	•	adapter chain + lens stack
	•	last computed value + stats

Per-bus “Explain evaluation” button
	•	Starts a trace session targeted to this bus for 2 seconds
	•	Opens Trace tab filtered to that bus

⸻

3.3 Bindings tab (lens/adapters truth)

Bindings are first-class here (publishers and listeners).

Each binding row shows:
	•	binding id
	•	source→dest (publisher: block.port → bus, listener: bus → block.port)
	•	full chain:
	•	adapterChain (explicit)
	•	lensStack (explicit)
	•	effective type path:
	•	before type
	•	after each adapter
	•	after each lens
	•	final type at port

This is how a power user checks “why is this a vec2 now?”

⸻

3.4 Trace tab (the timeline of operations)

Layout
	•	Left: event filter controls:
	•	targets
	•	event kinds toggles
	•	time range slider
	•	Main: scrollable event list, grouped:
	•	BusEvalStart → CombineSteps → BusEvalEnd blocks
	•	nested PublisherEval sequences within bus

Key features
	•	Expand/collapse each bus eval
	•	Pin a “value ladder” view:
	•	shows before/after values for each adapter/lens step (if enabled)
	•	“Jump to graph” shortcuts

Performance overlay in trace
	•	Show the time spent per group (approx):
	•	measured by timestamps around group boundaries
	•	Highlight slow events.

⸻

3.5 Diff tab (what changed after an edit)

This is essential for “no-jank live edits” trust.

Diff inputs

Two compile artifacts:
	•	previous DebugGraph + program
	•	current DebugGraph + program

Diff outputs (must be deterministic)
	•	Added/removed buses, publishers, listeners, blocks
	•	Changed sort orders (sortKey diffs)
	•	Changed type paths (adapter/lens changes)
	•	“Potential jank risk” classification (see below)

Jank risk classification
	•	SAFE: only numeric lens param changes, reorder not affecting last-writer, no time topology changes
	•	RISKY: combine mode changes, publisher ordering changes, time model changes
	•	BREAKING: type world change, missing required bus, illegal cycles

Diff tab must show:
	•	“This change may cause a visible jump because: ____”
	•	Suggested mitigations: e.g. add Slew on listener; crossfade state (if supported)

⸻

4) Required engine support for power-user debugger

4.1 Stable PortKey definition (must exist)

Ports need a stable key independent of UI slot IDs:
	•	portKey = ${blockId}:${direction}:${slotId}`` is acceptable if slotIds stable
	•	better: ${blockId}:${direction}:${slotLabel} if labels stable, but labels may change
	•	choose one and freeze it; debugger depends on it.

4.2 Unified type truth path

A technical debugger must show actual type transitions.
Therefore:
	•	adapters and lenses must declare:
	•	from: TypeDesc
	•	to: TypeDesc
	•	and a summarize method for before/after if they change structure

4.3 FieldExpr inspection hooks (critical)

Lazy Field debugging requires an “explain plan” without materializing.

Define:

interface FieldPlan {
  rootKind: 'const' | 'source' | 'map' | 'zip' | 'bus' | 'sample' | 'noise' | ...;
  estCost: { opsPerElement: number; allocations: number; };
  dependencies: { busIds: string[]; blockIds: string[] };
}

FieldExpr must provide:
	•	explain(): FieldPlan
	•	and optionally pretty(): string for display (not used by runtime)

This enables the debugger to show:
	•	“This field is being re-materialized because it depends on bus energy which changes every frame.”

4.4 Materialization reasons must be standardized

When materializing, provide a reason enum:
	•	RenderSinkNeedsArray
	•	FieldToSignalReduce
	•	ExportBake
	•	DebugProbeRequested
	•	CacheMiss

Power-user panel uses these to attribute cost correctly.

⸻

5) Performance tooling (technical)

Power-user needs actionable perf truth.

5.1 Per-frame evaluation counters

Already discussed, but must include:
	•	bus eval count
	•	publisher eval count
	•	listener deliver count
	•	materialization count + bytes allocated estimate

5.2 TopK tracking

Maintain top offenders by:
	•	blockId
	•	busId
	•	lensId
	•	adapterId

5.3 “Perf trace” mode

A special trace preset:
	•	targets = all heavy offenders
	•	include timings and materializations
	•	before/after values off (to reduce overhead)

⸻

6) Acceptance criteria for power-user mode

A power user must be able to answer, with certainty:
	1.	Why is this port value what it is?
	•	They can see the exact bus value, exact listener chain, and final delivered value.
	2.	What is the deterministic ordering?
	•	They can see publisher order and tie-break rules.
	3.	Why did this change after I edited something?
	•	Diff tab shows what structurally changed and whether it’s jank-risky.
	4.	Where is time being defined?
	•	DebugGraph determinism block points to the TimeRoot source and derived buses.
	5.	Why is it slow?
	•	Perf shows top materializers and the reason codes.

⸻

7) Implementation sequence (technical debug)
	1.	DebugGraph completeness (pipelines + indices + determinism contracts)
	2.	Snapshot indexing + ring buffers
	3.	TraceEvents ring buffer + scoping closure
	4.	Buses + Bindings tabs (truth tables)
	5.	Trace tab
	6.	Diff tab
	7.	FieldPlan explain + materialization reason codes

⸻

If you want to keep going: say what parts of this you already have (e.g., health snapshots exist), and I’ll map this spec onto your current files by naming exactly which modules become responsible for which pieces and where the tap points go—without inventing extra subsystems.