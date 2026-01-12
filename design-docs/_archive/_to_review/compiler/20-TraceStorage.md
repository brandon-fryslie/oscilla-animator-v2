Power-user debugger (next part): Trace storage, indexing, and causal links

Your evidence pack makes two constraints non-negotiable:
	1.	There is no centralized evaluator; everything is a composed closure tree, so probes must be injected at compile time by wrapping closures.  ￼
	2.	At runtime there is no value container (no “latest bus values”, no “latest block outputs”); the Player calls program.signal(...), hands the tree to onFrame, then forgets it.  ￼

So the debugger’s job is to (a) create a stable numeric indexing layer at compile time, then (b) stream events into ring buffers at runtime, and (c) reconstruct “why” (causal links) without doing expensive string work per frame.

⸻

1) Compile-time indexing layer (string keys → numeric ids)

1.1 Canonical keys you already have
	•	Port outputs are keyed as ${blockId}:${portName} in compiledPortMap.  ￼
	•	Publishers/listeners also reference endpoints by blockId + slotId (string).  ￼
	•	There is no numeric output indexing today.  ￼

1.2 DebugIndex (produced during compilation, attached to CompileResult)

Create a deterministic, immutable index object:

type PortKey = string; // `${blockId}:${port}`
type BusKey  = string; // `bus:${busId}`
type NodeKey = string; // `node:${nodeId}` (IR node id if you have it), else use PortKey

interface DebugIndex {
  // Stable within a compileId
  readonly compileId: string;
  readonly patchRevision: number;

  // Interner tables
  readonly portKeyToId: ReadonlyMap<PortKey, number>;
  readonly portIdToKey: readonly PortKey[];

  readonly busIdToId: ReadonlyMap<string, number>;
  readonly busIdxToBusId: readonly string[];

  // Optional: if you model adapters/lenses as nodes
  readonly stepKeyToId: ReadonlyMap<string, number>;   // e.g. `${bindingId}#step:${i}`
  readonly stepIdToKey: readonly string[];

  // Causal graph edges (see §4)
  readonly deps: DebugDeps;
}

How to build it (single pass, compile-time):
	•	When you do compiledPortMap.set(keyOf(blockId, outDef.name), produced), also:
	•	internPort(key) → portId
	•	record (blockId, portName, kind) metadata if needed for UI grouping
	•	When you assemble bus values in getBusValue(...) (which reads from compiledPortMap and returns a combined artifact), also:
	•	internBus(busId) → busIdx
	•	record which portIds are the publishers for this bus in sorted order (this becomes a causal dependency list)
	•	When you apply adapter/lens chains (where you wrap applyAdapterStep / def.apply), also:
	•	internStep(bindingId + stepIndex) so steps can be traced without strings per frame

This matches your own “build a compile-time index then use typed arrays” recommendation.  ￼

⸻

2) Runtime trace buffers (ring buffers, typed arrays, zero-GC hot path)

2.1 Two-tier buffering: “hot numeric” + “cold payload”

Most debug events should be representable as numbers:
	•	time tMs
	•	frame index
	•	“subject id” (portId / busId / stepId)
	•	duration
	•	flags (cache hit/miss, NaN, clamped, etc.)
	•	small numeric samples (e.g., scalar signal value)

Anything heavy (arrays, strings, RenderTree) must go into a separate, opt-in payload store keyed by eventId, so the default tracer stays fast.

2.2 Core ring buffers

A) SpanRing (timing)
For “how long did this take?” on every interesting evaluation (signal sample, field materialization, combine, adapter step).

interface SpanRing {
  // capacity is power-of-two for cheap modulo
  readonly cap: number;
  writePtr: number;

  // columns
  frame: Uint32Array;     // frame counter
  tMs: Float64Array;      // absolute time in ms
  kind: Uint16Array;      // enum TraceKind
  subject: Uint32Array;   // portId / busId / stepId (interpret by kind)
  parent: Uint32Array;    // causal parent eventId (0 = none)
  durUs: Uint32Array;     // duration in microseconds (or ns split hi/lo)
  flags: Uint32Array;     // bitfield
}

B) SampleRing (values)
For scalar-ish values you want to plot (phase, energy, pulse count, radius signal, etc.).

interface SampleRing {
  readonly cap: number;
  writePtr: number;

  frame: Uint32Array;
  tMs: Float64Array;
  subject: Uint32Array;   // usually portId or busId
  v0: Float64Array;       // scalar, or x component
  v1: Float64Array;       // y component (optional)
  v2: Float64Array;       // z component (optional)
  flags: Uint32Array;     // NaN, Inf, clamped, quantized, etc.
}

C) EventRing (discrete events)
For wrap/pulse events, compile swaps, errors surfaced mid-frame, etc.

interface EventRing {
  readonly cap: number;
  writePtr: number;

  frame: Uint32Array;
  tMs: Float64Array;
  kind: Uint16Array;      // WrapEvent, PulseEvent, ProgramSwapped, ErrorRaised...
  subject: Uint32Array;   // portId/busId/etc
  a: Uint32Array;         // event-specific small fields
  b: Uint32Array;
  flags: Uint32Array;
}

2.3 PayloadStore (cold path)

Only used when the UI asks for “show me the actual arrays” or “dump the render tree”.
	•	Keys by eventId (monotonic global counter).
	•	Stores:
	•	small JSON-ish objects
	•	Field materialization summaries (N, element type, min/max, hash)
	•	optional sampled slices of big arrays (first 32 elements, or reservoir sample)

No one should be able to accidentally turn on “store every Field array every frame”.

⸻

3) Probe wrappers (how events actually get written)

Because:
	•	buses combine at compile time, and the combined closure is injected into listeners  ￼
	•	fields materialize lazily inside render sinks  ￼
	•	and there’s currently no caching (so recomputation is rampant)  ￼

…your wrappers must be extremely cheap and must not allocate.

3.1 Wrap Signal closures

Whenever an Artifact is a Signal:* (a function (tMs, ctx) => value), replace it with:
	•	beginSpan(kind=SignalEval, subject=portId, parent=currentParent)
	•	evaluate original
	•	endSpan(dur)
	•	optionally emitSample(...) for scalar/vec2/phase/color (depending on UI subscriptions)
	•	return value

3.2 Wrap combine results

In combineSignalArtifacts(...) / combineFieldArtifacts(...), wrap the returned closure so you can trace:
	•	each publisher evaluation (as nested spans)
	•	combine duration
	•	final combined output sample

This is where “why” starts: the bus output span’s children are publisher spans in sortKey order.

3.3 Wrap adapter/lens steps

Where adapter/lens chains are applied (your evidence suggests applyAdapterStep and def.apply are the natural hook points)  ￼
Wrap each step as its own span:
	•	subject = stepId
	•	parent = the binding span or the bus combine span
	•	optionally record before/after samples for scalars (not arrays)

3.4 Wrap Field materialization sites

Because Field is (_seed, n, ctx) => readonly T[] and is invoked inside RenderInstances2D.renderFn  ￼
You instrument at the call sites in render sinks:
	•	positions = traceFieldCall(fieldId, () => positionField(seed, n, ctx))
	•	record N, duration, and an inexpensive summary:
	•	min/max for number fields
	•	bounding box for vec2/vec3
	•	hash (xxhash of a small sample) to detect “same output recomputed”

⸻

4) Causal links (the “why did this change?” graph)

You don’t have runtime containers, so causal reconstruction must be captured from closure composition order at compile time, then linked at runtime via event parent pointers.

4.1 DebugDeps (static dependency graph)

Produced during compilation:

interface DebugDeps {
  // For each portId, what upstream subjects does it depend on?
  // (port outputs depend on their input ports, plus bus nodes, plus literal/default sources)
  readonly portDeps: readonly number[][];

  // For each busId, publisher portIds in the exact combine order
  readonly busPublishers: readonly number[][];

  // For each binding step, input subject id (prev step) and output subject id (next step)
  readonly stepChain: readonly { inId: number; outId: number }[];
}

If you later move to the IR you’ve been designing, this becomes even cleaner:
	•	each IR node already has explicit inputs
	•	causal edges are just node -> node

4.2 Runtime causal chain (dynamic)

At runtime, every span event written into SpanRing contains:
	•	parent = eventId of the caller context
	•	so you can reconstruct the dynamic call tree per frame

This gives you both:
	•	static “what could affect this”
	•	dynamic “what actually ran and how long it took”

⸻

5) Mandatory architecture change (because you said “do it right”)

Right now, everything recomputes and the render sinks even use a no-op geom cache.  ￼
A power-user debugger without cache visibility will constantly mislead.

So the spec requires a DebuggerCacheLayer that is always present (even if disabled), because tracing must distinguish:
	•	value changed vs recomputed same value
	•	field rematerialized vs cache hit
	•	bus combine reran vs reused previous combined closure output

Required change:
	•	Introduce per-frame memoization for:
	•	signal samples (by subjectId + tMs quantization bucket)
	•	field materializations (by fieldId + n + seed + “dirty version”)
	•	When disabled, it behaves as pass-through, but still emits “miss” flags so the debugger stays honest.

(You can implement memoization either in the IR evaluator or by wrapping closures—either way, the debugger must see it.)

⸻

6) Integration points with your existing compile/runtime events

You already emit:
	•	CompileStarted, CompileFinished
	•	ProgramSwapped with patchRevision and compileId  ￼

The debugger must listen to these and:
	•	rotate trace buffers on ProgramSwapped (new epoch)
	•	attach DebugIndex for that compileId
	•	keep old epochs accessible (power users will compare revisions)

⸻

If you say Next, the next section I’ll write is the exact TypeScript API and module boundaries for:
	•	DebuggerRuntime (owner of rings + payload store)
	•	DebugCompilerHooks (how compileBusAware exports an instrumented Program)
	•	TraceController (subscriptions so you only emit samples the UI is actually plotting)
	•	and the “always-on cache layer” interface so it’s portable to Rust later.