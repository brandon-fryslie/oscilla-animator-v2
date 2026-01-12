Got it. Here’s the critical “where the taps go” spec—the exact interfaces and insertion points that let you build the non-technical debugger cleanly, without contaminating core logic. This is the part that makes everything else possible.

This is exactly where in compileBusAwarePatch and in the runtime evaluation you insert the taps (what functions should accept an optional DebugTap interface), so the debug system stays clean and doesn’t infect your core logic.

⸻

1) The core idea: a single DebugTap interface used by compiler + runtime

You do not want debug logic sprinkled through blocks, buses, fields, renderers, etc.
You want a single optional dependency that the compiler and runtime can call into.

1.1 DebugTap shape (non-allocating, level-gated)

export interface DebugTap {
  level: DebugLevel; // OFF/BASIC/TRACE/PERF/FULL

  // Called at compile time
  onDebugGraph?(g: DebugGraph): void;

  // Called periodically (10–15 Hz) with already-summarized values
  onSnapshot?(s: DebugSnapshot): void;

  // Runtime counters (these must be constant-time)
  hitMaterialize?(who: { blockId: string; reason: string }): void;
  hitAdapter?(adapterId: string): void;
  hitLens?(lensId: string): void;

  // Value probes – only invoked if TRACE/FULL
  recordBusNow?(busId: string, v: ValueSummary): void;
  recordBindingNow?(bindingId: string, v: ValueSummary): void;
}

Non-negotiable: every method must be safe to call with tap === undefined and must be no-op if level doesn’t require it. No exceptions. No allocations.

⸻

2) Where it plugs into compilation

2.1 Compiler output becomes: Program + DebugGraph + (optional) evaluator hooks

Your compile result should include:
	•	program: Program<RenderTree>
	•	timeModel: TimeModel
	•	debugGraph: DebugGraph (always built, cheap)
	•	debugBindingsIndex: fast mapping from runtime evaluator keys to debug keys (optional but recommended)

2.2 Insertion point: end of compilePatch / compileBusAwarePatch

Right after you’ve resolved:
	•	buses
	•	publishers sorted by sortKey
	•	listeners
	•	adapter chains
	•	lens stacks
	•	byPort indexing

Call:

tap?.onDebugGraph?.(debugGraph)

Why here: compile time is when you know the structure. Runtime shouldn’t rebuild it.

⸻

3) Where it plugs into runtime evaluation

This is the most important: you need a single evaluation path where all bus values flow through a “bus evaluator” layer, and that layer emits debug summaries.

3.1 Introduce a BusRuntime (even if you already compute buses in compiler)

You want an explicit runtime object responsible for:
	•	evaluating all buses at time t
	•	caching bus results for the frame
	•	providing getBus(busId) to block evaluators

This centralizes instrumentation.

Required interface:

interface BusRuntime {
  beginFrame(tMs: number): void;
  getBusValue(busId: string): unknown; // returns real typed value (Program evaluated)
  endFrame(): void;
}

3.2 Instrumentation inside BusRuntime

Inside beginFrame/endFrame:
	•	compute busNow summaries (BASIC)
	•	compute bindingNow summaries (TRACE)
	•	update perf counters (PERF)
	•	emit Snapshot at sample rate (10–15 Hz), not per frame

This avoids 60fps snapshot spam.

⸻

4) The exact tap points you must implement

4.1 Bus combine boundary (mandatory)

In bus evaluation:
	1.	Evaluate each enabled publisher contribution
	2.	Apply publisher adapter chain (if any)
	3.	Apply publisher lens stack (if any)
	4.	Combine into bus value
	5.	Apply bus silent default if no publishers

Tap points:
	•	After (3): optional recordBindingNow(publisherId, summary) if TRACE
	•	After (4)/(5): recordBusNow(busId, summary) if BASIC/TRACE

This is where 80% of non-technical debugging comes from.

4.2 Listener boundary (mandatory if you want “why is radius weird?”)

When a block input reads from a bus via listener binding:
	1.	Start with bus value (already computed for frame)
	2.	Apply listener adapter chain
	3.	Apply listener lens stack
	4.	Deliver to port as artifact / typed value

Tap points:
	•	After (3): recordBindingNow(listenerId, summary) if TRACE

This enables “probe port → show the transformed value at the port,” which is what non-technical users actually need.

4.3 Field materialization boundary (mandatory for performance)

Wherever a lazy Field becomes a concrete array:

Tap point:
	•	hitMaterialize({ blockId, reason })

This must be placed at the single function where arrays get allocated/finalized. If you don’t have one yet, you must create it (a central materializer).

4.4 Adapter and lens invocation (mandatory for perf attribution)

When executing an adapter or lens:
	•	hitAdapter(adapterId)
	•	hitLens(lensId)

This must be a constant-time increment into a bounded TopK structure (in DebugTap impl).

⸻

5) The “how do we summarize values?” contract

You must not allow arbitrary objects into snapshots. Create one function per domain, used everywhere:

function summarize(type: TypeDesc, value: unknown): ValueSummary

Rules:
	•	number/phase: clamp NaN/Inf into {t:'err', code:'nan'} etc.
	•	color: pack into u32
	•	vec2: x/y numeric only
	•	trigger: 0/1
	•	field: NEVER summarize full; either {t:'none'} or (if you later support sampling) a small distribution summary

This function must be deterministic and allocation-minimal.

⸻

6) DebugTap concrete implementation: DebugRecorder

You’ll implement DebugRecorder that:
	•	holds current frame scratch state (busNow map, bindingNow map) in fixed arrays indexed by compile-time indices
	•	holds ring buffers per bus for history
	•	holds bounded top-k counters for perf
	•	emits DebugSnapshot objects at 10–15 Hz

Critical: the runtime evaluator should NOT allocate maps keyed by IDs per frame. Use integer indices derived from DebugGraph.

So DebugGraph needs:
	•	busIndexById: Map<busId, idx>
	•	bindingIndexById: Map<bindingId, idx>

⸻

7) How the UI gets the data

UI doesn’t talk to runtime directly. It talks to a single DebugService:
	•	DebugService.setGraph(debugGraph)
	•	DebugService.pushSnapshot(snapshot)
	•	DebugService.getSeries(busId)
	•	DebugService.probePort(portKey) (pure over graph + latest values)

The player / runtime only emits snapshots to the service.

⸻

8) Acceptance criteria for “we did it right”

You know you got the core taps correct if:
	1.	Hovering a bus shows a meter that updates even if nothing is selected.
	2.	Hovering a port shows:
	•	which bus feeds it
	•	the value at the port (post lenses/adapters)
	3.	The Performance tab can say:
	•	“Field materialized N times this second”
	•	“Most expensive materializer: RenderInstances2D”
	4.	None of this changes FPS noticeably when DebugLevel=BASIC.
	5.	DebugLevel=OFF is truly zero overhead (only if(tap) branches).
