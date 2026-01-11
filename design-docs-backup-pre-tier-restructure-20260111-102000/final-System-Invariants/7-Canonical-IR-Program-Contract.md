Understood. Here is one canonical specification. No options, no “maybe later”, no extra flexibility.

⸻

Canonical IR Program Contract (Single Source of Truth)

0) Authority
	1.	The only authoritative CompiledProgramIR is:
	•	src/editor/compiler/ir/program.ts
	2.	The legacy schema is forbidden and must be deleted:
	•	src/editor/ir/schema/CompiledProgramIR.ts (and the entire directory if nothing else is required)
	3.	Runtime MUST import and type against the authoritative schema only.
	•	Any runtime code that expects fields not present in this schema must be updated to use the replacements defined below.

⸻

1) CompiledProgramIR canonical shape

1.1 irVersion
	•	irVersion is a number literal: 1
	•	Not a string, not semver.

readonly irVersion: 1;

1.2 Execution tables

These names are canonical and MUST exist:

readonly signalExprs: SignalExprTable;
readonly fieldExprs: FieldExprTable;
readonly eventExprs: EventExprTable;

Runtime is forbidden from using signalTable, fields, nodes, etc.

1.3 Constants

Constants are JSON-only. No typed pools. No constIndex. No Map. No f64/f32/i32 arrays.

readonly constants: {
  readonly json: readonly unknown[];
};

All constant reads are program.constants.json[id]. If a constant is missing, that is a compiler bug (not “coerce to 0” in runtime).

1.4 Schedule

Schedule is authoritative. Runtime executes only steps.

readonly schedule: ScheduleIR;

There is no “node execution” system. Node-like evaluation is expressed as step kinds that evaluate expr tables into slots.

1.5 Outputs

program.outputs MUST exist and is the only runtime output mechanism.
Render sinks are compile-time metadata and are not how runtime finds outputs.

readonly outputs: readonly OutputSpecIR[];

Where:

export interface OutputSpecIR {
  readonly kind: "renderFrame";          // only allowed kind for now
  readonly slot: ValueSlot;             // slot containing RenderFrameIR object
}

	•	Exactly one output is required: { kind: "renderFrame", slot: ... }

1.6 Slot layout / metadata

slotMeta MUST include offset. Runtime is forbidden from computing offsets.

readonly slotMeta: readonly SlotMetaEntry[];

Where:

export interface SlotMetaEntry {
  readonly slot: ValueSlot;
  readonly storage: "f64" | "f32" | "i32" | "u32" | "object";
  readonly offset: number;              // REQUIRED
  readonly type: TypeDesc;
  readonly debugName?: string;
}

This is the single slot table used for:
	•	execution addressing (offset)
	•	debug labeling and type info

No separate slotLayout. No runtime derivation. If offset is wrong, compilation is wrong.

⸻

2) Forbidden tables: what must NOT exist in CompiledProgramIR

These are not allowed in the authoritative schema:
	•	program.nodes (NodeTable / NodeIR)
	•	program.buses (BusTable / BusIR)
	•	program.constPool (anything except constants.json)
	•	program.transforms
	•	program.meta, ProgramMeta (unless you put it under debugIndex, see below)

If any file expects these, the file must be updated.

⸻

3) Runtime execution model (replacements)

3.1 executeNodeEval.ts — MUST be removed
	•	Delete StepNodeEval concept if present.
	•	Delete executeNodeEval.ts.
	•	Replace any “node evaluation” with step types that explicitly evaluate expressions into slots.

In other words: runtime executes StepIR, not NodeIR.

3.2 Bus debug meaning after unification

There is no program.buses.
If Debug UI wants “bus visibility”, it must derive it from program.debugIndex (below). Runtime does not “execute buses”; it executes steps that include combine semantics.

3.3 Render output extraction

ScheduleExecutor MUST read render output from:

const out = program.outputs[0];
assert(out.kind === "renderFrame");
return runtime.values.read(out.slot) as RenderFrameIR;

program.render.sinks must not be used for runtime output selection.

⸻

4) Debug stability (what replaces program.nodes/program.buses in DebugStore)

DebugStore must not depend on runtime tables that don’t exist. Therefore:

4.1 Add debugIndex to program (mandatory)

CompiledProgramIR MUST include:

readonly debugIndex: DebugIndexIR;

Where the minimum mandatory structure is:

export interface DebugIndexIR {
  readonly stepToBlock: ReadonlyMap<StepId, BlockId>;
  readonly slotToBlock: ReadonlyMap<ValueSlot, BlockId>;
  readonly busToValueRef?: ReadonlyMap<BusId, ValueSlot>; // optional ONLY if buses still exist at editor level
  readonly labels?: ReadonlyMap<string, string>;
}

Rules:
	•	DebugStore shows “block execution” by grouping steps using stepToBlock.
	•	DebugStore shows “produced values” using slotToBlock + slotMeta.debugName.

No other node/bus structures are permitted.

⸻

5) Concrete required code changes implied by this spec

This is not optional; these are direct consequences:

5.1 Delete legacy schema
	•	Delete: src/editor/ir/schema/CompiledProgramIR.ts
	•	Fix all imports to use src/editor/compiler/ir/program.ts

5.2 Fix runtime naming
	•	program.signalTable → program.signalExprs
	•	program.fields / program.fieldTable → program.fieldExprs
	•	Any executor expecting nodes must be rewritten to use signalExprs/fieldExprs/eventExprs + steps.

5.3 Fix ScheduleExecutor dead code
	•	Remove unreachable executeBusEval / executeEventBusEval calls if those step kinds do not exist.
	•	ScheduleExecutor must switch exhaustively over StepIR.kind.

5.4 Constants
	•	Rewrite OpCodeEvaluator / any const consumer to use:
	•	program.constants.json[id]

No typed pools. No constIndex. No coercion.

5.5 SlotMeta offset
	•	Update SlotMetaEntry to include offset and ensure compiler assigns it during slot allocation.
	•	RuntimeState must build its “bySlot” map using that offset. No recomputation.

5.6 Outputs
	•	Add program.outputs to CompiledProgramIR, populate it in compilation finalization.
	•	Update any code path that currently tries to infer output from render.sinks.

⸻

6) Acceptance test for “schema unified” (must pass before any work is “done”)

Work is not complete unless:
	1.	There is exactly one CompiledProgramIR interface in the repo used by runtime.
	2.	tsc has zero references to:
	•	program.nodes
	•	program.buses
	•	program.signalTable
	•	program.constPool / constIndex
	3.	Runtime render output is obtained from program.outputs[0].slot.
	4.	Slot addressing uses slotMeta.offset (required).
	5.	Old schema directory is deleted.

⸻

If you want, paste your current CompiledProgramIR file (the one in src/editor/compiler/ir/program.ts) and I’ll rewrite it into the exact interface text that matches the above, including the exact DebugIndexIR, OutputSpecIR, and SlotMetaEntry definitions so you can drop it in and stop the churn.