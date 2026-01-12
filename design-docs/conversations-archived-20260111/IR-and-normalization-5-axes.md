Below is the same contract, updated so the IR explicitly encodes the axes as first-class metadata on every slot type (and therefore every produced value), without reintroducing node/bus tables or any runtime inference.

⸻

Canonical IR Program Contract (Single Source of Truth)

0) Authority
    1.	The only authoritative CompiledProgramIR is:
          •	src/editor/compiler/ir/program.ts
    2.	The legacy schema is forbidden and must be deleted:
          •	src/editor/ir/schema/CompiledProgramIR.ts (and the entire directory if nothing else is required)
    3.	Runtime MUST import and type against the authoritative schema only.

⸻

1) CompiledProgramIR canonical shape

1.1 irVersion
•	irVersion is a number literal: 1

readonly irVersion: 1;

1.2 Execution tables

These names are canonical and MUST exist:

readonly signalExprs: SignalExprTable;
readonly fieldExprs: FieldExprTable;
readonly eventExprs: EventExprTable;

Runtime is forbidden from using legacy names (signalTable, fields, nodes, etc.).

1.3 Constants

Constants are JSON-only:

readonly constants: { readonly json: readonly unknown[] };

All constant reads are program.constants.json[id].

1.4 Schedule

Schedule is authoritative. Runtime executes only steps.

readonly schedule: ScheduleIR;

1.5 Outputs

program.outputs MUST exist and is the only runtime output mechanism.

readonly outputs: readonly OutputSpecIR[];

Exactly one output is required for now:
•	{ kind: "renderFrame", slot: ... }

1.6 Slot layout / metadata

slotMeta MUST include offset. Runtime is forbidden from computing offsets.

readonly slotMeta: readonly SlotMetaEntry[];

1.7 Axes

New requirement: every value slot MUST carry an axes descriptor as part of its type.
•	The compiler is the authority for axes assignment.
•	Runtime MUST treat axes as read-only metadata used for validation/debug, never inference.
•	The three expr tables (signalExprs/fieldExprs/eventExprs) are an execution partition; axes are the semantic partition that makes values composable and debuggable across the system.

Concretely: SlotMetaEntry.type.axes is mandatory.

⸻

2) Forbidden tables (must NOT exist)

Not allowed in CompiledProgramIR:
•	program.nodes
•	program.buses
•	program.constPool (anything except constants.json)
•	program.transforms
•	program.meta / ProgramMeta (unless under debugIndex)

⸻

3) Runtime execution model (replacements)

Runtime executes StepIR, not node tables.
•	Delete executeNodeEval.ts and any StepNodeEval concept.
•	Replace “node evaluation” with step kinds that evaluate expr tables into slots.
•	Render output extraction MUST read program.outputs[0].slot.

⸻

4) Debug stability

CompiledProgramIR MUST include:

readonly debugIndex: DebugIndexIR;

Debug derives block/bus-like groupings from debugIndex + slotMeta (including axes).

⸻

5) Acceptance test (updated)

Work is not complete unless:
1.	Exactly one CompiledProgramIR interface exists and runtime imports it.
2.	tsc has zero references to forbidden legacy fields.
3.	Runtime render output comes from program.outputs[0].slot.
4.	Slot addressing uses slotMeta.offset.
5.	Legacy schema directory is deleted.
6.	Every SlotMetaEntry.type.axes exists and is well-formed (no runtime defaults, no “unknown unless missing”).

⸻

program.ts: exact interface text (drop-in)

// src/editor/compiler/ir/program.ts

export type IrVersion = 1;

export type ValueSlot = number;
export type StepId = number;
export type BlockId = number;

export interface CompiledProgramIR {
readonly irVersion: IrVersion;

readonly signalExprs: SignalExprTable;
readonly fieldExprs: FieldExprTable;
readonly eventExprs: EventExprTable;

readonly constants: {
readonly json: readonly unknown[];
};

readonly schedule: ScheduleIR;

readonly outputs: readonly OutputSpecIR[];

readonly slotMeta: readonly SlotMetaEntry[];

readonly debugIndex: DebugIndexIR;
}

/* ---------------------------------- Outputs ---------------------------------- */

export interface OutputSpecIR {
readonly kind: "renderFrame"; // only allowed kind for now
readonly slot: ValueSlot;     // slot containing RenderFrameIR object
}

/* -------------------------------- Slot metadata -------------------------------- */

export interface SlotMetaEntry {
readonly slot: ValueSlot;

// Physical storage class (backing store selection).
readonly storage: "f64" | "f32" | "i32" | "u32" | "object";

// REQUIRED: absolute offset into the backing store for this storage class.
readonly offset: number;

// REQUIRED: logical type (includes axes).
readonly type: TypeDesc;

readonly debugName?: string;
}

/* ----------------------------------- Types ----------------------------------- */

/**
* TypeDesc is the single logical type descriptor used everywhere (debug, validation, tooling).
* Axes are REQUIRED and are the compiler-authoritative semantic classification.
  */
  export interface TypeDesc {
  readonly axes: AxesDescIR;
  readonly shape: ShapeDescIR;
  }

/**
* AxesDescIR models the "new axes" explicitly.
* Keep this stable: adding fields is allowed; removing/renaming is a breaking IR change.
  */
  export interface AxesDescIR {
  /**
    * Domain (a.k.a. "world"): which evaluation universe this value inhabits.
    * - "signal": time-indexed value (per tick / per sample / per frame depending on your scheduler)
    * - "field": spatially-indexed value (evaluated over a domain such as x/y, uv, etc.)
    * - "event": instantaneous value carried by event semantics (triggered, not continuously defined)
    * - "value": non-world value (constants, config, editor objects) that does not live in a world
        */
        readonly domain: "signal" | "field" | "event" | "value";

/**
* Temporality: how the value varies with time *within its domain*.
* - "static": not time-varying (can still be sampled)
* - "discrete": changes only at ticks/frames/steps
* - "continuous": intended to represent continuous-time variation (still simulated discretely)
* - "instant": exists only at an event instant (typically used with domain="event")
    */
    readonly temporality: "static" | "discrete" | "continuous" | "instant";

/**
* Perspective: which "view" this value is expressed in, when relevant.
* This is intentionally an enum rather than a free-form string to keep tooling stable.
* If you only need one, use "frame" everywhere for now.
  */
  readonly perspective: "frame" | "sample" | "global";

/**
* Branch axis: whether this value is single-lane or branch-lane.
* This is metadata only; the schedule defines actual control-flow.
  */
  readonly branch: "single" | "branched";

/**
* Identity axis: whether this value is keyed to a stable identity.
* This is metadata for composition and debugging (e.g., per-entity signals, per-point fields).
  */
  readonly identity:
  | { readonly kind: "none" }
  | { readonly kind: "keyed"; readonly keySpace: "entity" | "point" | "pixel" | "custom"; readonly keyTag?: string };
  }

/**
* Shape is the value "payload" structure independent of domain/temporality.
* Keep this small and predictable; express richer types via struct/array.
  */
  export type ShapeDescIR =
  | { readonly kind: "bool" }
  | { readonly kind: "number" } // semantic number; physical storage is SlotMetaEntry.storage
  | { readonly kind: "vec"; readonly lanes: 2 | 3 | 4; readonly element: "number" }
  | { readonly kind: "struct"; readonly fields: readonly StructFieldIR[] }
  | { readonly kind: "array"; readonly length: number; readonly element: ShapeDescIR }
  | { readonly kind: "object"; readonly class: string };

export interface StructFieldIR {
readonly name: string;
readonly shape: ShapeDescIR;
}

/* ----------------------------------- Debug ----------------------------------- */

export interface DebugIndexIR {
readonly stepToBlock: ReadonlyMap<StepId, BlockId>;
readonly slotToBlock: ReadonlyMap<ValueSlot, BlockId>;

// Optional ONLY if buses still exist at editor level (not runtime).
readonly busToValueRef?: ReadonlyMap<number, ValueSlot>;

readonly labels?: ReadonlyMap<string, string>;
}

/* -------------------------------- Execution tables ----------------------------- */
/**
* These are intentionally left abstract here; keep your existing tables, but they MUST
* ultimately write into ValueSlots that have SlotMetaEntry with TypeDesc.axes filled in.
  */
  export type SignalExprTable = unknown;
  export type FieldExprTable = unknown;
  export type EventExprTable = unknown;

/* ----------------------------------- Schedule ---------------------------------- */
/**
* ScheduleIR is likewise left abstract here; keep your existing schedule/steps, but runtime
* must execute steps that evaluate expr tables into slots using slotMeta.offset addressing.
  */
  export type ScheduleIR = unknown;

This updates the IR so the “new axes” are explicit, compiler-authored, and attached to the only thing runtime actually manipulates—slots—while preserving your “schedule-only runtime” rule and keeping the kernel small and stable.

In the form I wrote it, you get some binding value, but it’s the minimum: debugIndex.stepToBlock and debugIndex.slotToBlock give you block-level attribution (“this step/slot came from block X”), and slotMeta.debugName gives you a label, but there is no first-class “binding” model that can answer “which port?”, “which default?”, “which combine contributors?”, or “what exact provenance chain produced this value?”.

If you want to squeeze real leverage out of defaults (and out of debug generally) without reintroducing nodes/buses, add one small, explicit binding layer under debugIndex and make compilation populate it deterministically.

What to add (minimal, high-yield)

1) Slot/step → port binding (the missing piece)

Extend DebugIndexIR with a port binding table and map slots/steps to those bindings.

export type PortId = number;

export interface PortBindingIR {
readonly port: PortId;
readonly block: BlockId;

// Stable identifiers for UI and logs.
readonly portName: string;              // "in.color", "out.field", etc.
readonly direction: "in" | "out";
readonly domain: "signal" | "field" | "event" | "value"; // should match axes.domain

// Why does this value exist?
readonly role: "userWire" | "defaultSource" | "implicitCoerce" | "internalHelper";

// Optional: if this came from a default-source block, identify it.
readonly defaultOfPort?: PortId;
}

export interface DebugIndexIR {
readonly stepToBlock: ReadonlyMap<StepId, BlockId>;
readonly slotToBlock: ReadonlyMap<ValueSlot, BlockId>;

// New:
readonly ports: readonly PortBindingIR[];
readonly slotToPort: ReadonlyMap<ValueSlot, PortId>;
readonly stepToPort?: ReadonlyMap<StepId, PortId>;

readonly labels?: ReadonlyMap<string, string>;
}

This gives you “binding” in the concrete sense: you can click a value in the debugger and know exactly which port it corresponds to, and whether it’s user-provided or default-provided.

2) Default provenance (turn “defaults” into something you can see)

Defaults only become valuable if you can answer, at runtime/debug time:
•	“Is this coming from a default or a wire?”
•	“Which port’s default is this?”
•	“Which combine rule merged it, and with what?”

You get this by never treating defaults as invisible compiler magic. Instead:
•	materialize them as explicit steps (already consistent with your “schedule only” runtime), and
•	tag the produced slots via PortBindingIR.role = "defaultSource" plus defaultOfPort.

3) Combine provenance (what actually contributed?)

If you have “writer wins” / additive / etc., debuggability requires knowing the contributor set. Do this without buses by attaching a combine record to the step that performs the combine (or in debugIndex keyed by step id).

export interface CombineDebugIR {
readonly step: StepId;
readonly mode: "writerWins" | "additive" | "max" | "min" | "mul" | "overlay";
readonly dst: ValueSlot;
readonly contributors: readonly ValueSlot[];  // in priority / evaluation order
}

Add to DebugIndexIR:

readonly combines?: readonly CombineDebugIR[];

That makes defaults pay off immediately: you can show the user that a value is the result of (default writer) overridden by (wire writer), or mixed additively, with the exact contributor slots listed.

What this buys you immediately
•	“Why is this value what it is?” becomes answerable without guessing.
•	You can display defaults as real “virtual wires” in debug UI.
•	You can explain combine behavior with concrete contributors instead of narrative.
•	You avoid reintroducing node/bus runtime structures, because all of this is metadata indexed by slot and step.

Right now your IR has block attribution but not binding; adding ports + slotToPort (+ optional combine provenance) is the smallest change that turns “defaults” into a debuggable, inspectable feature rather than silent compiler behavior.

Graph normalization spec

Goal

Convert an authored patch graph (blocks + ports + wires + implicit defaults) into a canonical, explicit, deterministic graph where:
•	every “implicit” behavior is represented as an explicit node/edge (defaults, combines, coercions, lifts),
•	every input port has exactly one incoming edge (after combine),
•	contributor ordering is deterministic,
•	domain/axes boundaries are explicit (or explicitly violated with an error),
•	the result is stable under “save → load → normalize” (idempotent).

Inputs

Authored graph G0:
•	Blocks: blockId, blockType, block params.
•	Ports: per block, named ports with direction, declared type scheme (including axes constraints), and default spec (if any).
•	Wires: connect OutPortRef -> InPortRef.
•	Optional editor-only grouping/visual info (ignored by runtime, preserved in debugIndex only).

Output

Normalized graph GN:
•	Nodes are only:
•	user blocks (same semantics as authored),
•	injected structural nodes: DefaultSource, Combine, Coerce, Lift/Project, EventGate, UnitDelay (only if you choose auto-cycle-break; otherwise you error).
•	Edges are single-assignment into each input: inPort has one producer.
•	Each normalized node/edge has stable provenance:
•	“came from user wire X” / “default of port P” / “implicit coercion because…”
•	enough to populate debugIndex.slotToPort, combines[], etc.

⸻

Canonical invariants (must hold after normalization)
1.	Port completeness
•	Every input port has exactly one upstream value in GN.
•	That upstream value is either a direct wire, or Combine(contributors…).
2.	No implicit defaults
•	Defaults are always explicit DefaultSource nodes (even if they’re “always present”).
3.	Deterministic contributor ordering
•	For any Combine, contributors[] order is stable across runs and independent of hash-map iteration.
4.	Single semantic edge per input
•	Fan-in exists only through Combine.
•	Fan-out is allowed (one output feeding many inputs).
5.	Axes are never guessed
•	If a conversion is needed, it is represented as an explicit Coerce/Lift node or the program is rejected.
6.	Cycle rule
•	Any directed cycle in a time-varying domain that is evaluated per tick must contain at least one tick of stateful delay (e.g., UnitDelay) at the correct domain boundary, or the program is rejected.

⸻

Normalization pipeline

Phase 0 — Sanity + canonical IDs
•	Verify all referenced blocks/ports exist.
•	Remove wires to missing endpoints as compile errors (not silent drops).
•	Canonicalize port references ({blockId, portName}), not numeric indices.
•	Ensure stable ordering keys exist:
•	wireId monotonic, or canonical sort key (dstBlockId, dstPortName, srcBlockId, srcPortName, wireId).

Phase 1 — Build per-input “source sets”

For each input port p:
•	S_user(p) = all user wires connected to p, ordered deterministically.
•	S_default(p) = either empty or a default-source spec, depending on your rule:
•	Always-present defaults: present for every port with a default, regardless of wiring.
•	Only-when-unwired defaults: present only if S_user(p) is empty.

Create explicit DefaultSource(p) node(s) as needed and add them to the source set as contributors.

Result: S(p) = S_user(p) (+ default contributor maybe)

Phase 2 — Explicit fan-in via Combine nodes

For each input port p:
•	If |S(p)| == 0: compile error “missing required input”.
•	If |S(p)| == 1: connect that single source directly.
•	If |S(p)| > 1:
•	Insert Combine(p, mode) node.
•	mode is chosen deterministically:
•	from the destination port’s combine mode config (canonical),
•	else default "writerWins".

Writer ordering for writerWins
•	You must define it once and never deviate. One good canonical rule:
1.	user wires in deterministic order, then
2.	default contributor last (so any user writer overrides it), unless you explicitly want the opposite.

Populate debug metadata:
•	CombineDebugIR { step, mode, dst, contributors[] } later, keyed by the combine node.

Phase 3 — Structural desugaring (optional but usually worth it)

Insert “structural convenience” nodes so later passes are simple:
•	Multi-output blocks → explicit Project(field) nodes if your IR prefers single-value nodes.
•	Port aliases → eliminated.
•	Variadic ports → converted into explicit list/array builders if needed.

This phase must be semantics-preserving and deterministic.

Phase 4 — Axes boundary legalization (type-directed rewrite hook point)

At this point, the graph is structurally canonical but not necessarily type/axes-correct.

You now perform type + axes evaluation (details below), then rewrite:

For every edge u -> v.in where type(u) is not assignable to expected type(v.in):
•	If there exists an allowed conversion, insert an explicit node, e.g.:
•	CoerceNumber(f32->f64)
•	Lift(value->signal) (constant becomes per-tick)
•	SampleAndHold(event->signal) (event drives a latched signal)
•	Resample(signal->field) (if you support it; often you shouldn’t)
•	Project/Pack for shape mismatches
•	Otherwise: compile error with a precise mismatch report (expected vs got including axes).

Important: conversions that change domain/temporality are never “coercions”; treat them as named semantic operators with explicit behavior.

Phase 5 — Cycle check in the normalized, legalized graph

Run SCC detection on the directed evaluation graph per domain that participates in step scheduling.
•	If SCC size > 1 (or a self-loop) and no approved delay-breaking operator exists on every cycle path:
•	error “algebraic loop” with a cycle trace using debug bindings.
•	If you support auto-fixing, it must be a separate opt-in transform (not silent), because it changes meaning.

Phase 6 — Canonical ordering for compilation

Produce stable node and edge orders for lowering:
•	Topologically sort within each scheduled domain partition (or generate schedule directly).
•	When ties exist, break with stable keys (blockId, portName, injected-node-kind, wireId).
•	Emit a normalized graph digest if you want “same graph → same IR bytes”.

⸻

Where type evaluation happens relative to normalization

There are two coherent designs.

A) Type evaluation before normalization

Pros
•	You can use global inference to decide how defaults should be instantiated (e.g., scalar vs vec) and what combine modes are legal.
•	You can reject illegal multi-world wiring earlier.

Cons
•	Harder because the authored graph contains implicit behaviors; inference must model “maybe default exists”, “maybe combine exists”, and you’ll end up re-deriving the same implicit rules inside the type engine.
•	Debuggability suffers because errors point into an implicit world (“it would have combined here”) instead of a concrete node.

B) Normalize structurally first, then type-evaluate, then type-directed rewrite

Pros
•	The type engine operates on the real program, not a partially implicit one.
•	Errors and debug traces have concrete nodes: DefaultSource, Combine, SampleAndHold, etc.
•	Makes the compiler architecture compositional: structure pass → typing → legalization.

Cons
•	Some normalization choices might want types (rare, but real), e.g. whether a default literal should be treated as number vs vec, or whether “additive combine” is meaningful for a shape.

Recommended ordering

Do a hybrid:
1.	Structural normalization first (Phases 0–3) using only declared port signatures and explicit combine/default rules.
2.	Type + axes evaluation on the structurally-normalized graph.
3.	Type-directed legalization rewrite inserting explicit conversion/lift nodes (Phase 4).
4.	Final cycle check and canonical ordering (Phases 5–6).

This gives you the “most often” usability of defaults/combines while ensuring the final graph is both debuggable and expressive enough to build whatever users want.