Great — here’s the prioritized, implementation-grade checklist. Each item has: why it’s not optional, where it lives, and acceptance criteria. I’m also labeling BAKE NOW vs LAYER LATER (meaning you can add it later without redesigning core IR/runtime).

⸻

0) Absolute foundation (if these aren’t true, everything else is compromised)

0.1 Program-as-data IR + slot-addressed ValueStore

BAKE NOW
Lives: IR schema, compiler, VM runtime
Acceptance criteria
•	Compiled program is fully serializable (no functions/closures).
•	Every output port writes exactly one ValueSlot (dense int).
•	Every input is resolved to InputSourceIR = {slot|bus|const|defaultSource|external} at compile time.
•	Runtime hot loop has no string lookups for evaluation.

0.2 Deterministic schedule as data

BAKE NOW
Lives: schedule compiler + runtime executor
Acceptance criteria
•	Schedule is an explicit list/graph of StepIR (node eval, bus eval, materialize, render assemble).
•	Stable ordering rules exist and are enforced (tie-breaks explicit).
•	Given same PatchRevision+Seed+Inputs, output matches bit-for-bit (within float tolerance) across runs.

0.3 Stable IDs for causal tracing + cache continuity

BAKE NOW
Lives: compiler ID assignment + meta/source map
Acceptance criteria
•	NodeId/BusId/StepId/ExprId stable across recompiles when semantics unchanged.
•	Runtime can re-use state/caches across hot-swap when IDs match.
•	Debug trace references only IDs, never “best effort” heuristics.

⸻

1) Time + continuity (what makes it “not a toy” in live editing)

1.1 Single authoritative time topology (monotonic tAbs + derived rails)

BAKE NOW
Lives: time model IR + runtime time-derive step
Acceptance criteria
•	Runtime keeps tAbsMs monotonic (never loops).
•	Time model defines derived signals (phase/wrap/progress) structurally.
•	No separate “player looping” logic that contradicts patch time.

1.2 Phase continuity / retiming (speed/period changes don’t jump)

BAKE NOW
Lives: runtime transport + time-derive step
Acceptance criteria
•	Changing speed/period preserves visual continuity (no phase discontinuity unless explicitly requested).
•	Retiming is expressed as a small stateful “time mapping” cell (not ad-hoc per block).

1.3 Hot-swap continuity rules (no-jank)

BAKE NOW
Lives: runtime program swapper + diff engine
Acceptance criteria
•	Program swap is atomic (old renders until new ready).
•	State transfer rules are explicit: match StateId+type/layout → copy; else reset with diagnostic.
•	Slot/Step continuity: unchanged semantic outputs keep stable slots or have an explicit remap.

⸻

2) Fields + identity (where perf and “coherence” are won or lost)

2.1 Domain as identity handle (stable element identity)

BAKE NOW
Lives: type system + runtime Domain store
Acceptance criteria
•	Domain is a runtime object/handle with stable element ids.
•	Field evaluation is defined “over a Domain” (even if implicit).
•	You can attach state per element (physics/history) keyed by element id.

2.2 Lazy FieldExpr + explicit materialization steps

BAKE NOW
Lives: FieldExpr table + schedule + FieldStore
Acceptance criteria
•	Fields are expressions until forced by a sink/debug/export.
•	Materialization is a scheduled step with an ID and cache key.
•	Runtime can report: materialized buffer count + bytes + culprits (which sink forced it).

2.3 Expr DAG canonicalization (structural sharing)

BAKE NOW (if you care about perf as you scale)
Lives: compiler expr builder + runtime expr interning
Acceptance criteria
•	Identical FieldExpr subtrees share an ExprId.
•	Cache hit rate increases as patches reuse structures.
•	Recompile doesn’t explode expr count for unchanged graphs.

⸻

3) Buses / lenses / transforms (consistency and debuggability)

3.1 Unified transform chain semantics (adapters + lenses = TransformChain)

BAKE NOW
Lives: IR schema + VM transform executor
Acceptance criteria
•	One canonical representation: TransformChainRef applied at input binding time.
•	Transform behavior is type-driven: field transforms produce FieldExpr nodes; signal transforms produce SignalExpr nodes.
•	Reductions (field→signal) are explicit, rare, diagnosable.

3.2 Deterministic bus combine ordering + provenance

BAKE NOW
Lives: bus schedule step + bus tables
Acceptance criteria
•	Publishers sorted by stable key; combine is deterministic.
•	Debug can show: each publisher value → after transform → combine accumulator at each step.
•	Empty-bus default values are typed and explicit.

3.3 Auto-adapter insertion rules are canonical

BAKE NOW
Lives: compiler binding resolver
Acceptance criteria
•	For any binding, compiler either emits an explicit transform chain or a compile error with suggested canonical chain.
•	No “silent coercions” at runtime.

⸻

4) Rendering (Canvas now, but architected so patch owns creativity)

4.1 Render IR: instances/commands, not bespoke “radius inputs”

BAKE NOW
Lives: Render types + renderer sink nodes
Acceptance criteria
•	Renderer consumes generic render payload (instances + geometry + style/material refs).
•	Patch produces transforms/colors/sizes/etc — renderer only batches/draws.
•	Adding a new shape doesn’t require redesigning the renderer API (just new geometry kind + draw path).

4.2 Batching contract + sort keys

BAKE NOW
Lives: render assemble step + renderer
Acceptance criteria
•	Render output contains enough info to batch deterministically (style/material keys, z/layer, blend).
•	Renderer does minimal per-instance work inside the hot loop.

4.3 Temporal stability during edits

BAKE NOW
Lives: runtime swap + renderer state
Acceptance criteria
•	No flicker/blank frames during compile/swap.
•	Optional crossfade is possible as a post-process step (not required, but enabled by design).

⸻

5) Debug system prerequisites (power-user grade)

5.1 Ring-buffer trace events with causal links

BAKE NOW (or you’ll rewrite everything later)
Lives: runtime tracer + IR StepIds
Acceptance criteria
•	Trace is zero/low-allocation in hot path (ring buffer).
•	Events reference NodeId/BusId/StepId/ExprId/ValueSlot.
•	Can reconstruct “why” for a value: source slot → transform → bus combine → consumer.

5.2 Deterministic replay inputs record

BAKE NOW if you want real bug reports / collaboration
Lives: input system + trace/snapshot
Acceptance criteria
•	External inputs are recordable as a time-stamped stream.
•	Replaying with same program+seed reproduces frames deterministically.

⸻

6) Can layer later (won’t force a redesign if the above is true)

6.1 Multi-client / server-authoritative runtime

LAYER LATER (but only if Program-as-data + transactions exist)
Acceptance criteria
•	Patch edits are transactions.
•	Runtime instance state is separate from patch spec.
•	Program IR can be shipped over WS + executed elsewhere.

6.2 Advanced input mapping (MIDI/OSC takeover, curves, feedback)

LAYER LATER
Acceptance criteria
•	External inputs appear as InputSourceIR.kind="external" with stable ids.
•	Mapping layer compiles into transform chains, not bespoke code paths.

6.3 Export (video/SVG) as “alternate sinks”

LAYER LATER
Acceptance criteria
•	Export just swaps sinks/materialization policies; schedule remains deterministic.
•	Infinite time exports use windowing rules from TimeModel.

⸻

If you want one “do this next” ordering (no missing steps)
1.	Lock IR schema + ValueStore/Step schedule contracts
2.	Implement VM executor for StepIR + TransformChain
3.	Implement TimeModel derive step + retiming state
4.	Implement FieldStore (Expr + materialize + cache keys)
5.	Implement busEval step (publishers → combine → bus slots)
6.	Implement render sink consuming RenderIR (Canvas)
7.	Implement hot-swap diff + state/slot continuity
8.	Add tracer ring buffer + event schemas + replay record

If you tell me your current status on: (a) do you already have FieldExpr+SignalExpr tables, (b) do you already have StepIR schedule emitted, I’ll turn this into a concrete week-by-week engineering plan with exact modules/files and the “definition of done” per milestone.