Conclusion: the “5 axes” CanonicalType system

The contract

CanonicalType is the only type authority for any value anywhere in the system:

CanonicalType = { payload, unit, extent }
extent = { cardinality, temporality, binding, perspective, branch }

Everything else (signal/field/event, “view,” “history line,” “state scope,” etc.) is either:
•	derived from those axes, or
•	an explicit operation that changes one axis in a controlled way.

If any other structure starts acting like a second type authority (extra instanceId fields, ad-hoc “kind” flags, hidden branch state), you’re already drifting.

⸻

Axis meanings (canonical semantics)

1) Cardinality

How many lanes / elements this value represents.
•	zero | one | many(instanceRef)
•	many(instanceRef) is the only representation of “per-lane/field-ness.”
•	Instance identity lives only here.

2) Temporality

Which evaluation clock governs presence/updates.
•	continuous | discrete
•	Discrete means “present only on ticks” (even if v0 defines tick==frame, the contract must exist).

3) Binding

How values attach to identity across time / edits.
This axis prevents “the lanes got reindexed and my state jumped” problems.
•	unbound | weak | strong | identity
•	Use it to control continuity/state projection behavior rather than inventing side channels.

4) Perspective

Which view-space interpretation applies (camera/viewpoint semantics).
•	This is about coordinate/view frames, not “2D vs 3D rendering API.”
•	You will almost always want: default plus some explicit perspectiveId cases once you add multiple cameras/views.

5) Branch

Which history line / worldline this value belongs to.
•	main, preview:<id>, checkpoint:<id>, undo:<id>, prediction:<id>, speculative:<id>, replay:<id>, etc.
•	Branch is what makes preview/physics/undo safe: state and caches must be branch-scoped.

⸻

Derived classifications (no extra “type families”)

You do not have separate “SignalType / FieldType / EventType” systems.

You derive “signal/field/event” purely from CanonicalType:
•	event ⇢ temporality = discrete (hard invariant) + payload/unit invariants if you choose them
•	field ⇢ cardinality = many(instance)
•	signal ⇢ otherwise (typically one, continuous)

If you ever store a separate expr.kind: 'field'|'signal'|'event' and treat it as authoritative, you’ve created a second type system.

⸻

Hard invariants that make the system stable

I1. Single authority

No field on any node may duplicate type authority contained in CanonicalType.
•	Example: FieldExprMap.instanceId is forbidden; derive from expr.type.extent.cardinality.

I2. Only explicit ops change axes

If something changes perspective/branch/cardinality/temporality/binding, it must be:
•	an explicit block/op, and
•	visible to the compiler, validator, and UI.

I3. Axis enforcement is centralized

You must have exactly one canonical enforcement gate (frontend validation pass) that runs after:
1.	normalization (including adapter insertion)
2.	type inference (all vars resolved as far as possible)
3.	assignment of concrete CanonicalTypes

“No backend entry without passing validation” is the belt buckle.

I4. State is scoped by axes that matter

At minimum:
•	state storage must be keyed by branch and (if field) instance lane identity
•	continuity/projection decisions should consult binding

I5. Const literal shape matches payload

You cannot allow “value: number|string|boolean” without a payload-keyed union or strict validation.
•	Best: ConstValue is a discriminated union keyed by payload kind.
•	If you keep a broad union, you must validate in the canonical frontend pass.

⸻

Common traps that cause rewrites

Trap T1: “Just store instanceId here for convenience”

That creates two authorities (type + field), and they will drift. Derive it.

Trap T2: “Events are just signals with a flag”

If “eventness” is not enforced by temporality=discrete (and your chosen event payload/unit invariants), you’ll accumulate special cases everywhere.

Trap T3: “Branch is only for undo UI”

If branch isn’t in the type system and enforced, preview/physics/undo will leak into each other via caches/state.

Trap T4: “Perspective is just renderer mode”

Perspective isn’t “WebGL vs Canvas.” It’s a semantic axis for interpreting spatial values. Keep it in type/IR; renderer choice stays elsewhere.

Trap T5: “Validation in builders is enough”

Builder assertions are useful, but they are not the canonical enforcement point. You need the single pass so the system is mechanically checkable.

Trap T6: “Default axis values are fine”

Defaults are fine only if they canonicalize deterministically (e.g., default branch becomes main). Otherwise you get “half-typed” values that slip through.

⸻

Odds and ends / errata from your gap analysis

1) Shared branded IDs in core

Core types cannot depend on compiler modules. Put branded IDs in src/core/ids.ts and import from both core and compiler.

2) EventExpr must be typed

Event expressions must carry type: CanonicalType, same as everything else, or you’ll never be axis-complete.

3) Remove placeholders with no semantics

Types like FieldExprArray that have no storage/eval semantics are “poison”: they become loopholes later. Delete until you can specify runtime backing.

4) Naming consistency matters only when it affects matching/serialization

The reduce_field → reduceField rename is worth doing because it prevents subtle pattern-match bugs and makes migrations cleaner.

⸻

Utilities/helpers you should standardize

Canonical constructors

Provide “boring” constructors that always set axes correctly:
•	canonicalSignal(payload, unit)
•	canonicalField(payload, unit, instanceRef)
•	canonicalEventOne(), canonicalEventField(instanceRef)
•	later: canonicalWithBranch(t, branch), canonicalWithPerspective(t, persp)

Canonicalization helpers
•	canonicalizeBranch(default→main)
•	canonicalizePerspective(default→… )
•	payloadStride(payload) -> 1|2|3|4
•	deriveKind(type) -> signal|field|event (derived only)

Axis extraction helpers
•	getManyInstance(type) -> InstanceRef | null
•	assertSignalType / assertFieldType / assertEventType
•	branchOf(type) -> BranchSpace
•	perspectiveOf(type) -> PerspectiveSpace

Validation helpers (frontend pass)

A single file that enforces:
•	axis-shape invariants per op
•	const payload/value shape alignment
•	branch/perspective preservation unless explicit op
•	state-scoping invariants if representable at IR level

⸻

Practical “definition of done” for axis-completeness

You’re “done” only when:
1.	Every value-producing thing carries CanonicalType (including events).
2.	No type authority is duplicated (no stray instanceId/branch flags anywhere).
3.	There is one canonical frontend validation gate, and backend refuses invalid IR.
4.	All stateful runtime storage is keyed by branch and respects lane identity.
5.	All conversions that change semantics are explicit blocks/ops (including adapters).
6.	Serialization round-trips all axis identities (especially branch/perspective ids) without loss.

That is the stable end state for the 5-axes system.