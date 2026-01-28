You can get there from what you have without a full rewrite, but it’s a deliberate migration: keep the current IR families and runtime working while you introduce the axis-complete “Value world” alongside them, then progressively lower everything into it and delete the old shapes when nothing depends on them.

What you can keep
•	Your frontend normalization pipeline, including auto-insert adapters as explicit blocks.
•	Your constraint solving approach (union-find etc.). The big change is what it solves for: it must fully determine {payload, unit, extent} for every port/value, not just “sig vs field” families.
•	Your backend passes (time model, dep graph, SCC/schedule, lowering) conceptually. Some internals change, but the pass boundaries don’t have to.

What changes the least “first”

Phase 0: Formalize “kind” as a derived label (no code deletion yet)
•	Define a pure helper in the type layer:
•	isSignal(t) := t.extent.cardinality==one && t.extent.temporality==continuous
•	isField(t) := cardinality==many && temporality==continuous
•	isEvent(t) := temporality==discrete
•	Stop reasoning about sig/field/event as primary semantics in new code. Use these helpers only for UI labeling and legacy bridging.

This alone doesn’t break anything and starts forcing the right mental model.

Phase 1: Make CanonicalType actually be “the type” for ports

Right now you have a split between “port wrapper” (k: sig/field/event) and CanonicalType axes. That’s where the inconsistency lives.

Do this:
•	Keep k in the IR for now, but make the type solver output be the authoritative CanonicalType for every port.
•	Add a rule: after type resolution, k must be consistent with the resolved axes, or it’s a diagnostic.
•	e.g. k='field' but cardinality=one becomes an error (or at least a warning until you finish migration).

This makes axes real immediately, without touching runtime evaluation yet.

Phase 2: Introduce a unified ValueExpr IR only in the backend, as a lowering target

This avoids rewriting your frontend and avoids rewriting all blocks at once.
•	Keep existing SigExpr/FieldExpr/EventExpr as frontend+typed-IR constructs.
•	In pass6 lowering, emit UnifiedValueIR:
•	ValueExpr[]
•	ValueSlot allocations based on (cardinality, temporality, stride)
•	“discrete stamp” buffers if/when you support real discrete semantics
•	For now, you can lower:
•	SigExpr → ValueExpr with cardinality=one
•	FieldExpr → ValueExpr with cardinality=many(instance)
•	EventExpr → ValueExpr with temporality=discrete

At this stage the runtime still “feels” the same, but the backend is now running on the axis-complete representation.

Phase 3: Move semantics out of “expression family” and into kernels/adapters

This is where you start deleting special-casing in blocks.
•	Any “broadcast/zip/map” that exists as a special FieldExpr node becomes either:
•	a kernel op in ValueExpr, or
•	an explicit adapter block inserted by frontend
•	Your key win: blocks like SetZ, AngularOffset, Pulse, RadiusSqrt stop requiring k==='field' because they operate pointwise over cardinality and don’t care if it’s one or many(instance).

Phase 4: Replace the runtime evaluators in-place behind an adapter layer

You likely have:
•	evaluateSignal(sigId) -> number
•	field materialization paths that return typed arrays

You don’t have to delete them immediately. Instead:
•	implement evaluateValue(valueId, lane?) + bulk eval for many-lane
•	have old evaluateSignal call into it with lane=0 and stride=1
•	have field materializer call into it for many-lane

This is a refactor, not a rewrite: same data, same schedule, but one evaluator path.

Phase 5: Delete the old IR families (when they’re dead code)

Once:
•	all lowering targets are ValueExpr
•	all blocks author their type behavior in terms of axes
•	frontend uses resolved CanonicalType for UI and adapter menus

…then SigExpr/FieldExpr/EventExpr become optional legacy and can be removed.

The two “hard parts” you must decide early
1.	Discrete temporality runtime semantics

	•	If you don’t yet have a real tick/update model, you can still unify types now and implement discrete as “per-frame pulses” temporarily, but you must formalize the contract (stamps, presence/absence) so it doesn’t become ad-hoc later.

	2.	Value shape vs payload stride

	•	Cardinality is domain indexing.
	•	Vector-ness (vec2/vec3/color) is payload shape/stride.
You already seem to be moving toward multi-component signals; that aligns well. Just ensure “stride” is never conflated with cardinality.

How much code is this, realistically
•	Not a rewrite, but it’s not small:
•	Type layer: moderate changes (make axes authoritative, add consistency checks).
•	Lowering: significant (introduce ValueExpr IR + slot allocation based on axes).
•	Runtime: moderate-to-significant (unified evaluator, stamps for discrete).
•	Blocks: gradual cleanup (remove field-only guards and special cases).

The key is that you can do it incrementally without breaking the app every week, because the migration boundary sits at lowering/runtime, not at the UI or patch graph.

You can get there from what you have with a staged migration centered on lowering and a unified backend Value IR, without a from-scratch rewrite.