You handle this by making the default-source block itself polymorphic and deferring “which concrete default value is used” until after type resolution. The normalization contract stays intact (“every input has a source”), and you avoid inventing types early.

The core move: DefaultSource is a typed hole, not a typed constant

When an input is unconnected, normalization inserts:
•	a DefaultSource block
•	an edge from DefaultSource.out → that input

…but DefaultSource.out is generic (payload/unit variables), and its job is only to satisfy “has a producer,” not to choose a value yet.

Suggested shape

// inserted by normalization; purely structural
type DerivedBlockMeta =
| { kind: "defaultSource"; targetPort: PortRef };

type DefaultSourcePolicy =
| { kind: "neutral" }       // zero/identity-like defaults
| { kind: "timePreferred" } // if float<phase01> pick phaseA, etc.
| { kind: "authoringHint"; hint: string }; // optional

interface DefaultSourceBlockParams {
policy: DefaultSourcePolicy;
}

DefaultSource.out : CanonicalType = { payload: PayloadVar("T"), extent: ... }

The key is: the block’s output type is whatever the target port resolves to.

Where the real decision happens: after type resolution, before lowering

Once type unification resolves the target input type, you specialize each default source into one of two concrete forms:
1.	Wire to an existing rail (timeRoot outputs like phaseA, tMs, etc.), or
2.	Emit a typed constant / typed constructor expression, or
3.	Emit an explicit error if the type is unsupported for defaults.

This is a compilation-stage rewrite of the default-source block’s lowering, not a graph mutation.
•	Normalization inserted a block (structural).
•	Compilation decides what its output expression is (semantic).
•	The NormalizedGraph remains immutable during compilation (I6) because you’re not inserting/removing blocks/edges—just lowering a block differently based on resolved types.

How to make it deterministic and “single source of truth”

Define one table-driven function:

function defaultValueForType(t: CanonicalType): DefaultValuePlan

Return a plan like:

type DefaultValuePlan =
| { kind: "rail"; rail: "phaseA" | "phaseB" | "tMs" | "pulse" | "palette" }
| { kind: "const"; payload: PayloadType; unit?: Unit; value: number[] }
| { kind: "error"; code: DiagnosticCode; message: string };

Then DefaultSource.lower() becomes:

lowerDefaultSource(targetPortTypeResolved) {
const plan = defaultValueForType(targetPortTypeResolved);
switch (plan.kind) {
case "rail": return ValueExpr.time/slotRead/etc...
case "const": return ValueExpr.const(plan.value) (stride-aware)
case "error": return Diagnostic + a safe stub if needed
}
}

That gives you:
•	One enforcer: the table/function
•	One source of truth: resolved CanonicalType
•	No premature type picking during normalization
•	Deterministic behavior (same resolved type → same plan)

What about the case “type is unknown because the port itself is polymorphic”?

This is the important edge case: some ports are generic until they’re constrained by connections or by user params. If the input is unconnected and the port is generic, then even after unification you may still have PayloadVar unresolved.

You should treat that exactly the same as any other unresolved generic: hard error with a good diagnostic.

But the default-source block gives you a place to attach that diagnostic:
•	TargetRef = the unconnected input port
•	Diagnostic = “Cannot choose default: input type is unconstrained; connect a typed source or set explicit type parameter.”

This keeps your global rule consistent: unresolved generics are errors, never silently defaulted.

What default should a polymorphic port get?

Two correct policies exist; pick one and be explicit:

Policy A (strict, consistent with your type philosophy)
•	If an input port’s type is unresolved after unification, compilation fails.
•	DefaultSource does not invent a type.
•	The fix is to connect something typed or specify the type.

This aligns with “no silent defaults” and prevents bad emergent behavior.

Policy B (authoring-friendly, but you must formalize it)
•	Some block ports define a default type parameterization (explicitly as part of BlockDef), used only when unconstrained.
•	Example: Expression vars default to float<scalar> if not constrained.

If you do this, it must be:
•	explicit metadata on the block port (not a compiler hack)
•	deterministic
•	visible in diagnostics/UI (“defaulted to float because unconstrained”)

Given your invariants, Policy A is usually the cleaner one.

Practical integration detail: keep normalization independent from type resolution

Normalization should not need to know the port’s payload to insert a default source. It only needs:
•	the target port reference
•	a stable id anchor (_ds_${blockId}_${portId})
•	perhaps a coarse “default policy class” if you want (e.g., “timePreferred” for certain ports), but you can even avoid that and just compute from type later.

Summary decision
•	Insert polymorphic DefaultSource blocks during normalization unconditionally for unconnected inputs.
•	Resolve types as usual.
•	During lowering, specialize each DefaultSource using a single table keyed by resolved CanonicalType.
•	If the type is still unresolved, emit a hard diagnostic rather than picking a type.

That keeps the graph invariant (“every input has a source”) without forcing normalization to guess types.

I love this idea.  There is something I'd like to achieve if possible though, and that's to be able to have different default sources per type.  Any way we can swing that?

Yes—this fits perfectly with the “polymorphic DefaultSource” approach, because the whole point of deferring specialization is that you can choose a different concrete producer/value per resolved type without making normalization guess.

The clean mechanism

Make DefaultSource lower via a type-indexed policy table:

type DefaultKey = {
payload: PayloadType;
unit?: Unit;                 // only meaningful when payload is float-ish
temporality: Temporality;    // continuous vs discrete matters
cardinality: CardinalityKind; // zero/one/many (often you’ll only allow one/many)
};

type DefaultPlan =
| { kind: "rail"; rail: RailId }
| { kind: "const"; stride: number; values: number[] }
| { kind: "construct"; payload: PayloadType; args: DefaultPlan[] } // vec/color constructors
| { kind: "error"; code: DiagnosticCode; message: string };

type DefaultSourceProfile = {
// ordered rules; first match wins; deterministic
rules: readonly {
match: Partial<DefaultKey>;
plan: DefaultPlan;
}[];
};

Then:

function chooseDefault(profile: DefaultSourceProfile, t: CanonicalType): DefaultPlan {
const key = keyFromCanonicalType(t);
const rule = profile.rules.find(r => matches(r.match, key));
return rule?.plan ?? { kind: "error", code: "DefaultSourceMissing", message: "No default for type" };
}

This gives you “different default sources per type” with zero additional graph complexity, and one enforcer.

Where to store the profile

You have two good, non-conflicting layers:

1) Global defaults (system-wide)
   A single canonical DefaultSourceProfile that defines the system’s baseline defaults.

Example rules:
•	float<phase01> → rail: phaseA
•	float<scalar> → const: 0
•	vec2 → const: [0, 0]
•	vec3 → const: [0, 0, 0]
•	color → either rail: palette or const: [1,1,1,1] depending on your philosophy
•	bool + discrete (event) → const: 0 (never fires)
•	shape2d → error (no meaningful default)

2) Per-port overrides (optional, but powerful)
   Sometimes the “right” default depends on semantics, not just type (e.g., a float used as “alpha” vs “frequency”). You can support that without adding special cases by letting normalization stamp a default-source hint onto the inserted block:

interface DefaultSourceBlockParams {
profileId: "global" | "colorFriendly" | "timePreferred" | ...;
// OR: a single hint enum used to pick among profiles
}

Normalization still doesn’t need to know the type. It just chooses a profile/hint based on the target port’s identity (which it does know).

Then lowering uses:

profile = profiles[params.profileId]
plan = chooseDefault(profile, resolvedType)

So you can get behavior like:
•	Render.opacity defaults to 1 (even though it’s float)
•	Oscillator.phase defaults to phaseA (even though it’s a float-ish phase type)
•	Layout.position defaults to PlacementBasis (if that’s a typed rail/expr)

All still table-driven and deterministic.

Why this stays “minimal-change” and non-explosive
•	Normalization continues to do one thing: ensure every input has a producer.
•	Type resolution continues to do one thing: solve types.
•	Lowering continues to do one thing: specialize behavior based on resolved types.
•	You avoid adding “default value selection” into type unification (a common mistake that couples two subsystems and causes directionality bugs).

A good constraint to keep the system tight

Make “default per type” exhaustive only for the types you intend to be authorable without wiring. For everything else, default should be an intentional compile error with a diagnostic that points at the target port and says “this input requires an explicit source.”

That keeps defaults as an authoring affordance, not a semantic band-aid.

This is exactly how you swing different default sources per type while keeping normalization type-agnostic and keeping all policy centralized and deterministic.