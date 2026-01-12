
Go with SignalExpr. It’s the long-term optimal choice for this system, for the same reasons you’re insisting on “no closure ball” and “port to Rust later”:
	•	Deterministic + inspectable: signals become dataflow, not hidden JS closures. Debugger and diff engine stop guessing.
	•	Consistent semantics: buses, lenses, adapters, caching, and hot-swap rules work the same way for signal and field worlds.
	•	Portability: a table-driven Signal VM (or compiled bytecode) is an easy Rust/WASM target; “evaluate JS functions” is not.
	•	Performance: you can cache SignalExpr subgraphs, fuse transforms, and avoid re-evaluating the same derived signals N times per frame.

Below is the exact schema extension you should adopt (mirrors the Field side you already accepted).

⸻

SignalExpr IR Schema

SignalExpr table

export type SigExprId = string;

export interface SignalExprTable {
  exprs: Record<SigExprId, SignalExprIR>;
}

SignalExpr node kinds

Signals are functions of time and runtime context, but represented as a DAG.

export type SignalExprIR =
  | { kind: "const"; id: SigExprId; type: TypeDesc; valueConstId: string }

  // canonical time roots (derived by timeDerive step)
  | { kind: "timeAbsMs"; id: SigExprId; type: TypeDesc; slot: ValueSlot }
  | { kind: "timeModelMs"; id: SigExprId; type: TypeDesc; slot: ValueSlot }
  | { kind: "phase01"; id: SigExprId; type: TypeDesc; slot: ValueSlot }
  | { kind: "wrapEvent"; id: SigExprId; type: TypeDesc; slot: ValueSlot } // event-ish signal or event stream handle

  // reference another node's output slot that is itself a signal expr handle
  | { kind: "inputSlot"; id: SigExprId; type: TypeDesc; slot: ValueSlot }

  // pure combinators (same idea as FieldExpr)
  | { kind: "map"; id: SigExprId; type: TypeDesc; src: SigExprId; fn: PureFnRef }
  | { kind: "zip"; id: SigExprId; type: TypeDesc; a: SigExprId; b: SigExprId; fn: PureFnRef }
  | { kind: "select"; id: SigExprId; type: TypeDesc; cond: SigExprId; t: SigExprId; f: SigExprId }

  // transforms (adapters + lenses)
  | { kind: "transform"; id: SigExprId; type: TypeDesc; src: SigExprId; chain: TransformChainRef }

  // bus combine in signal world
  | {
      kind: "busCombine";
      id: SigExprId;
      type: TypeDesc;
      busIndex: BusIndex;
      terms: SigExprId[];
      combine: CombineSpec;
    }

  // stateful signal ops (explicit state cell access, NO hidden closure state)
  | {
      kind: "stateful";
      id: SigExprId;
      type: TypeDesc;
      op: StatefulSignalOp;
      input?: SigExprId;
      stateId: StateId;
      params?: Record<string, unknown>;
    };

Stateful signal ops (examples)

export type StatefulSignalOp =
  | "integrate"       // number/unit → number
  | "delayMs"         // any → any (time-based)
  | "delayFrames"     // any → any (frame-based)
  | "sampleHold"      // any + trigger → any
  | "edgeDetectWrap"  // phase01 → trigger/event
  ;

Rule: if it needs memory, it must be a stateful SignalExpr node with an explicit stateId. That’s the nail in the coffin for “closure memory”.

⸻

What changes elsewhere in the IR

ValueStore slots now store handles, not JS callables
	•	Output slot of a signal-producing node contains: SigExprId (handle).
	•	Output slot of a field-producing node contains: ExprId (FieldExpr handle).
	•	Scalar outputs can be immediate constants or SigExprId that is trivial.

Bus evaluation produces expressions (not closures)
	•	Signal bus result slot stores a SigExprId:
	•	either const(silent)
	•	or busCombine(terms…)
	•	Field bus result slot stores a FieldExpr ExprId (as already spec’d).

Materialization stays only for Fields

Signals are typically sampled, not materialized, except for export workflows (see below). Keep signals as lazy expressions; evaluate them at t to scalars.

⸻

Schedule semantics impact

The schedule does not need a dedicated “signal materialize” step

Instead, nodeEval steps can do one of two things:
	1.	Expression-producing node: writes a SigExprId (or ExprId) into its output slots. Cheap, pure.
	2.	Sink node / stateful op: may evaluate some SigExprId at current t to produce scalars/buffers (e.g., render wants scalar uniforms, or a stateful SignalExpr needs the current sample).

In other words:
	•	Signal graph building happens during compilation (preferred) or during nodeEval as “construct expr handles”.

Render step reads expressions and pulls values

Render sinks (e.g., RenderInstances2D) can:
	•	request Field materializations (buffers)
	•	sample signal expressions for uniforms (opacity, global transforms, palette phase, etc.)

This keeps the runtime tight: the renderer is the natural consumer that forces values.

⸻

Export semantics (why SignalExpr matters)

With SignalExpr, export becomes deterministic and architecture-independent:
	•	Video export: for each frame time t, sample the same SignalExpr DAG and materialize the same Fields.
	•	SVG export: sample at a single t (or at multiple cue points) with identical evaluation paths.
	•	Offline render: can run in Rust headless using the same IR.

No “recreate the JS closure behavior” problem.

⸻

Debugger becomes structurally correct

Power-user debugger can show:
	•	bus combine term list and ordering (publisher sortKey → term id)
	•	transform chain before/after at each node in the DAG
	•	cache hits at expression-subgraph level
	•	hot-swap diffs as “these SigExpr nodes changed” (not “some closure changed behavior”)

This is exactly the kind of “don’t compromise, fix the architecture” move you asked for.

⸻

The one real cost

You must treat SignalExpr as a first-class DAG and give it:
	•	stable ids
	•	interning/hash-consing (recommended)
	•	a tiny evaluator that can sample an expr at time t

But that cost is the price of “do it right”.

If you say Next, I’ll give you the SignalExpr evaluator design (runtime data structures, interning strategy, caching, and the exact opcode/kernels split that keeps it Rust-friendly).