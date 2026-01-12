Below is the full, long-term IR schema and the schedule semantics for Oscilla’s “compiled program as data + deterministic VM” architecture.

This is written so engineers don’t invent ad-hoc runtime behavior. If they follow this, you get: deterministic evaluation, lazy Fields, bus provenance, stable hot-swap, and a clean Rust/WASM target.

⸻

Oscilla Compiled IR Spec

Design invariants
	1.	Program is data. No user-meaningful logic lives in closures.
	2.	Determinism: given the same PatchRevision + Seed + TimeModel + Inputs, you get the same outputs.
	3.	Lazy Fields: Fields are expressions until forced by a sink/debug/export.
	4.	Stable identity: all nodes/buses/steps have stable ids for diffing, caching, and traces.
	5.	Central value store: all intermediate values live in a ValueStore keyed by indices, not names.
	6.	Instrumentation is structural: every runtime event corresponds to an IR step id.

⸻

1) Core type system

1.1 Type descriptors

export type TypeWorld = "signal" | "field" | "scalar" | "event" | "special";

export type TypeDomain =
  | "number" | "boolean" | "string"
  | "vec2" | "vec3" | "vec4"
  | "color" | "bounds"
  | "timeMs" | "phase01" | "unit01"
  | "trigger"              // discrete event-ish signal
  | "domain"               // element identity handle
  | "renderTree" | "renderCmds"
  | "mesh" | "camera" | "mat4"
  | "path" | "strokeStyle" | "filterDef"
  | "unknown";

export interface TypeDesc {
  world: TypeWorld;
  domain: TypeDomain;
  semantics?: string;     // e.g. "point", "hsl", "linearRGB", "bpm"
  unit?: string;          // e.g. "px", "deg", "ms"
}

1.2 Value kinds in runtime

Runtime values are strongly tagged so the VM can branch cheaply.

export type ValueKind =
  | { kind: "scalar"; type: TypeDesc }
  | { kind: "signal"; type: TypeDesc }     // signal value at time t; represented as runtime plan
  | { kind: "field"; type: TypeDesc }      // field expression handle
  | { kind: "event"; type: TypeDesc }      // event stream / trigger-like
  | { kind: "special"; type: TypeDesc };   // domain, render, etc


⸻

2) IDs, indices, and stability

2.1 Stable IDs

IDs are stable across compiles whenever the “same semantic object” persists.

export type NodeId = string;      // stable per block instance or internal node
export type BusId = string;       // stable per bus entity
export type StepId = string;      // stable per scheduled step
export type ExprId = string;      // stable per FieldExpr node (hash-consed)
export type StateId = string;     // stable per state cell

2.2 Indexing strategy

Runtime performance depends on index-based addressing.
	•	Compiler assigns dense integer indices:
	•	nodeIndex: 0..N-1
	•	portIndex within node outputs and inputs
	•	busIndex: 0..B-1
	•	Names only exist in metadata.

export type NodeIndex = number;
export type PortIndex = number;
export type BusIndex = number;
export type ValueSlot = number; // dense index into ValueStore arrays

Rule: every output port maps to exactly one ValueSlot. Inputs reference a ValueSlot (after adapters are applied).

⸻

3) Program IR: top-level container

export interface CompiledProgramIR {
  irVersion: number;

  // Identity / provenance
  patchId: string;
  patchRevision: number;
  compileId: string;        // unique per compile
  seed: number;

  // Time topology (authoritative)
  timeModel: TimeModelIR;

  // Tables
  types: TypeTable;
  nodes: NodeTable;
  buses: BusTable;
  lenses: LensTable;
  adapters: AdapterTable;
  fields: FieldExprTable;    // optional: may be empty until runtime builds exprs; see semantics

  // Schedule
  schedule: ScheduleIR;

  // Outputs (render roots)
  outputs: OutputSpec[];

  // Debug + mapping
  meta: ProgramMeta;
}


⸻

4) Time model IR (authoritative, no “player looping” hacks)

export type TimeModelIR =
  | { kind: "finite"; durationMs: number; cuePoints?: CuePointIR[] }
  | { kind: "cyclic"; periodMs: number; mode: "loop" | "pingpong"; phaseDomain: "0..1" }
  | { kind: "infinite"; windowMs: number; suggestedUIWindowMs?: number };

export interface CuePointIR {
  id: string;
  label: string;
  tMs: number;
  behavior?: "snap" | "event";
}

Semantics:
	•	Runtime always uses monotonic tAbsMs internally.
	•	timeModel defines derived time signals:
	•	cyclic -> tCycleMs, phase01, wrapEvent
	•	finite -> progress signal, end event
	•	infinite -> windowing only for UI/sampling/export

⸻

4.1) Global Rails (authoritative modulation plane)

Global Rails are fixed-name, frame-latched modulation channels that exist outside the user dependency graph.

They are not nodes, buses, or blocks. They are runtime registers resolved by schedule.

Each rail has:
  - a stable RailId (e.g. phaseA, phaseB, pulseA, pulseB, energy, palette)
  - an internal generator (from the Time Console)
  - an optional bus binding (sampled from bus fabric)
  - a drive policy: 'internal' | 'patched' | 'mixed'
  - a combineMode: 'last' | 'sum' | 'average' | 'max' | 'min'

Rails are resolved once per frame in a dedicated schedule phase.

Semantics:
  - Reads of rails inside node evaluation always see the previous frame's railFinal value (frame-latched).
  - Writes from Time Console and from user graph publishers contribute to railInternal and railUser respectively.
  - railFinal[t] is resolved after user graph evaluation.

This guarantees no algebraic cycles even when buses derive from rails and rails derive from buses.

⸻

5) Type table

export interface TypeTable {
  // Interning TypeDesc to small ints is allowed but not required in TS.
  // Rust/WASM will likely intern.
  typeIds: TypeDesc[];
}


⸻



16) State cells (for Delay/Integrate/etc)

export interface StateBindingIR {
  stateId: StateId;
  type: TypeDesc;
  initialValueConstId?: string;
  policy: "frame" | "timeMs";    // frame-based delay vs time-continuous state
}

State is not “magic closure memory.” It’s explicit, indexed storage in the runtime.

⸻

17) Program meta (source mapping, UI labeling)

export interface ProgramMeta {
  // mapping from node ids to editor block ids and ports
  sourceMap: SourceMapIR;

  // user-friendly labels for debugger
  names: {
    nodes: Record<NodeId, string>;
    buses: Record<BusId, string>;
    steps: Record<StepId, string>;
  };

  // optional: compile warnings
  warnings?: CompileWarningIR[];
}

export interface SourceMapIR {
  nodeToEditorBlock?: Record<NodeId, { blockId: string; kind: "primitive" | "compositeInternal" }>;
  portToEditorSlot?: Record<string, { blockId: string; slotId: string }>;
}

export interface CompileWarningIR {
  code: string;
  message: string;
  where?: { nodeId?: NodeId; busId?: BusId; stepId?: StepId };
}


⸻

18) Runtime VM semantics (authoritative)

The runtime engine processes:
	•	ValueStore (typed arrays for slots)
	•	StateStore (typed state cells)
	•	FieldStore (expr DAG + buffer cache)
	•	Tracer (optional)

18.1 ValueStore contract (conceptual)
	•	slot addresses are dense integers.
	•	Each slot holds a tagged value:
	•	scalar immediate (number/bool/etc)
	•	signal plan handle (e.g. op graph or reference to node output)
	•	field expr handle (ExprId)
	•	buffer handle (BufferRef)
	•	render tree/cmds handle

The VM must enforce:
	•	single writer per slot per frame (compile-time guarantee)
	•	no reads of uninitialized slots (compile-time guarantee, runtime assertion in debug builds)

18.2 Transform application

Transform chains are executed by the VM in a standardized way:
	•	For scalar/signal: apply transform as scalar/signal ops
	•	For field: transform produces a new FieldExpr node (transform), not arrays
	•	For reduce adapters: field -> signal reduction creates a signal plan (and must be explicitly allowed)

No ad-hoc “special lens evaluation” inside random nodes.

⸻

19) How engineers must extend the system

To add a new block/op:
	1.	Add an OpCode definition (or kernelId reference)
	2.	Define input/output TypeDescs
	3.	Define implementation in:
	•	TS VM opcode switch, and/or
	•	Rust/WASM kernel table
	4.	Provide debug metadata + UI hints (optional)

No one should add “custom closure compilation” for a block. Ever.

⸻


21) The schedule compiler must emit (algorithmic semantics)

Engineers often screw this up unless you pin it down.

21.1 Build a dependency graph over steps, not blocks

Nodes/buses/materializations are steps. Dependencies are:
	•	Slot production → slot consumption
	•	Publisher source slots → busEval
	•	bus slot → consumer nodeEval inputs
	•	domain slot + expr deps → materialize
	•	buffers → render nodes

21.2 Phase partitioning

Partition steps into:
	1.	timeDerive
	2.	preBus nodeEval
	3.	busEval (all buses in a stable order)
	4.	postBus nodeEval
	5.	materialize + render (interleaved as needed)
	6.	renderAssemble

Stable ordering rules
	•	buses: by busIndex (which itself is stable per busId sorting in compile)
	•	nodes: topological order with explicit tie-break
	•	materializations: must be scheduled immediately before first use, stable tie-break by materialization id

21.3 Cache keys and invalidation
	•	Every Step has a CacheKeySpec.
	•	The compile must generate a minimal deps set.
	•	Runtime can use this for:
	•	skip step when deps unchanged this frame
	•	persist caches across hot-swap for unchanged step ids

21.4 Rail resolution phase

Insert an explicit RailResolve phase between busEval and render:

Schedule order:
  1. timeDerive
  2. timeConsole (internal rail generators)
  3. preBus nodeEval
  4. busEval
  5. postBus nodeEval (if any)
  6. railResolve (per-rail deterministic resolution)
  7. materialize + render
  8. renderAssemble

railResolve step:
  for each RailId in stable order:
    railFinal = resolve(railInternal, railUser, drivePolicy, combineMode)
    store railFinal in RailStore and (optionally) mirror to bus fabric

⸻

22) Hot-swap / diff rules (non-jank requirement)

A program swap is allowed without visual jank only if:
	1.	Time continuity preserved:
	•	runtime keeps tAbsMs
	•	new program derives time via same timeModel kind, or the swap is “topology change” and must be handled specially (you already spec’d this elsewhere)
	2.	State continuity preserved when state ids match:
	•	if a node/stateId persists unchanged, copy its state cell to new runtime
	•	if it changes type/layout, state resets and trace must report it
	3.	Slot continuity:
	•	when a node persists, its output slots may be reindexed internally, but semantic outputs must map to stable slots. Easiest: keep ValueSlots stable for unchanged node outputs.

This is why slots and step ids must be stable.

⸻

23) Rust/WASM compatibility requirements (baked in)

To ensure you’re not designing away from Rust:
	•	IR is strictly serializable (no functions)
	•	All operations are referenced by opcode/kernels
	•	All values use typed buffers or primitive scalars
	•	No dynamic object graphs in hot loops
	•	Transform chains are table-driven
	•	Scheduling is explicit

</file>
