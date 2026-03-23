One True Type Vision: hard invariants you can enforce

0) Single representation invariant

There is exactly one value-type struct in the codebase: CanonicalType = { payload, unit, extent }.

Fail signal: any new interface/type that restates payload/unit/extent (e.g. PortType, ResolvedPortType, SignalType, FieldType, EventType) instead of aliasing CanonicalType.

Allowed: type PortType = CanonicalType (alias only), and “views” that are purely derived (see below).

⸻

1) No “kind” fields for value classes

No value types may add kind: 'sig'|'field'|'event' (or equivalent) as a primary classifier.

Rule: sig/field/event/static are derived labels from extent, never stored.

Fail signal: storage of sig/field/event on ports, edges, expr nodes, or IR as the authoritative truth.

⸻

2) Derivation rule for labels

When something needs a label, it must be computed from CanonicalType using one function.

Example label function (conceptually):
•	temporality=discrete ⇒ “event”
•	else if cardinality=many ⇒ “field”
•	else if cardinality=one ⇒ “signal”
•	else if cardinality=zero ⇒ “static/config”

Fail signal: multiple ad-hoc “what is this” checks scattered across passes.

⸻

3) Compatibility is a pure function of CanonicalType (+ adapters)

A connection (or conversion) must be decided by:
•	isTypeCompatible(from: CanonicalType, to: CanonicalType) and/or
•	explicit adapters/lenses inserted as blocks.

Fail signal: any compatibility logic that consults block names, node classes, port IDs, or “special casing Const”.

⸻

4) Inference never relies on defaults as semantics

Defaults are permitted only as uninstantiated placeholders during inference; they may not be used to silently “make things work.”

Rule: If a type is not fully resolved, it is not assumed compatible.

Fail signal: “if unresolved, treat as scalar” behavior (the exact failure mode you hit with defaultUnitForPayload('float') → scalar).

⸻

5) Solvers and normalizers may mutate graphs, but not meaning

Frontend may:
•	expand composites,
•	materialize default sources,
•	insert adapters (explicit blocks),
•	compute type solutions.

Backend may not invent new meaning:
•	it consumes already-normalized graph + solved types.

Fail signal: backend pass inserting type conversions, rewriting types, or resolving vars.

⸻

6) CanonicalType has only two states: unresolved or resolved

You do not create separate structs for “resolved” vs “unresolved”.

Rule: resolvedness is a predicate on CanonicalType:
•	payload not var
•	unit not var
•	all extent axes instantiated (no defaults)

Fail signal: introducing ResolvedPortType, ConcreteType, etc. as new shapes.

⸻

7) Every value-producing thing carries a CanonicalType

Ports, wires, slots, expression nodes, IR outputs: all must carry a CanonicalType reference.

Fail signal: anything typed as “number”, “float”, “SignalExprType”, etc. without a CanonicalType attached (unless it’s a deliberate runtime-erased layer with an explicit boundary).

⸻

8) Extent axes are authoritative; no parallel axis systems

Cardinality/temporality/binding/perspective/branch live only in Extent.

Fail signal: introducing parallel flags like isField, isEvent, laneCount, timeMode, etc. that duplicate extent semantics instead of deriving them.

⸻

9) “Runtime class” constraints are validations, not types

If your IR needs separate evaluation forms (SigExpr vs FieldExpr vs EventExpr), that’s fine—but those are execution representations, not “types”.

Rule: Each representation must validate its required extent constraints from the same CanonicalType.

Fail signal: representation choice driving the type system (instead of type driving representation choice).

⸻

10) Adapters are the only implicit conversions, and they’re explicit blocks

If something “just works,” it does so because the frontend inserted a block from a known adapter set.

Fail signal: implicit unit/cardinality conversions implemented as hidden rules in type checking or lowering.

⸻

11) No “default-to-fit” heuristics

You never resolve a polymorphic variable by picking a default “because it compiles.”

Rule: variable resolution must be constraint-derived (unification / adapter insertion), not heuristic.

Fail signal: choosing scalar/continuous/one as a fallback to avoid errors.

⸻

12) One entrypoint for type creation

There is a single constructor (or small constructor family) that produces CanonicalType. Everything uses it.

Fail signal: ad-hoc objects { payload, unit, extent } created in random files.

⸻

The litmus test you can use in code review

If a proposed change introduces any of these, it violates the vision:
1.	A new “type struct” that duplicates payload/unit/extent.
2.	A stored kind: sig/field/event on value types or ports.
3.	Any compatibility logic that inspects block identity instead of CanonicalType.
4.	Any fallback behavior that turns “unresolved” into “scalar” (or similar).
5.	Any conversion that happens without an explicit adapter block.
6.	Any new axis-like flag outside Extent.

That’s the test.