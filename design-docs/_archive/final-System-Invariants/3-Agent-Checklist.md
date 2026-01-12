Work may only be considered complete if it conforms to all criteria below. Any change that violates any criterion must be adjusted (either the change or the surrounding architecture) until it conforms.

Core execution model
1.	Program is data: Compiled output is fully serializable; no runtime-critical logic in closures/functions produced by the compiler.
2.	Index addressing: All runtime access uses dense integer indices (NodeIndex, BusIndex, ValueSlot, StepIndex); no name/string lookups in hot paths.
3.	Resolved inputs: Every input is compile-time resolved to a concrete source {slot|busIndex|const|defaultSource|external}; runtime never “searches” for a value by id/name.
4.	Single-writer guarantee: Each ValueSlot has exactly one writer per frame; compiler enforces, runtime asserts in debug builds.
5.	No uninitialized reads: Schedule guarantees a value is produced before first read; debug builds assert.

Deterministic scheduling
6.	Schedule is explicit: Runtime executes an explicit ScheduleIR of steps (node eval, bus eval, materialize, render assemble), not implicit traversal.
7.	Deterministic ordering: All ordering is stable with explicit tie-break rules; equal inputs must always yield identical step order.
8.	Reproducibility: Given identical PatchRevision + Seed + TimeModel + ExternalInputs, outputs are deterministic (within defined float tolerance).

Time topology & continuity
9.	Authoritative time model: Runtime uses monotonic tAbsMs; looping/pingpong/windowing are derived by TimeModel, not separate player hacks.
10.	Continuity under retiming: Changing speed/period preserves phase continuity unless an explicit discontinuity is requested; implemented as explicit time-mapping state, not ad-hoc per block.
11.	Hot-swap continuity contract: Program swaps are atomic; state transfer is by stable StateId + compatible type/layout; any reset is explicit and diagnosable.

Identity & Fields
12.	Stable element identity: Domains are first-class identity handles; per-element identity is stable and usable for stateful systems.
13.	Lazy fields: Fields are expressions until forced; materialization occurs only via explicit, scheduled materialize steps.
14.	Materialization is attributable: Every materialization has a stable id and cache key; runtime can report what forced it (sink/debug/export).
15.	Structural sharing: Field expression graphs support canonicalization/structural sharing via stable ExprId (no uncontrolled DAG explosion for unchanged semantics).

Transforms, buses, and coercion
16.	Unified transform chain: All adapters/lenses compile to a single canonical TransformChain representation executed by the VM.
17.	Type-directed semantics: Field transforms yield new FieldExpr; signal transforms yield new SignalExpr/plan; field→signal reductions are explicit, rare, and diagnosable.
18.	Deterministic bus combine: Publisher order and combine behavior are deterministic and stable; provenance is reconstructible step-by-step.
19.	No silent coercions: Any type conversion is represented explicitly in IR (transform chain) or is a compile error with a suggested canonical chain.

Rendering contract
20.	Renderer is not “the patch”: Patch produces render payloads (instances/commands/geometry/style references); renderer only batches/draws and must not embed creative logic.
21.	Batchability & determinism: Render payload contains stable sort/batch keys sufficient for deterministic assembly and efficient drawing.
22.	No-jank edits: Runtime never produces blank/flicker frames during compile/swap; old program renders until new is ready.

Debuggability (power-user grade by construction)
23.	Structural instrumentation: Every meaningful runtime action maps to stable IR identifiers (NodeId/BusId/StepId/ExprId/ValueSlot); tracing is not heuristic.
24.	Low-overhead tracing: Tracing uses ring buffers / low allocation in hot paths; can be enabled without rewriting evaluation.
25.	Causal explainability: It is always possible to reconstruct “why this value is this” via causal links: source slot → transforms → bus combine → consumer.
26.	Record/replay readiness: External inputs are representable as a time-stamped stream and can be replayed deterministically against a fixed program+seed. **[POST-MVP]**

These are the project’s non-negotiable completion gates; if a feature can’t be implemented without breaking one, the architecture must change rather than weakening the gate.