Yes—there’s a lot of overlap, and most of it is naming + layering, not “extra information.”

Right now you effectively have one canonical core already:
•	payload (incl. stride)
•	unit (incl. unit vars)
•	extent (5 axes, incl. defaults)

That is the “everything” type. The problem is you’re still calling it SignalType and then you have other modules that introduce “sig/field/event” wrappers and separate expression families that implicitly encode constraints the type system should encode.

Here’s how to combine this so you have CanonicalType and that’s it, period, without bifurcations.

⸻

1) What overlaps / duplicates today

A) SignalType is already your CanonicalType

In canonical-types.ts:

export interface SignalType {
readonly payload: PayloadType;
readonly extent: Extent;
readonly unit: Unit;
}

That is exactly “canonical type.” The name is the only thing making it feel non-canonical.

✅ Action: rename SignalType → CanonicalType and rename constructors accordingly.

⸻

B) “sig/field/event” helpers are redundant with axis instantiation

These are just presets over extent:
•	signalTypeSignal() = cardinality one + continuous
•	signalTypeField() = cardinality many(instance) + continuous
•	signalTypeTrigger() = cardinality one + discrete
•	signalTypePerLaneEvent() = many(instance) + discrete
•	signalTypePolymorphic() = cardinality default + continuous

They are fine as constructors, but they shouldn’t define new conceptual “types.” They just produce CanonicalType.

✅ Action: keep them but rename to canonicalSignal(), canonicalField(), etc—or keep names but return CanonicalType.

⸻

C) “Old world” mapping helpers overlap with the new axes

worldToAxes() is a temporary migration helper. It duplicates what the extent axes already represent.

✅ Action: quarantine worldToAxes() into a legacy/ module (or delete once migration finishes). It should not live in the canonical spec module long-term.

⸻

D) Two different notions of “resolved”

You have:
•	AxisTag<T> allowing {default | instantiated}
•	PayloadType allowing {var | concrete}
•	Unit allowing {var | concrete}
•	ResolvedExtent and resolveExtent()

So you actually have “canonical-but-not-fully-specified” vs “fully-resolved” states.

You do not need two type shapes for that. You can keep one CanonicalType shape and define “resolvedness” as a predicate.

✅ Action: keep one CanonicalType type; add isCanonicalTypeResolved(t).

⸻

2) The single type you keep

Make this the only type used everywhere for ports, wires, expression nodes, diagnostics, UI display, and inference results:

export interface CanonicalType {
readonly payload: PayloadType; // may be var during inference
readonly unit: Unit;           // may be var during inference
readonly extent: Extent;       // axes may be default during inference
}

Then define two predicates (not new types):
•	fully concrete payload/unit: no vars
•	fully instantiated extent: no defaults

export function isFullyResolvedCanonicalType(t: CanonicalType): boolean {
return !isPayloadVar(t.payload)
&& t.unit.kind !== 'var'
&& isInstantiated(t.extent.cardinality)
&& isInstantiated(t.extent.temporality)
&& isInstantiated(t.extent.binding)
&& isInstantiated(t.extent.perspective)
&& isInstantiated(t.extent.branch);
}

This gives you one canonical type “period,” while still supporting inference.

⸻

3) How to eliminate “sig/field/event” as types while keeping them as IR strategy

You can keep separate expression families (SigExpr, FieldExpr, EventExpr) for execution efficiency / IR structure, but they must stop carrying “SignalType” as their type and stop relying on implicit semantics.

Rule: every value-producing node carries CanonicalType
•	SigExpr.*.type: CanonicalType
•	FieldExpr.*.type: CanonicalType
•	EventExpr.*.type: CanonicalType (yes—events too)

Rule: each expression family has a required extent shape (checked in frontend)
•	SigExpr nodes must satisfy: cardinality=one
•	FieldExpr nodes must satisfy: cardinality=many(instance)
•	EventExpr nodes must satisfy: temporality=discrete

These are validation invariants, not separate types.

This is how you make the axes “cover everything” without rewriting your whole IR immediately.

⸻

4) Concrete consolidation steps (minimal churn, maximal clarity)

Step 1 — Rename and re-export canonical names

In canonical-types.ts:
•	rename SignalType → CanonicalType
•	rename signalType() → canonicalType() (or keep signalType() but re-export as alias; your call)
•	rename signalTypeField/signalTypeSignal/... to canonicalField/canonicalSignal/... (optional but reduces conceptual confusion)

Step 2 — Make all other code import CanonicalType from this module

Everywhere else:
•	ports: type: CanonicalType
•	diagnostics: print CanonicalType
•	constraint solver operates on CanonicalType components

Delete or stop exporting any other “type for ports” from other files.

Step 3 — Unify resolvedness under one type shape
•	keep AxisTag defaults and var payload/unit only during frontend
•	after frontend unify+default-resolution, the output still uses CanonicalType, just now it satisfies isFullyResolvedCanonicalType() === true

Step 4 — Make “sig/field/event” derived labels only

If the UI needs a label, derive it:
•	if temporality=discrete → “event”
•	else if cardinality=many → “field”
•	else if cardinality=one → “signal”
•	else if cardinality=zero → “static/config”

No other “kind” field required.

Step 5 — Fix the one real structural leak: instance typing

Your canonical file still uses instanceId: string inside InstanceRef. That will keep infecting everything.

Change:

readonly instanceId: string;

to:

readonly instanceId: InstanceId; // the branded type you already have elsewhere

…and enforce it everywhere. This is the one change that prevents silent type drift.

⸻

5) What you delete vs what you keep

Keep (canonical, permanent)
•	Unit, payload + stride, Extent axes, CanonicalType
•	AxisTag default/instantiated pattern
•	unifyExtent and strict unification rules (that’s the foundation)
•	default-resolution helpers (resolveExtent) but treat it as part of “making a canonical type fully resolved,” not a separate type.

Keep (helpers, but not “types”)
•	canonicalSignal/canonicalField/canonicalEvent constructors (these are convenience constructors only)

Remove or quarantine (migration-only)
•	worldToAxes
•	any other file that defines a parallel “type system” name for the same thing (e.g. “SignalType” elsewhere, “PortType” wrappers that carry the same payload/unit/extent again)

⸻

6) The end state definition

There is exactly one type representation for values: CanonicalType.
Everything else is either:
•	a constructor returning CanonicalType, or
•	a predicate about a CanonicalType, or
•	a derived label computed from a CanonicalType, or
•	a solver artifact operating on components of CanonicalType.

That’s how you combine all of this without introducing new parallel notions of “type.”