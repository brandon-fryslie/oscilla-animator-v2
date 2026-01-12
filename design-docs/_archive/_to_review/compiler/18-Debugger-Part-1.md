Below is the power-user debugger instrumentation plan inside the IR—with ring buffers, event schemas, and causal links—grounded in what your engine does today (closure composition, string-keyed ports, compile-time bus combine, runtime eval)  ￼  ￼  ￼.

I’m going to assume the “new architecture” we discussed exists: Program = IR + schedule + evaluator, not a ball of closures. But I’ll keep every instrumentation point mapped to the existing realities you proved in the evidence pack so nothing is fantasy.

⸻

0) Non-negotiable invariants the debug engine must respect
	1.	Program evaluation is per-frame via program.signal(tMs, ctx) today.  ￼
	2.	Outputs are string keyed ("${blockId}:${port}") today.  ￼
	3.	Bus combine is compile-time composition → runtime sampling happens inside the combined closure.  ￼
	4.	Field materialization happens in render sinks (e.g. RenderInstances2D.renderFn calling field(seed,n,ctx)), and arrays are plain JS arrays today.  ￼

So: the IR must be able to represent (a) bus combines explicitly, (b) adapter/lens pipelines explicitly, and (c) field materialization sites explicitly—because those are the only places “why did this happen?” can be answered.

⸻

1) Compile-time debug index: make everything numeric before runtime

1.1 Stable keys

You already have stable keys like ${blockId}:${portName}.  ￼

1.2 DebugIndex (built at compile)

Create and ship alongside the IR:

type PortKey = string; // `${blockId}:${portName}`

interface DebugIndex {
  compileId: string;           // already emitted on ProgramSwapped  [oai_citation:8‡DEBUGGER-ARCHITECTURE-FACTS.md](sediment://file_00000000467c722f8d1a89cbe4711ab1)
  patchId: string;
  patchRevision: number;

  // Dense numeric ids for runtime
  portKeyToId: Map<PortKey, u32>;
  blockIdToId: Map<string, u32>;
  busIdToId: Map<string, u32>;
  adapterDefToId: Map<string, u32>;  // canonical adapter ids
  lensDefToId: Map<string, u32>;     // canonical lens ids

  // Reverse lookup for UI
  idToPortKey: PortKey[];
  idToBlockId: string[];
  idToBusId: string[];

  // For causal graph reconstruction
  nodeIdToIRSpan: IRSpanMeta[];      // “this value came from IR node X”
}

Why: ring buffers and per-frame tracing must be numeric; string keys are for UI only. Your evidence pack explicitly calls this out as required for high-frequency sampling.  ￼

⸻

2) The IR must expose explicit “evaluation sites” as nodes

Your closures currently hide structure (combine, adapter, lens, sampling). For a real debugger, the IR must not.

2.1 Canonical IR node kinds that matter for debugging

These are the instrumentation anchor points:

A) Block evaluation boundary
	•	IR.BlockEval – represents “evaluate block X outputs”
	•	even for “pure” blocks, you still want timing & NaN/Inf detection.

B) Port value creation
	•	IR.PortValue – “the value of port P is produced here”
	•	This is where you attach provenance and type info.

C) Bus pipeline (must be explicit)
	•	IR.BusRead(busId)
	•	IR.BusPublish(pubId, fromPortId)
	•	IR.BusCombine(busId, mode, inputs[])
	•	mode = sum/last/… (your combine semantics)
	•	IR.BusDefault(busId)

This matches your current compile-time getBusValue() and combineSignalArtifacts() but makes each step visible.  ￼

D) Adapter / Lens pipeline (stepwise)
	•	IR.ApplyAdapter(stepId, inputValue)
	•	IR.ApplyLens(stepId, inputValue)
	•	IR.ApplyStack(stackId, steps[], inputValue)

Your evidence pack shows “wrap applyAdapterStep / lens apply” is hookable today.  ￼

E) Signal sampling site
	•	IR.SampleSignal(signalValueId, tSource)
tSource references TimeRoot outputs.

F) Field materialization site
	•	IR.MaterializeField(fieldValueId, domainId, seedId, nId)
	•	and the consumer reason: positions/colors/radii/etc.
This corresponds exactly to the render sink calls you showed.  ￼

G) Render sink boundary
	•	IR.RenderSinkEval(sinkBlockId, inputs...)
	•	IR.EmitRenderTree(rootNodeId)

⸻

3) Runtime instrumentation model: spans + events, all in ring buffers

You want both:
	•	streaming “what happened?” events
	•	queryable “why?” causal graph

Do both with the same primitive: spans.

3.1 Span model

A span is a timed interval with parent-child relationships (causal nesting):

type SpanId = u32;

interface SpanHeader {
  spanId: SpanId;
  parentSpanId: SpanId;      // 0 = none (frame root)
  frameId: u32;              // increments each rendered frame
  tMs: f64;                   // current time
  kind: SpanKind;             // enum
  subjectId: u32;             // blockId/busId/portId/etc depending on kind
  aux0: u32; aux1: u32;       // e.g. combineMode, adapterId, lensId, etc.
  startNs: u64;
  endNs: u64;
  flags: u32;                 // NaN/Inf/clamped/cacheHit/etc
}

3.2 Ring buffer design (NO allocations per event)

Use three fixed-size ring buffers:
	1.	SpanRing: fixed-size SpanHeader[]
	2.	ValueRing: fixed-size numeric samples (optional, decimated)
	3.	EdgeRing: causal links between produced values (for “why”)

3.2.1 SpanRing
Stores every span (cheap). Size: e.g. 200k spans (rolling).

3.2.2 ValueRing (power-user knob)
Stores selected values:
	•	scalar samples (numbers, phase)
	•	small vec2/vec3 samples
	•	hashes / stats for Fields (not full arrays by default)

interface ValueRecord {
  spanId: u32;
  valueKind: u16;        // number/phase/vec2/color/etc
  encoding: u16;         // raw, quantized, histogram, hash
  a: f64; b: f64; c: f64; d: f64; // payload or params
}

3.2.3 EdgeRing (causal graph)
A causal edge is “this output depended on these inputs”.

interface CausalEdge {
  frameId: u32;
  producedValueId: u32;     // a PortId or BusValueId
  producingSpanId: u32;     // where it was produced
  inputValueId: u32;        // upstream PortId/BusValueId
  inputSpanId: u32;         // upstream span (if known)
  relation: u16;            // enum: Wire, BusCombine, Adapter, Lens, Sample, Materialize
  ordinal: u16;             // input index
}

This is the “nails in the coffin” piece: it gives you a reconstructable DAG per frame even if evaluation is closure-based today—because you record relations at the IR node boundary.

⸻

4) Exact instrumentation points inside the IR evaluator

Assume an evaluator that walks a scheduled list of IR nodes (topo order). Instrument only these points:

4.1 Frame root

At start of program.signal(tMs, ctx):
	•	Span(FrameEval) begins
	•	attach compileId / patchRevision out-of-band (already available via ProgramSwapped).  ￼

At end:
	•	Span(FrameEval) ends
	•	emit frame summary (counts, budget, worst spans), similar to your RuntimeHealthSnapshot concept but sourced from spans.  ￼

4.2 BlockEval spans

When evaluating IR.BlockEval(blockId):
	•	begin Span(BlockEval, blockId)
	•	end after outputs are produced
	•	flags:
	•	HAS_NAN, HAS_INF
	•	TYPE_COERCION_OCCURRED (if any)
	•	AUTO_ADAPTER_INSERTED (if any)

4.3 Bus pipeline spans

When evaluating a bus value:
	1.	Span(BusRead, busId)
	2.	For each publisher input:
	•	Span(BusPublishEval, pubId) (this is where you sample the publisher’s output value)
	•	record causal edge: produced bus input ← publisher port
	3.	Span(BusCombine, busId, combineMode)
	•	record edges: busValue ← each publisherInput (relation=BusCombine, ordinal=i)
	4.	If default used:
	•	Span(BusDefault, busId) + edge busValue ← default

This mirrors what happens today (publisher artifacts collected, combined into one closure) but makes each part observable.  ￼

4.4 Adapter/Lens spans (stepwise, not monolithic)

For IR.ApplyStack(steps…):
	•	start Span(AdapterStack|LensStack, stackId)
	•	for each step:
	•	Span(ApplyAdapterStep, adapterId) or Span(ApplyLensStep, lensId)
	•	record edge: outputValue ← inputValue (relation=Adapter/Lens, ordinal=stepIndex)
	•	optionally capture before/after sample in ValueRing (decimated)

This directly aligns with your hookable functions today.  ￼

4.5 Signal sampling spans

For IR.SampleSignal(signalValueId, tSource):
	•	Span(SampleSignal, signalValueId)
	•	record edge: sampledValue ← signalValueId (relation=Sample)
	•	optionally store sampled scalar value in ValueRing

4.6 Field materialization spans (the real cost center)

For IR.MaterializeField(fieldValueId, domainId, seedId, nId):
	•	Span(MaterializeField, fieldValueId)
	•	capture:
	•	n
	•	elapsed time
	•	arrayKind (plain vs typed)
	•	stats: min/max/mean, NaN count (cheap single pass if you’re already iterating)
	•	record edge: materializedArray ← fieldValueId (relation=Materialize)

This is exactly where you said probes must go today (RenderInstances2D).  ￼

4.7 Render sink spans

For IR.RenderSinkEval(RenderInstances2D…):
	•	Span(RenderSinkEval, blockId)
	•	inside it, it will cause field materializations and signal samples; those nest.
	•	record edge: RenderTree ← sink outputs

⸻

5) Event schema exposed to the power-user UI

The UI should not read raw rings directly; it should subscribe to a decoded stream that is still low-level and lossless.

5.1 “Decoded event” types (stable contract)

These are derived from spans + rings:
	•	Dbg.Frame(frameId, tMs, compileId, patchRevision)
	•	Dbg.SpanBegin(spanHeader)
	•	Dbg.SpanEnd(spanHeader)
	•	Dbg.ValueSample(valueRecord) (optional stream)
	•	Dbg.CausalEdge(edgeRecord) (optional stream)
	•	Dbg.FrameSummary(frameId, totals, worstSpans[])

5.2 Query APIs (random access)

Power users need drill-down, not just stream:
	•	getFrame(frameId) -> SpanTree
	•	getSpan(spanId) -> Span + children + value samples
	•	getUpstream(valueId, frameId, depth) -> subgraph
	•	getDownstream(valueId, frameId, depth) -> subgraph
	•	getBusTrace(busId, frameRange) -> combine inputs + timing
	•	getMaterializations(frameRange, sortBy=cost)

⸻

6) Causal links: how you guarantee “why” is correct

A debugger becomes useless if causal edges are guessed. Here, edges are produced when the evaluator performs the operation—so they are factual.

6.1 Where edges are emitted (exactly)

Emit a CausalEdge only at these operations:
	•	Wire read / write (PortValue produced from another PortValue)
	•	BusPublishEval (publisher port → bus input)
	•	BusCombine (publisher inputs → bus output)
	•	Adapter step (before → after)
	•	Lens step (before → after)
	•	SampleSignal (signal closure → sampled scalar)
	•	MaterializeField (field closure → realized array)
	•	RenderSink output (inputs → RenderTree)

Everything else is derived.

6.2 Value identity

To avoid ambiguity:
	•	Port values are identified by portId from DebugIndex.
	•	Bus values are identified by a synthetic busValueId = hash(frameId,busId) or an indexed “bus output id” per frame.
	•	Intermediate values (adapter outputs, combine temporaries) get ephemeral ids scoped to (frameId, spanId, ordinal).

That makes the DAG reconstructable without allocating object identities.

⸻

7) How this maps to your current closure world (so you can migrate cleanly)

Today, “instrumentation must wrap closures during compilation” is true.  ￼
But under the IR model, those wrappers disappear and become evaluator-level.

Bridge strategy (architecturally correct, not a hack):
	•	Step 1: Compile to IR nodes that still call closures as leaf ops.
	•	Step 2: Move more logic from closures into IR ops (bus combine, adapters, lenses, operators).
	•	Step 3: Eventually closures only exist at the very bottom (math kernels), which is exactly what you want for a Rust port.

This is the “do it right” path: it gives you a stable debugger contract and makes Rust/WASM realistic because evaluation becomes a schedule over data, not arbitrary JS closures.

⸻

8) Minimal ring sizes + performance knobs (so it won’t tank FPS)

Power-user debug must be able to run in three modes:
	1.	OFF: zero overhead (all instrumentation compiled out)
	2.	TIMING ONLY: spans only (cheap, no values)
	3.	FULL TRACE: spans + causal edges + selected values + field stats

Knobs:
	•	traceEveryNFrames
	•	captureValues: none | scalars | scalars+vec | includeColors
	•	fieldCapture: statsOnly | sampleK | fullArrays (explicitly dangerous)
	•	maxSpansPerFrame hard cap (drop policy: drop children, keep parents)

⸻

If you want, the next thing to specify (and it’s the other half of “nails in coffin”) is the exact SpanKind enum + subjectId encoding table so no one invents their own meanings.