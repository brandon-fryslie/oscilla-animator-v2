SignalExpr evaluator design

This is the runtime half that makes SignalExpr real: fast sampling, deterministic tracing, Rust-friendly, and no closure state.

⸻

1) Runtime data structures

A. CompiledProgram shape (authoritative)

export interface CompiledProgram {
  // immutable, structural
  readonly timeModel: TimeModel;
  readonly buses: BusRuntimeTable;
  readonly graph: GraphRuntime;          // blocks + slot wiring in IR form
  readonly sig: SignalRuntime;           // SignalExpr pool + evaluator support
  readonly field: FieldRuntime;          // FieldExpr pool + materializer support
  readonly render: RenderRuntime;        // RenderTree builder + sinks

  // fast lookup for UI/debug
  readonly debug: DebugIndex;            // maps ids -> names, source locations, etc.
}

B. Signal runtime tables

export interface SignalRuntime {
  readonly nodes: SigNode[];                 // dense array for speed
  readonly roots: Record<string, SigId>;     // named handles (bus outputs, block outputs)
  readonly constPool: ConstPool;             // JSON consts → packed forms
  readonly fnTable: PureFnTable;             // map/zip/select functions
  readonly txTable: TransformTable;          // adapter/lens chains
  readonly stateLayout: StateLayout;         // state cell offsets/types
  readonly eval: SigEvaluator;               // sampling engine
}

C. Node representation: dense + typed

Prefer array-of-struct style in TS now (still Rust-portable), but keep it as a flat array of tagged nodes:

export type SigId = number;

export type SigNode =
  | { k: "const"; type: TypeDesc; constId: number }

  | { k: "timeAbsMs"; type: TypeDesc }
  | { k: "timeModelMs"; type: TypeDesc }
  | { k: "phase01"; type: TypeDesc }
  | { k: "wrapEvent"; type: TypeDesc } // event handle, see below

  | { k: "inputSlot"; type: TypeDesc; slot: ValueSlotKey } // slot→SigId resolved by GraphRuntime

  | { k: "map"; type: TypeDesc; src: SigId; fn: number }
  | { k: "zip"; type: TypeDesc; a: SigId; b: SigId; fn: number }
  | { k: "select"; type: TypeDesc; cond: SigId; t: SigId; f: SigId }

  | { k: "transform"; type: TypeDesc; src: SigId; chain: number }

  | { k: "busCombine"; type: TypeDesc; busIndex: number; terms: SigId[]; combine: CombineSpec }

  | { k: "stateful"; type: TypeDesc; op: StatefulSignalOp; input?: SigId; stateOffset: number; paramsId?: number };

Key design choice: SigId is an integer index into nodes[]. This is what makes the evaluator fast and Rust-trivial.

⸻

2) Evaluation contract

A. “Sampling” API

export interface SigEvaluator {
  /** Sample a scalar-ish signal value at time t (ms). */
  sample<T>(id: SigId, env: SigEnv): T;

  /** Optional: sample a small struct into a preallocated out buffer (vec2/vec3/mat4). */
  sampleInto(id: SigId, env: SigEnv, out: Float32Array): void;
}

B. Evaluation environment (per frame)

export interface SigEnv {
  readonly tAbsMs: number;          // player time, monotonic
  readonly tModelMs: number;        // time after TimeModel mapping (loop/pingpong/window)
  readonly phase01: number;         // canonical phase for cyclic models
  readonly wrap: WrapInfo;          // wrap detection results for this frame
  readonly runtimeCtx: RuntimeCtx;  // viewport etc.
  readonly slotValues: SlotValueReader; // how inputSlot resolves
  readonly state: StateBuffer;      // typed state cells for stateful ops
  readonly cache: SigFrameCache;    // per-frame memoization
  readonly debug?: DebugSink;       // optional tracing
}

Important: tAbsMs never wraps (your current invariant). tModelMs/phase01 are derived deterministically by TimeModel.

⸻

3) Caching strategy (fast + predictable)

There are two caches you want, both compatible with power-user tracing.

A. Per-frame memo cache (mandatory)

Most signals will be reused by multiple consumers (multiple lenses, multiple fields, multiple render params). Within a frame, sampling the same SigId should be O(1) after first.

export interface SigFrameCache {
  frameId: number;
  // typed caches (fast path for number/boolean)
  num: Float64Array;     // size = nodes.length, filled with NaN as “unset”
  bool: Int8Array;       // -1 unset, 0 false, 1 true
  // struct caches by separate side tables
  vec2?: Float32Array;   // optional packed 2*N, with “valid” mask
  validMask: Uint8Array; // 0 unset, 1 set (for non-number domains)
}

Sampling rule: evaluator checks cache first; if miss, computes node, writes result, emits trace (optional), returns.

B. Cross-frame cache (optional, but plan for it)

Some expressions are expensive but stable across time (e.g., constant transforms). However, without an optimizer pass, it’s easy to do more harm than good.

Design for it with a conservative rule:
	•	Only cache nodes proven time-invariant and ctx-invariant.
	•	Determined at compile-time: node.purityTag = "static" | "time" | "ctx" | "state".

Then a second cache:

export interface SigStaticCache {
  // only for "static" nodes
  num?: Map<SigId, number>;
  // etc
}

This stays clean for Rust later too (memo tables keyed by SigId).

⸻

4) Evaluation algorithm (deterministic, instrumentation-friendly)

A. Core sampling loop (single entry)

When evaluating node id:
	1.	if cacheHit(id) return cached
	2.	switch node.k compute
	3.	write cache
	4.	if debug enabled, emit SigNodeEvaluated with:
	•	id, kind, type
	•	inputs ids
	•	time stamps or env tags
	•	value hash/summary (not full arrays)

B. Handling busCombine

Signal bus combine should be evaluable like any other node:
	•	terms are SigIds
	•	combine mode is pure (sum, max, last, etc.)

Pseudo semantics:
	•	sum/avg/max/min: evaluate all enabled terms; combine; if no terms -> silent default
	•	last/layer: evaluate in deterministic order (publisher sortKey order already baked into terms array), pick last

Trace detail: busCombine should optionally emit:
	•	per-term value summary
	•	final value
	•	ordering list

⸻

5) Transforms (adapters + lenses): representation and execution

A. TransformChain compiled form (no dynamic lookup)

A transform chain should be a compact instruction list, not “call arbitrary JS”.

export interface TransformTable {
  chains: TransformChain[];
}

export interface TransformChain {
  readonly steps: TransformStep[];
  readonly from: TypeDesc;
  readonly to: TypeDesc;
  readonly cost: "cheap" | "normal" | "heavy";
}

export type TransformStep =
  | { k: "cast"; op: CastOp }                        // no allocation
  | { k: "map"; fn: number; paramsId?: number }      // pure fn
  | { k: "normalize"; mode: "0..1" | "-1..1" }       // example
  | { k: "scaleBias"; scale: number; bias: number }  // common fast path
  | { k: "ease"; curveId: number }
  | { k: "quantize"; step: number }
  | { k: "slew"; stateOffset: number; rate: number } // stateful transform allowed but explicit
  ;

Rule: if a step needs memory (slew), it must carry stateOffset (allocated in StateLayout). Still no closures.

B. Execution

transform node executes:
	•	evaluate src
	•	run step list in order
	•	cache final

Trace: emit step-by-step only in power-debug modes; normal mode emits only chainId + output summary.

⸻

6) Stateful signal ops: explicit state buffer layout

A. StateLayout

Single contiguous buffer per type category:

export interface StateLayout {
  // offsets into typed arrays; stable across recompiles when possible (see hot-swap)
  f64: { size: number };     // numbers
  f32: { size: number };
  i32: { size: number };
  // optional: small structs packed into f32
  vec2: { size: number };    // count of vec2 cells
}

B. StateBuffer

export interface StateBuffer {
  f64: Float64Array;
  f32: Float32Array;
  i32: Int32Array;
}

Every stateful node points at a stateOffset and knows what typed region it uses.

This is the foundation for:
	•	determinism
	•	portable execution (Rust)
	•	correct debugger causality (“this node updated state cell X”)

⸻

7) Events in a signal world (wrap, triggers)

You have two viable representations:

Option 1 (recommended): “event signal” as a typed signal domain

Represent events as Signal<event> where sampling returns a small struct:

type EventSample = { fired: boolean; id?: number; payload?: unknown };

	•	wrapEvent returns fired=true on frames where wrapping occurred.
	•	Event combiners become deterministic (or, last, count, etc.).
	•	Works uniformly with caching.

Option 2: separate event stream system

More complex, and tends to leak into UI and compiler. I’d only do this if you need bursty multi-event per frame semantics.

Given your current system, Option 1 is the “right” choice: it keeps SignalExpr unified.

⸻

8) Rust/WASM readiness “by design”

If you adopt the above:
	•	SigNode[] becomes a Rust Vec<SigNode> with an enum
	•	evaluator becomes a tight match with memo arrays
	•	TransformChain becomes bytecode-ish; can be optimized later
	•	StateLayout becomes offsets into typed buffers (Vec<f64>, etc.)
	•	Debug tracing becomes writing records into a ring buffer

You are no longer hostage to JS closures, nor to “execute user JS”.

⸻

9) How this fits your current architecture (minimal friction)

You can land this without rewriting everything at once if you treat the closure world as an import step:
	•	Existing compilers that currently return Program<T> closures become:
	•	emit SigExpr DAG nodes instead of closures
	•	emit FieldExpr DAG nodes instead of closures
	•	The Player remains the same shape: program.signal(t, ctx) still exists, but internally it:
	•	builds SigEnv for frame
	•	samples required roots
	•	materializes fields required by render
	•	builds RenderTree

So the “front door” can stay stable while internals become IR-driven.

⸻

If you say Next, I’ll give you the full “compiled program” IR contract that the compiler must output (including: slot storage format, bus runtime table schema, DebugIndex schema, and the exact boundaries between compile-time graph and runtime evaluator).