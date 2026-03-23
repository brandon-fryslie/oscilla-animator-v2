Below is a pass over exactly what’s in this types.ts, judged against the goal you stated: the axes cover everything completely (no “sig/field/event” as fundamental), with any remaining “kinds” being derived labels or legacy bridges.

⸻

The big picture problem in this file

You’re importing SignalType and then using it as the type annotation for:
•	signal expressions (SigExpr.*.type)
•	field expressions (FieldExpr.*.type)
•	schedule steps that clearly operate on multi-lane buffers (materialize, render, continuityApply)
•	shape references

That’s structurally inconsistent with “axes cover everything.”

If the “canonical type” is supposed to be complete, then the type on every value-producing node must be something like:
•	CanonicalType (payload + unit + extent axes)
•	plus (optionally) payload-shape/stride if you model vectors/colors as “float with stride” rather than distinct payloads

Using a type literally named SignalType everywhere is already a smell: either it’s misnamed (and is actually “CanonicalType”), or the file is using the wrong type.

⸻

What works here (and can stay conceptually)

1) Expression DAG separation (Signal / Field / Event) works as a current architecture

Your current architecture (three expression families + schedule that references IDs) is coherent and working in practice. It can remain as an implementation strategy during migration.

2) Closed unions and explicit kinds
   •	Intrinsic/placement unions are good (IntrinsicPropertyName, PlacementFieldName, BasisKind).
   •	OpCode as a closed enum is good for determinism and validation.

3) Continuity system types

Your GaugeSpec / ContinuityPolicy types are well-formed and have the right “no optional behavior exists” stance. They don’t inherently conflict with axis-completeness.

4) The strided write step is directionally correct

StepSlotWriteStrided is the right mechanism class for multi-component values: “write N scalar subexpressions into contiguous slots,” without forcing array-returning evaluators or side-effect kernels.

The flaw is that it’s grafted on as a special step, rather than being a general consequence of type/slot metadata.

⸻

What is invalid (conceptually) under axis-completeness

A) “SignalType everywhere”

If axes fully define semantics, you cannot have the node’s .type field be “SignalType” while still claiming fields/events are fully described by the axes.

Concretely:
•	FieldExprConst.type: SignalType makes no sense if a field is not a “signal.”
•	SigExprEventRead.type: SignalType can be valid (event→signal bridge), but then EventExpr needs its own complete typing too, and right now it doesn’t have one at all.

What to use instead
•	Replace every .type: SignalType in SigExpr and FieldExpr with .type: CanonicalType (or whatever your “full type” is).
•	Add .type (CanonicalType) to EventExpr as well, or make EventExpr explicitly typed as temporality=discrete with payload/unit constraints (and enforce it in the solver).

B) You’re still encoding “family semantics” outside the axes

You still have:
•	separate SigExprId, FieldExprId, EventExprId
•	separate unions SigExpr | FieldExpr | EventExpr
•	schedule steps with hard-coded semantics: evalSig, materialize, evalEvent

That can be okay as implementation, but then “signal/field/event” are not derived; they are still primary. Right now your axes don’t drive these boundaries; the IR does.

What becomes derived
•	Whether something is “signal-like” vs “field-like” must become a derived label from extent:
•	“signal-like” = cardinality=one and temporality=continuous
•	“field-like” = cardinality=many(instance) and temporality=continuous
•	“event-like” = temporality=discrete (payload semantics defined separately)
•	The IR families can continue to exist temporarily, but their legal typings must be enforced by the type system, not assumed.

C) Temporality + cardinality are currently not enforced by this IR

Nothing in these types prevents nonsense like:
•	a FieldExprBroadcast whose .type has cardinality=one
•	a SigExprTime with temporality=discrete
•	an EventExprWrap without any typing at all

So even if SignalType contains extent axes, you are not using those axes to constrain what each node kind may produce.

What you should use instead
•	Add type-level invariants to each node kind:
•	SigExpr* must have .type.extent.cardinality = one
•	FieldExpr* must have .type.extent.cardinality = many(instanceId) (and the instanceId must match the expression)
•	EventExpr* must have .type.extent.temporality = discrete
•	Enforce these in the frontend type graph pass (or a “IR typing validation” pass). Don’t rely on runtime behavior.

⸻

What is internally inconsistent or broken in this file as written

1) SigExprConst.value supports number | string | boolean but the rest of your system reads like it’s numeric-first

If your evaluator and kernels assume numeric math, allowing string/boolean here is either:
•	dead/unimplemented future ambition, or
•	a correctness hazard (type says it’s allowed, runtime probably can’t handle it)

What to do
•	If you truly want non-numeric payloads, you need:
•	payload typing that distinguishes them (payload: 'float' | 'bool' | 'string' | ...)
•	opcodes/kernels that are defined for those payloads
•	schedule/runtime storage that supports them (not just Float64Array)
•	If you don’t: remove string | boolean here and everywhere else.

2) SigExprReduceField.kind = 'reduce_field' breaks your kind naming convention

Every other kind is camelCase (stateRead, shapeRef, eventRead). This one is snake_case. That becomes a constant source of bugs in pattern matching and serialization.

What to do
•	Rename to 'reduceField' (and update all writers/readers).

3) Instance IDs are inconsistently typed

You import InstanceId (branded) and use it in field exprs, but schedule steps use instanceId: string in multiple places.

Example:
•	FieldExprIntrinsic.instanceId: InstanceId
•	StepMaterialize.instanceId: string
•	StepRender.instanceId: string
•	Continuity steps also use string

That defeats the entire point of branded IDs.

What to do
•	Make all instanceId fields use InstanceId, not string.

4) Optional instanceId? on FieldExprMap/Zip/ZipSig is a semantic footgun

A field expression is necessarily tied to a domain instance. If you need it optional, it means you don’t actually know the instance at that point, which means the node is under-specified.

What should be derived
•	instanceId should be derivable from:
•	the input field’s instance for map
•	all input fields’ instances for zip (must match)
•	the field input for zipSig

What to do
•	Make instanceId required on all field expressions that are per-instance.
•	If you want to avoid redundancy, you can omit it from the IR node and derive it from inputs during validation, but then it should not exist as an optional property.

5) FieldExprArray is under-specified

It has instanceId and type, but nothing about which array or its source.

If it’s intended as “field backed by a runtime buffer,” you need an explicit reference (slot, external channel, state, etc.). As written, it’s a placeholder with no semantics.

What to do
•	Either remove it until implemented, or specify its storage backing (e.g. slot: ValueSlot + stride + lifecycle).

6) StepEvalSig can’t represent strided/multi-component outputs

You’ve added StepSlotWriteStrided, which is good, but the existence of both indicates the core model is still “signals are scalar.”

If you’re serious about multi-component values as first-class, then eval steps must be able to write strided outputs as a consequence of type/slot metadata, not as a special step.

What should be derived
•	stride should be derived from the resolved type (payload shape) and/or slotMeta.
•	A single step form should cover both stride=1 and stride>1.

What to do
•	Replace StepEvalSig + StepSlotWriteStrided with a single step like:
•	StepEvalValue { expr: ExprId; targetSlotBase: ValueSlot }
•	where the runtime consults slotMeta for stride and writes the correct number of components.
•	If you keep scalar evaluators, then the evaluator must understand “component extraction” expressions (or the lowering creates N scalar component exprs). Either way, don’t encode “special multi” in the step union long-term.

7) Event expressions are untyped and therefore not axis-complete

Every other expression family carries .type. EventExpr does not.

If axes “cover everything completely,” events must have types too (even if minimal: temporality=discrete, plus payload/unit rules).

What to do
•	Add .type: CanonicalType to EventExpr variants, or introduce EventType that is literally CanonicalType with temporality=discrete and appropriate payload constraints.

8) StepRender contains multiple ad-hoc channels as optionals

You have:
•	optional scale
•	optional controlPoints
•	optional rotationSlot
•	optional scale2Slot

Some of that is fine as “renderer features,” but architecturally it’s a slippery slope: renderer ops become a dumping ground for unrelated per-instance attributes.

What should be used instead
•	A render step should carry:
•	the instanceId
•	a small fixed set of required inputs that define the draw primitive contract (position, color, shape, camera slot, etc.)
•	and everything else should be expressed as standard typed inputs (fields/signals) that either:
•	are part of the shape params, or
•	are part of a generalized “attribute set” keyed by semantic role with strict typing

If you want “no hacky extra code paths,” treat these as a typed attribute schema, not a growing list of optional slots.

⸻

What becomes “derived” (and should stop being fundamental)

If you want axes to cover everything, these should become derived labels/bridges, not primary semantics:
1.	“sig vs field vs event”

	•	Derived from extent.temporality and extent.cardinality.
	•	Your IR can keep separate node unions temporarily, but the type system is the source of truth.

	2.	Stride

	•	Derived from payload shape (vec2/vec3/color) and/or slotMeta.
	•	Steps should not hardcode “scalar vs strided” as separate op kinds.

	3.	Field instance association

	•	Derived from upstream domain selection; should never be “optional.”

⸻

What should be removed completely (or quarantined until real)

These are the items in this file that are “lying types” today:
•	SigExprConst.value: string | boolean (unless you commit to non-float payload storage and ops)
•	FieldExprArray as currently defined (no semantics)
•	optional instanceId? on field ops (either required or removed-and-derived)
•	snake_case kind 'reduce_field'

⸻

What you should be using instead (concrete replacements)

1) A single “type” used everywhere: CanonicalType

Every expression node that produces a value carries:
•	readonly type: CanonicalType

…and CanonicalType is the only typing concept the rest of the system trusts.

2) A single expression ID space (eventually)

Right now you have SigExprId / FieldExprId / EventExprId. That’s fine short-term, but axis-completeness naturally wants:
•	ExprId with expr.type determining how it evaluates (per-frame scalar vs per-lane vs discrete)

You can migrate by:
•	adding a parallel ExprId space that lowering produces
•	leaving old IDs in the frontend until you delete them

3) A single schedule step that writes “a value” to slots

Long-term you want something like:
•	StepEvalValue { expr: ExprId; target: ValueSlot }

and runtime uses slotMeta/type to decide:
•	stride
•	cardinality (one vs many) affects which backing array/buffer is written
•	temporality affects stamps/edge semantics

This is the mechanism that makes “axes cover everything” real.

4) Tight invariants per expression kind

Even if you keep separate unions for now, define and enforce:
•	SigExpr kinds must typecheck to cardinality=one
•	FieldExpr kinds must typecheck to cardinality=many(instance)
•	EventExpr kinds must typecheck to temporality=discrete

Don’t rely on “the evaluator knows what this is.”

⸻

A blunt assessment of your specific confusion (because it’s correct)

With the file as written, you do not have a world where the axes cover everything. You have:
•	three semantic families (sig/field/event) as primary
•	axes as an additional annotation that is not consistently enforced
•	a schedule that encodes family semantics directly (evalSig, materialize, evalEvent)

So your feeling that “the axes are pointless” is an accurate diagnosis of the current state.

You can fix it by making the axes authoritative in typing + slotting + schedule semantics, and treating the current families as a temporary implementation scaffold during migration.