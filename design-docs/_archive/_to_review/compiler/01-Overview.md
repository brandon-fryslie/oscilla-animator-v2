Understood. Here’s the “do it right” architecture, optimized for performance, determinism, debuggability, and a clean Rust/WASM path.

The right architecture: Compiled IR + scheduled runtime + value store

1) Compile to an explicit, typed IR (no closures)

Your compiler output should be pure data:
	•	Node table: each node = (op, inputs, params, outputs)
	•	Bus table: each bus = (type, combineMode, default, ordered publishers)
	•	Lens/adapter table: chains compiled into steps, referenced by id
	•	Schedule: a deterministic ordered list of steps (block eval, bus combine, field materialize, render)
	•	Static metadata: port types, stable indices, debug names, source mapping

This is the key: the “program” is data, not JS functions.

2) Runtime is a small deterministic VM

The runtime executes the schedule. Everything flows through a central ValueStore.

ValueStore
	•	indexed by (nodeId, outPortIndex) for block outputs
	•	indexed by busId for bus values
	•	supports signal values, field expressions, and materialized buffers
	•	has per-frame cache keys so you can skip recompute cheaply

Execution model
	•	Every frame:
	1.	advance time via TimeRoot model (player never wraps time itself)
	2.	execute schedule in order
	3.	produce RenderTree / RenderCommands
	•	No node “calls” another node. Nodes don’t pull. The VM pushes.

3) Fields are lazy by default (FieldExpr graph), materialize only at sinks

Field values should be represented as FieldExpr handles (an AST / DAG), not arrays.
	•	Combine on a field bus produces a new FieldExpr node (cheap)
	•	Lenses/ops compose into FieldExpr (cheap)
	•	Materialization happens only in:
	•	render sinks (RenderInstances2D etc)
	•	explicit debug probes (“show me this field”)
	•	export pipeline (SVG/video)

Materialization returns:
	•	typed ArrayBuffer views (Float32Array/Uint32Array/etc)
	•	optionally SoA layouts for 3D later (positionsX/positionsY/positionsZ)

4) Every operation is an OpCode with a stable identity

Each IR node uses a small opcode set:
	•	pure ops (add, mul, clamp, noise…)
	•	state ops (integrate, delay…)
	•	time ops (time root, phase…)
	•	render ops (instance emitters, compositors)
	•	bus ops (combine, publish, listen) are compiler-visible, runtime-executed

This structure makes:
	•	profiling trivial
	•	diff/hot-swap rules enforceable
	•	Rust port straightforward (match on opcode)

5) Instrumentation is built-in, zero-cost when disabled

Because runtime is centralized, debugging is trivial:
	•	Every scheduled step can emit trace events:
	•	start/end timestamps
	•	input/output summaries
	•	cache hit/miss
	•	materialization counts
	•	bus combine provenance

When disabled, the VM just doesn’t call the tracer (or uses a no-op trait).

6) Hot-swap is principled: structural sharing + stable ids

When patch edits happen:
	•	compiler emits a new IR
	•	diff engine computes:
	•	unchanged nodes/buses keep their runtime state + caches
	•	changed nodes invalidate dependents (via dependency index)
	•	swap is atomic at frame boundary

No “jank” comes from half-updated graphs.

⸻

What this implies for Oscilla specifically

Replace Program<T> = { signal(t, ctx) => ... }

with:
	•	CompiledProgramIR (data)
	•	RuntimeEngine that executes CompiledProgramIR
	•	RenderBackend that consumes a render command stream or tree

Your current closure-graph compiler becomes an IR compiler.

Bus + lens + adapter become first-class runtime steps

No more “hidden logic in random closures”. If it affects meaning or performance, it’s visible in IR and scheduled.

Rust path becomes obvious
	•	IR is serializable (JSON/flatbuffers/capnproto)
	•	TS compiler can produce IR
	•	later: Rust runtime executes the same IR
	•	later: Rust compiler can also produce IR (optional)

You can even ship:
	•	TS compiler + Rust runtime (via WASM) in-browser
	•	Rust server runtime for multi-client authoritative mode

⸻

Minimal contract you implement to “flip the architecture”

If you want the smallest possible change that still puts you on the correct path, implement these three artifacts:
	1.	IR data structures
	•	node table, bus table, schedule, metadata, type table
	2.	RuntimeEngine.executeFrame(IR, time, ctx)
	•	deterministic step loop, ValueStore, caching
	3.	FieldExpr system
	•	lazy graph + materializer

Everything else (UI, block library, exports, debugger) gets easier after that.

Next: the exact IR schema (TypeScript types) and the schedule semantics (what steps exist, ordering rules, cache keys) as a single spec you can hand to an engineer.