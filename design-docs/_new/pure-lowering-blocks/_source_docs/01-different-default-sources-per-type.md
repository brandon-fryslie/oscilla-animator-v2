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