NEXT PAYLOAD SCHEMA

Below is a minimal-but-complete diagnostic payload spec that you can standardize across compiler, runtime, editor validation, and export. It’s designed to be:
	•	stable + dedupable
	•	actionable
	•	UI-addressable
	•	safe for multi-client / server-authoritative
	•	not a string log
	•	not a hooks system

⸻

Diagnostic Payload Spec

0) Core principles (contract)
	1.	Diagnostics are stateful facts, not messages.
	2.	Every diagnostic must be target-addressable (point to “where”).
	3.	Every diagnostic must be dedupable (stable ID).
	4.	Every diagnostic must be actionable (at least “go to target”; ideally fixes).
	5.	Diagnostics never participate in control flow. They describe.

⸻

1) DiagnosticEvent (canonical record)

A diagnostic event is a record produced by some subsystem. The DiagnosticHub stores the current active set by ID.

Fields

A) Identity & lifecycle
	•	id: stable string (see §2)
	•	status: active | resolved | muted
	•	firstSeenAt: timestamp (ms)
	•	lastSeenAt: timestamp (ms)
	•	occurrences: integer (monotonic)

B) Severity & category
	•	severity: hint | info | warn | error | fatal
	•	domain: authoring | compile | runtime | export | perf
	•	code: canonical code enum (see §6)
	•	source: what produced it
	•	compiler
	•	runtime
	•	validator
	•	exporter
	•	system

C) Location (targets)
	•	primaryTarget: a TargetRef (see §3)
	•	relatedTargets[]: optional list of TargetRef
	•	span: optional “range” inside a composite/graph, for multi-node issues (cycles)

D) Human content
	•	title: short, UI-friendly (one line)
	•	summary: 1–2 lines, no walls of text
	•	details: optional structured sections (not markdown by default)
	•	key/value items
	•	bullet list
	•	small tables

E) Structured payload (machine readable)
	•	data: union keyed by code (see §7)
	•	expected vs actual types
	•	bus id, combine mode
	•	SCC members for cycles
	•	perf statistics
	•	export constraints, etc.

F) Actions
	•	actions[]: list of FixAction (see §4)
	•	quickFixId?: optional: one “primary” action recommended

G) Scope
	•	scope: where it applies
	•	patchRevision: integer
	•	compileId?: for compile-only
	•	runtimeSessionId?: for runtime-only
	•	exportTarget?: svg | video | server

⸻

2) Stable ID spec (dedupe rules)

The goal is: the same root cause produces the same id, so diagnostics update instead of duplicating.

ID is derived from:
	•	code
	•	primaryTarget identity
	•	a “signature” derived from key data fields that define the condition

Format (conceptual):
	•	id = hash(code + primaryTarget.key + signature)

Signature rules
	•	Include only fields that define the identity of the issue, not transient values.
	•	Examples:
	•	Type mismatch: (fromTypeDesc, toTypeDesc, portId, busId?)
	•	Empty bus: (busId)
	•	Illegal cycle: sorted list of involved node keys
	•	NaN propagation: first known source node key + sink target key

Explicitly exclude
	•	timestamps
	•	frame counts
	•	random seeds
	•	current time t
(those go into occurrences / lastSeenAt / perf stats)

This makes dedupe rock-solid.

⸻

3) TargetRef (how diagnostics point to the graph)

Diagnostics must attach to things users can click.

Target kinds

A TargetRef is one of:
	1.	Block

	•	kind: block
	•	blockId

	2.	Port

	•	kind: port
	•	blockId
	•	portId (input/output)
	•	direction: in | out

	3.	Bus

	•	kind: bus
	•	busId

	4.	Binding (listener/publisher)

	•	kind: binding
	•	bindingId (listenerId or publisherId)
	•	optionally also busId + blockId + portId

	5.	Composite

	•	kind: composite
	•	defId and/or instanceId

	6.	TimeRoot

	•	kind: timeRoot
	•	timeRootId (or the blockId/graph node that is the root)

	7.	GraphSpan

	•	kind: graphSpan
	•	nodes[]: list of TargetRefs (bounded)
	•	used for SCC/cycles/ambiguous mappings

Target “key”

Each TargetRef has an internal stable “key string” used for ID hashing:
	•	block:block-123
	•	port:block-123:radius
	•	bus:phaseA
	•	etc.

⸻

4) FixAction spec (actionable diagnostics)

Actions are not code; they are structured intents that UI/runtime know how to execute.

Action fields
	•	id: stable action id for telemetry/tests
	•	label: UI text
	•	kind: action type enum
	•	target: TargetRef (where it applies)
	•	params: action-specific payload
	•	risk: safe | caution | destructive
	•	requiresConfirmation: boolean
	•	applyMode: immediate | onBoundary | staged

Core action kinds you’ll need
	•	FocusTarget (select + pan)
	•	OpenInspector
	•	CreateTimeRoot (choose kind)
	•	SetTimeRootKind
	•	InsertBlock (e.g., insert Delay into a cycle)
	•	ChangeBusCombineMode
	•	CreateBus
	•	BindPortToBus
	•	EditBindingChain
	•	AddAdapterStep
	•	ReplaceAdapterChain
	•	RemoveBinding
	•	SetSilentValue
	•	MuteDiagnostic
	•	UnmuteDiagnostic
	•	RetryCompile
	•	OpenExportReport

Important: “InsertBlock” and similar actions must include enough parameters for deterministic application (which edge, which ports). No “guessing” in the UI.

⸻

5) Diagnostic Set semantics (snapshots vs streams)

DiagnosticHub stores separate namespaces:

A) Compile snapshot (authoritative per revision/compile)
	•	Replaced wholesale on CompileFinished
	•	These diagnostics are true for the current graph revision

B) Authoring snapshot (fast validators)
	•	Updated on GraphCommitted
	•	Intended to be immediate feedback (e.g., missing bindings)

C) Runtime rolling window
	•	Updated on RuntimeHealthSnapshot
	•	Uses expiry (e.g., resolve if not seen for N seconds)
	•	Aggregates occurrences

D) Export snapshot
	•	Produced when export analysis runs
	•	Stored per export target and revision

UI can filter by domain; “Patch Health” can summarize across them.

⸻

6) Canonical diagnostic codes (starter canonical set)

You asked for a spec that’s long-term and complete; codes are the backbone. Here’s a foundational set you can expand.

Time / topology
	•	E_TIME_ROOT_MISSING
	•	E_TIME_ROOT_MULTIPLE
	•	E_TIME_ROOT_INVALID_INPUT
	•	W_SECONDARY_CLOCK_UNBOUND
	•	W_SECONDARY_CLOCK_CONFLICT
	•	W_TIME_TOPOLOGY_CHANGE_WILL_RESET

Graph / cycles
	•	E_GRAPH_CYCLE_ILLEGAL
	•	W_GRAPH_CYCLE_COSTLY (legal but heavy)
	•	E_GRAPH_DANGLING_INPUT (if not allowed)
	•	W_GRAPH_UNUSED_OUTPUT

Types / adapters / bindings
	•	E_TYPE_MISMATCH
	•	E_ADAPTER_CHAIN_INVALID
	•	W_ADAPTER_CHAIN_DESTRUCTIVE_REDUCE
	•	W_ADAPTER_CHAIN_HEAVY
	•	W_BINDING_USING_SILENT_VALUE
	•	W_BUS_EMPTY
	•	E_BUS_COMBINE_MODE_INCOMPATIBLE
	•	E_BUS_PUBLISHER_TYPE_INCOMPATIBLE

Fields / identity
	•	E_FIELD_DOMAIN_MISMATCH
	•	E_FIELD_ELEMENT_ID_UNSTABLE
	•	W_FIELD_MATERIALIZATION_LARGE
	•	P_FIELD_MATERIALIZATION_HOTSPOT

Runtime numeric stability
	•	E_RUNTIME_NAN
	•	E_RUNTIME_INF
	•	W_RUNTIME_DIVERGENCE
	•	W_RUNTIME_CLAMPING_APPLIED (if you add auto-safety)

Performance
	•	P_FRAME_BUDGET_EXCEEDED
	•	P_COMPILE_SLOW
	•	P_GC_PRESSURE_HIGH

Export
	•	E_EXPORT_UNSUPPORTED_FEATURE
	•	W_EXPORT_APPROXIMATION_APPLIED
	•	W_EXPORT_BAKED_DYNAMICS

⸻

7) Structured data payload by code (examples)

Every diagnostic code defines its data schema. This is what makes diagnostics testable and UI-smart.

E_TYPE_MISMATCH

Data includes:
	•	expected: TypeDesc
	•	actual: TypeDesc
	•	from: TargetRef (source port or bus)
	•	to: TargetRef (destination port)
	•	suggestedChains[]: list of adapter-chain presets (if any)

W_BUS_EMPTY
	•	busId
	•	silentValue
	•	combineMode
	•	publisherCount: 0
	•	listenerCount

E_GRAPH_CYCLE_ILLEGAL
	•	cycleNodes[]: TargetRefs (bounded)
	•	cycleEdges[]: (fromKey,toKey)
	•	missingMemoryBoundary: true
	•	suggestedInsertionPoints[]: where Delay/State could be inserted

W_FIELD_MATERIALIZATION_LARGE
	•	sink: TargetRef (port or renderer)
	•	elementCount
	•	estimatedBytes
	•	topContributors[]: TargetRef + estimated share

P_FRAME_BUDGET_EXCEEDED
	•	fpsEstimate
	•	avgFrameMs
	•	worstFrameMs
	•	budgetMs (e.g., 16.6)
	•	hotspots[] (optional)

E_EXPORT_UNSUPPORTED_FEATURE
	•	feature: enum
	•	where: TargetRef
	•	suggestedFallback: description
	•	blocking: true

This data is what makes actions possible.

⸻

8) UX policy encoded in diagnostics (severity rules)

To keep the system consistent:

Fatal
	•	patch cannot run (no TimeRoot, multiple TimeRoots, compiler cannot produce program)

Error
	•	program cannot compile or will be meaningless (type mismatch without conversion, illegal cycle)

Warn
	•	program runs but user should know something important (reduce used, empty bus uses silent, time topology change will reset)

Info / Hint
	•	guidance, not problems (unused bus, optional improvements)

Perf
	•	always separate “perf” domain; don’t mix with correctness errors

This prevents “warning fatigue”.

⸻

9) Emission rules (so producers stay sane)

Producers must follow these rules:
	1.	Emit diagnostics with stable IDs.
	2.	Do not emit raw strings; populate code, targets, data.
	3.	Avoid duplicates; rely on hub dedupe, but don’t spam.
	4.	Runtime producers emit at most once per snapshot window per id.
	5.	Compiler emits a complete snapshot every compile.

⸻

10) What this enables immediately

With this spec, you can build:
	•	A diagnostic console that isn’t spam
	•	Click-to-focus navigation
	•	Inline port badges and bus row badges
	•	“Fix it” buttons that are deterministic
	•	Snapshot-based “health status”
	•	Multi-client: server emits diagnostics; clients render identically
	•	Tests that assert codes/targets/data rather than matching strings

