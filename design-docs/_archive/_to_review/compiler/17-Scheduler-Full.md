C) Runtime scheduling semantics (signals, lazy fields, caches, materialization, hot swap)

This is the authoritative per-frame execution model for Oscilla once you adopt IR-based SignalExpr + FieldExpr (node tables), with no closures, lazy fields, and debuggable evaluation.

I’m defining:
	1.	runtime data layout
	2.	evaluation order per frame
	3.	caching rules (signals, fields, materialization)
	4.	state update semantics
	5.	bus combine semantics at runtime
	6.	hot swap semantics (no-jank) including state/caches preservation

⸻

1) Runtime data layout

1.1 CompiledProgram (what the runtime receives)

At runtime, you hold a single immutable compiled bundle plus mutable state/caches.

export interface CompiledProgram {
  readonly programId: string;          // stable hash of IR + registry versions
  readonly revision: number;           // patchRevision for UI sync

  // Canonical time topology for transport + exports
  readonly timeModel: TimeModel;

  // Dense node tables
  readonly signalIR: SignalIRTable;
  readonly fieldIR: FieldIRTable;
  readonly renderIR: RenderIRTable;

  // Index maps (for debugger + UI)
  readonly debugIndex: DebugIndex;

  // Entry points
  readonly entry: {
    readonly renderSinkIds: readonly number[];   // typically 1
    readonly busSigIdsByBus: readonly (SigId | null)[];   // optional, if you expose buses to UI
    readonly busFieldIdsByBus: readonly (FieldId | null)[];
  };

  // State layout
  readonly stateLayout: StateLayoutPacked;       // all state slots, densely packed
  readonly stateKeyByNode: readonly (StateKey | null)[]; // map node->state slot info if stateful

  // Optional: canonical materialization plan for each render sink
  readonly materializationPlans: readonly MaterializationPlan[];
}

Key principle: compiled program is immutable; all mutability lives in RuntimeState.

⸻

1.2 RuntimeState (mutable, per running instance)

export interface RuntimeState {
  // Current time in ms (monotonic or controlled by transport)
  tMs: number;

  // Persistent state buffers (for stateful ops)
  state: StateBuffer;          // typed arrays / arraybuffer slices

  // Per-frame caches (reset each frame)
  frame: FrameCache;

  // Cross-frame caches (optional, must be swap-safe)
  memo: MemoCache;

  // Diagnostics channels
  trace?: TraceSink;
  stats: RuntimeStats;
}

export interface FrameCache {
  frameId: number;

  // Signal node values computed this frame
  sigValue: Float64Array;         // length = signalIR.count (or tagged union storage)
  sigStamp: Uint32Array;          // last frameId computed; 0 means "unset"

  // Field node “handles” computed this frame (not materialized arrays)
  fieldHandle: FieldHandle[];     // length = fieldIR.count
  fieldStamp: Uint32Array;

  // Materialized field buffers (actual arrays), keyed by (fieldId, domainId, format)
  fieldBuffers: FieldBufferPool;

  // Render sink outputs (optional)
  renderTree?: unknown;
}

export interface MemoCache {
  // Optional, controlled by policy: e.g. expensive static fields that are time-invariant
  // Must include invalidation keys for time/seed/viewport/domain changes.
  entries: Map<string, unknown>;
}

Design choice: signals are cheap and computed by value; fields are computed as handles/plans and only materialize on demand.

⸻

2) Evaluation order per frame (high level)

The runtime executes a frame in four phases:
	1.	Transport: determine effective tMs from TimeModel and user controls
	2.	Signal pass: evaluate all signal nodes required by render sinks (and optionally bus visualizers)
	3.	Field pass (lazy): produce field handles; materialize only for render sinks
	4.	Render pass: build render output from materialized buffers + remaining metadata

Critically: you do not “evaluate everything.” You evaluate from entrypoints and cache.

⸻

3) The scheduling algorithm (exact)

3.1 Frame entry

function renderFrame(rt: RuntimeState, prog: CompiledProgram, env: RuntimeEnv): RenderOutput {
  // (A) advance frame
  rt.frame.frameId++;

  // (B) set runtime env (viewport, dpr, inputs, etc.)
  envApply(rt, env);

  // (C) resolve effective time based on transport/timeModel
  const t = resolveTime(rt.tMs, prog.timeModel, env.transport);
  // keep rt.tMs monotonic if you want; “effective time” can wrap for cyclic windows
  const tEff = t.effectiveMs;

  // (D) evaluate render sinks
  const out = evalRenderSinks(rt, prog, tEff, env);

  // (E) emit stats/trace
  emitStats(rt, prog);

  return out;
}

resolveTime() semantics

TimeModel is authoritative. Transport controls play/pause/scrub/speed.
	•	finite: clamp or stop at duration, emit cue events as diagnostics
	•	cyclic: wrap/pingpong in effective time, but do not implicitly reset state
	•	infinite: monotonic effective time (or windowed for UI); no wrapping

Rule: time wrapping is a view; stateful nodes must explicitly decide how to react (see §6).

⸻

3.2 Render sink evaluation drives everything

function evalRenderSinks(rt, prog, tMs, env) {
  const sinks = prog.entry.renderSinkIds;
  const outputs = [];

  for (const sinkId of sinks) {
    const plan = prog.materializationPlans[sinkId];
    outputs.push(evalRenderSink(rt, prog, sinkId, plan, tMs, env));
  }

  return combineRenderOutputs(outputs);
}


⸻

4) Signal evaluation (node interpreter)

Signals are evaluated by a memoizing interpreter (per-frame cache).

4.1 Signal node data (conceptual)

Each SignalIRNode includes:
	•	op (enum)
	•	args: SigId[]
	•	constId?
	•	stateKey? (if stateful)
	•	typeDesc
	•	prov (debug index pointer)

4.2 Signal evaluation function

function evalSig(rt: RuntimeState, prog: CompiledProgram, sigId: SigId, tMs: number): number {
  if (rt.frame.sigStamp[sigId] === rt.frame.frameId) return rt.frame.sigValue[sigId];

  const node = prog.signalIR.nodes[sigId];
  let v: number;

  switch (node.op) {
    case 'Const':
      v = getConstNumber(prog, node.constId);
      break;

    case 'Add':
      v = evalSig(rt, prog, node.args[0], tMs) + evalSig(rt, prog, node.args[1], tMs);
      break;

    case 'Sin':
      v = Math.sin(evalSig(rt, prog, node.args[0], tMs));
      break;

    case 'CombineSum': {
      let sum = 0;
      for (const a of node.args) sum += evalSig(rt, prog, a, tMs);
      v = sum;
      break;
    }

    case 'StatefulIntegrate':
      v = evalStatefulIntegrate(rt, prog, node, tMs);
      break;

    // … all other ops …
  }

  // Post: NaN/Inf handling (debugger + health snapshot)
  v = sanitizeNumber(v, rt, node);

  rt.frame.sigValue[sigId] = v;
  rt.frame.sigStamp[sigId] = rt.frame.frameId;
  return v;
}

4.3 Determinism rule

Given:
	•	same IR tables
	•	same inputs (seed, viewport, external IO samples)
	•	same timeModel effective time
the output must be bitwise-stable (modulo FP nondeterminism across platforms).

That means:
	•	no iteration over Map/Set unless stabilized
	•	publisher ordering is already lowered deterministically in IR (sortKey applied by compiler)

⸻

5) Field evaluation (lazy handles + materialization)

5.1 FieldIR nodes evaluate to a FieldHandle

A FieldHandle is not “an array.” It’s a recipe with enough structure for:
	•	materialization (to typed arrays)
	•	fusion (combine/zip/map without intermediate buffers)
	•	debug trace (who contributed)

export type FieldHandle =
  | { kind: 'Const'; constId: number; type: TypeDesc }
  | { kind: 'Op'; op: FieldOp; args: readonly FieldId[]; type: TypeDesc }
  | { kind: 'Zip'; op: FieldZipOp; a: FieldId; b: FieldId; type: TypeDesc }
  | { kind: 'Broadcast'; sigId: SigId; domainId: number; type: TypeDesc }
  | { kind: 'Combine'; mode: BusCombineMode; terms: readonly FieldId[]; type: TypeDesc }
  | { kind: 'Source'; sourceTag: string; payloadId: number; type: TypeDesc };

5.2 evalField returns a handle, memoized per frame

function evalFieldHandle(rt, prog, fieldId: FieldId, tMs): FieldHandle {
  if (rt.frame.fieldStamp[fieldId] === rt.frame.frameId) return rt.frame.fieldHandle[fieldId];

  const node = prog.fieldIR.nodes[fieldId];
  let h: FieldHandle;

  switch (node.op) {
    case 'Const':
      h = { kind: 'Const', constId: node.constId, type: node.type };
      break;

    case 'ZipAdd':
      h = { kind: 'Zip', op: 'Add', a: node.args[0], b: node.args[1], type: node.type };
      break;

    case 'Broadcast':
      h = { kind: 'Broadcast', sigId: node.sigArg, domainId: node.domainId, type: node.type };
      break;

    case 'Combine':
      h = { kind: 'Combine', mode: node.combineMode, terms: node.args, type: node.type };
      break;

    default:
      h = { kind: 'Op', op: node.op, args: node.args, type: node.type };
  }

  rt.frame.fieldHandle[fieldId] = h;
  rt.frame.fieldStamp[fieldId] = rt.frame.frameId;
  return h;
}

Notice: time is not an argument to the handle. Time sensitivity is expressed through any Broadcast(sigId) handles and domain-dependent sources. Materialization will evaluate signals as needed.

⸻

5.3 Materialization: when a render sink requests arrays

Render sinks declare required buffers with:
	•	fieldId
	•	domainId
	•	format (f32, vec2f32, rgba8, etc.)
	•	layout (AoS/SoA)
	•	usage (positions, radii, color, etc.) for debug labels

export interface MaterializationRequest {
  readonly fieldId: FieldId;
  readonly domainId: number;
  readonly format: BufferFormat;
  readonly layout: BufferLayout;
  readonly usageTag: string;     // 'pos', 'radius', ...
}

Central rule

All field buffers are materialized in one place (the Materializer), never inside random blocks.

The Materializer algorithm (fusion-first)

When asked to materialize (fieldId, domainId, format):
	1.	check per-frame buffer pool cache
	2.	build a materialization plan by walking the handle DAG
	3.	emit a fused kernel if possible (JS loop today; WASM later)
	4.	fill a typed array from 0..N-1
	5.	store buffer in pool for this frame

function materialize(rt, prog, req: MaterializationRequest, tMs: number): ArrayBufferView {
  const key = bufferKey(req);
  const cached = rt.frame.fieldBuffers.get(key);
  if (cached) return cached;

  const handle = evalFieldHandle(rt, prog, req.fieldId, tMs);
  const N = getDomainCount(rt, prog, req.domainId, tMs);

  const out = rt.frame.fieldBuffers.alloc(req.format, N, req.layout);

  // Fusion: interpret handle tree into a tight loop with minimal temps
  runFusedKernel(rt, prog, handle, req.domainId, tMs, out);

  rt.frame.fieldBuffers.set(key, out);
  return out;
}

Broadcast semantics

Broadcast(sigId) materializes by:
	•	evaluating sigId once (cached by signal pass)
	•	filling all N entries with that scalar/vec2/color

⸻

6) Stateful nodes + time wrapping: the “no surprise resets” rule

This is where most looping systems go wrong.

6.1 State does not reset just because time wraps

In cyclic time models, effective time may wrap/pingpong. State buffers are not reset automatically.

Why:
	•	predictable live editing
	•	stable long-running systems
	•	avoids discontinuities unless explicitly requested

6.2 Explicit “wrap events” are signals

If you want stateful behaviors to react to wraps, the time root emits explicit wrap/edge signals (or buses), e.g.:
	•	pulse (trigger) on wrap
	•	cycleIndex (integer) incremented on wrap
	•	phase (0..1) continuous

Stateful nodes can subscribe to these to reset, latch, or re-seed deterministically.

6.3 State update order

Stateful ops update only after all their dependencies for the frame are available. In practice:
	•	evalSig(statefulNode) reads prior state and writes next state atomically
	•	each state slot has:
	•	current buffer
	•	next buffer (or ping-pong inside one buffer with a frame tag)

This guarantees:
	•	deterministic state transitions even if a value is requested multiple times in a frame

⸻

7) Bus values at runtime (how they “live”)

There are two legitimate choices; the spec chooses one:

Chosen rule: buses are compiled away into node IDs

At runtime, a bus is just:
	•	SigId for signal buses
	•	FieldId for field buses

The runtime may still keep a bus index for debugging/UI visualizers, but it does not “store bus values” separately.

That means:
	•	publisher eval + combine are already represented by Combine nodes
	•	adapter/lens chains are already nodes in IR
	•	listener application is just “the input’s ValueRef points at that bus SigId/FieldId”

So “bus value storage” = sigValue[sigId] and field handle caches for fieldId.

This is ideal for:
	•	Rust port (no dynamic maps)
	•	debugger (everything is a node)
	•	optimization (CSE, fusion, dead-code elimination)

⸻

8) Performance policy (what’s cached where)

8.1 Per-frame only by default
	•	signal values cached per frame (sigStamp)
	•	field handles cached per frame (fieldStamp)
	•	materialized buffers cached per frame (pool)

This guarantees:
	•	no stale data bugs
	•	no invalidation complexity
	•	stable memory footprint per frame

8.2 Cross-frame memoization is opt-in and structural

Only memoize when a node is provably time-invariant (or depends only on slow-changing inputs).
Mechanisms:
	•	compiler tags nodes with dependsOnTime: boolean
	•	runtime can memoize buffers for nodes with dependsOnTime=false and fixed domain

But: you must include invalidation keys:
	•	patch revision / programId
	•	domain size changes
	•	seed changes
	•	viewport changes
	•	external IO changes

Given your “performance testing less priority than optimizing” stance, I’d still implement only the per-frame caches first because they are guaranteed correct and already unlock most wins (fusion + no repeated materializations).

⸻

9) No-jank hot swap (program replacement rules)

Hot swap is where “closures everywhere” hurts. With IR, it’s clean.

9.1 Two-phase swap
	1.	compile new CompiledProgram off the render thread (or at least outside frame deadline)
	2.	swap pointer at a frame boundary

9.2 State preservation contract (layout-hash)

When swapping from oldProg → newProg:
	•	compute StateLayoutPacked.hash
	•	preserve state slots whose (stableKey, layoutHash) match
	•	initialize new slots with defaults
	•	drop removed slots

StableKey definition

A state slot’s stable key is derived from:
	•	block instance identity (editor blockId or a stable lowered id)
	•	output port identity
	•	stateful node role (e.g. integrate accumulator, delay ring buffer)
	•	optional user-visible name

If you rewrite block graphs heavily, you can still preserve state if you preserve these stable keys through lowering.

9.3 Cache preservation

Per-frame caches are discarded on swap. That’s fine; they’re cheap.

Cross-frame memo cache is preserved only if:
	•	programId matches (same compiled program)
Otherwise discard. Never reuse memo across different IR unless you also have a node-equivalence mapping (not worth it initially).

9.4 Anti-jank rule for topology changes

If the timeModel kind changes (finite↔cyclic↔infinite):
	•	transport changes effective time mapping immediately
	•	state is not reset unless the time root emits a reset pulse and the patch uses it

This ensures live edits don’t “pop” unless the patch explicitly asks for it.

⸻

10) Putting it together: what happens each frame

Minimal “correct + fast” schedule:
	1.	frameId++
	2.	compute effective time from TimeModel + transport
	3.	evaluate render sink:
	•	evaluate required signals via evalSig (cached)
	•	evaluate required fields via evalFieldHandle (cached)
	•	materialize required fields via materialize (fused kernels)
	4.	build render output from typed buffers
	5.	emit stats + optional trace events

Everything is driven by dense indices. No Maps in the hot path (except optional memo).

⸻

If you say Next, I’ll give you D) Debug instrumentation points for this IR runtime: exactly where to emit trace events (node begin/end, cache hit/miss, materialization reasons, bus combine steps), and the minimal overhead way to do it so the debugger doesn’t become the performance problem.