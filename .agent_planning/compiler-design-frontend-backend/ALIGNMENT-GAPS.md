The Gap 1 change is part of the diff I gave you (I replaced the old “type system under-specified” gap with the concrete “CanonicalType vs PortValueKind” statement). The other “Gap 2–5” sections in your doc are still written as questions, and you’re right: for this initiative, they should be answered as constraints/decisions, not left open.

Here are the answers, in the same terms your document uses.

Gap 2: Where does the Time Model fit?

Answer: Backend.
•	Frontend requirement: validate “time roots exist and are unique enough to proceed” only at the structural level (e.g., “there is at least one TimeRoot or InfiniteTimeRoot” and diagnostics if missing/ambiguous).
•	Backend responsibility: derive the actual time model values and the synthesized signals/events (tModelMs, phaseA/B, dt, pulse, etc.) exactly as Pass 3 does today.

Reason this is correct: the time model is not needed to make port types concrete for UI, adapter insertion, or unit/payload unification. It is needed to execute.

Gap 3: Cycle validation placement

Answer: Split.
•	Frontend: cycle classification for UX (what’s cyclic, what’s illegal instantaneous feedback, what edges are implicated) and produce CycleSummary so the UI can highlight and propose fixes even when compile fails.
•	Backend: cycle handling for execution (SCC decomposition/topological scheduling over lowered IR) and any final legality checks required by the runtime.

Rule of thumb: frontend answers “what is the user looking at and how to fix it”; backend answers “how to run it”.

Gap 4: Event/Field expression types

Answer: They remain as execution representations, with a wrapper carried through the frontend output.
•	Frontend output type for UI: ResolvedPortType = { kind: PortValueKind, type: CanonicalType }
•	kind ∈ { sig, field, event } (or whatever your actual enum names are)
•	type is the canonical payload+unit+extent.
•	Backend lowering: uses kind to choose which expression family to produce (SigExpr, FieldExpr, EventExpr) and validates the expected kinds for blocks that require them.

Important constraint: this initiative does not attempt to encode “eventness” purely into Extent.temporality (because your current execution engine can’t be collapsed that way without touching a lot).

Gap 5: Continuity integration

Answer: Backend-only semantics; frontend-only validation hooks.
•	Frontend: may validate “continuity spec references a real gauge / legal target” and surface diagnostics, but does not compute or enforce continuity behavior.
•	Backend: owns continuity evaluation, state storage, and any lowering artifacts tied to continuity policies (because it’s runtime/stateful by definition).

One more thing: what to do with the remaining “question gaps” in the doc

For this initiative, the doc should stop asking and instead state:
•	Time model: “Backend derivation; frontend only validates presence.”
•	Cycles: “Frontend classifies for UI; backend schedules for execution.”
•	Event/Field: “Representations stay split; carry PortValueKind wrapper; CanonicalType remains the type.”
•	Continuity: “Backend semantics; frontend optional validation/diagnostics only.”

That’s the set of answers you can harden into the document without derailing the work.