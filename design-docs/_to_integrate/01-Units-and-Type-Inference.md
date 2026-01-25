You can get back on track cleanly by making unit resolution a first-class constraint solve, and by making “unresolved generic type” a hard error instead of silently defaulting to scalar.

The core mistake causing the cascade

Right now you have two half-systems:
	•	pass0 sometimes infers resolvedUnit (but not exhaustively / not deterministically).
	•	pass2 then assumes resolvedUnit exists, and if it doesn’t, it silently fabricates scalar.

That silent fallback is what turns “inference missed a node” into “unit mismatch everywhere”.

The correct direction (strict, spec-aligned)

You want all three simultaneously:
	1.	Strict unit checking at edges (no implicit conversion).
	2.	Generic blocks adapt (Const outputs become float<deg> when feeding Camera.tiltDeg).
	3.	No hacks / no “special casing unit checks for generics.”

That implies exactly one architecture:

After structural normalization has produced only explicit blocks+edges (including adapters and default sources), run a deterministic constraint solver that resolves every polymorphic block’s type variables (payload + unit) or emits a compile error.

No other option remains consistent.

So: pick Option 1, but implement it as a proper constraint solve and remove the scalar fallback path.

⸻

Concrete spec for how it should work

1) Graph normalization ordering (important)

Normalization must produce a graph where:
	•	every “default source” is an explicit Const node + edge
	•	every “adapter on port” is materialized into an explicit Adapter block + edges
	•	no implicit attachments remain

Only after that do you run type inference.

If you try to infer types before adapters/default-sources are explicit, you’ll keep getting directionality bugs.

2) Replace “infer unit by peeking at neighbor” with “constraints”

Treat polymorphic ports as having type variables.

For your current problem set, you need only:
	•	PayloadVar (e.g., float vs color vs shape)
	•	UnitVar (e.g., scalar, phase01, deg, px, …)

Example:
	•	Const output is not “float”.
	•	Const output is float<u>, where u is a UnitVar (unless the Const is explicitly configured).

Then build constraints from edges:

For every edge (after normalization):
	•	If it is a normal connection (no adapter block between):
Type(fromPort) == Type(toPort)
meaning payload must match AND unit must match.
	•	If it passes through an Adapter block, the adapter is the only place where unit changes are allowed, and it has its own explicit constraints (source unit != dest unit allowed only if adapter declares a legal conversion path).

This removes “wrong direction inference” entirely: the solver doesn’t care about direction.

3) The solver must be exhaustive and deterministic

Implement unification / propagation until a fixed point:
	•	Initialize known types from:
	•	monomorphic block port definitions (Camera.tiltDeg is float<deg>, etc.)
	•	user-chosen params (Const explicitly set to float<phase01>, etc.)
	•	For each constraint equality, unify:
	•	payload: concrete vs var vs concrete
	•	unit: concrete vs var vs concrete

If you end with any unconstrained UnitVar (e.g., an unconnected Const output), you resolve it by a single rule:

Unconstrained polymorphic ports are an error unless the block provides an explicit user choice.

That is what keeps the system strict and avoids “scalar by default” reappearing as an implicit conversion.

4) pass2 getPortType must never fabricate units

Your current bug:

If resolvedUnit is unset, you invent scalar.

That must become:
	•	If block is polymorphic and unresolved → return UnresolvedType sentinel
	•	Any attempt to compile with an unresolved type → compile error with a diagnostic pointing at:
	•	the block
	•	the port
	•	why it’s unconstrained
	•	the two fixes:
	1.	connect it to something that constrains it
	2.	explicitly set the unit/payload on the block (or add an adapter, depending on what’s missing)

This is the single change that stops “missed inference” from becoming a unit mismatch cascade.

⸻

How this resolves your numbered issues

(1) pass0 inferring units is causing chicken-and-egg

Correct fix: pass0 should not be doing ad-hoc “infer from neighbor” logic.
pass0 should only normalize structure.
Then a dedicated type solve pass runs over the normalized graph and resolves units/payload.

(2) pass2 specializes generics but defaults scalar if unresolved

Correct fix: remove the fallback. Unresolved polymorphic types become hard errors.

(4) Unit check existed but never triggered before

That’s exactly consistent: previously both ends looked like float<scalar> because you weren’t actually distinguishing units. Now you are, so the system is finally enforcing the spec. The enforcement is correct — the inference plumbing is what’s incomplete.

(6) All failures are downstream of Const feeding non-scalar units

That’s the canonical symptom of “Const output is polymorphic but not solved”.

⸻

What to change in code, precisely

A) Introduce a real “resolved port type” cache

Don’t store payloadType / resolvedUnit ad-hoc on blocks and hope it’s enough.

Instead, after type solving, produce something like:
	•	resolvedPortTypes: Map<PortBindingKey, SignalType>
where PortBindingKey = blockId + ":" + portName + ":in|out"

Then getPortType() does:
	1.	if there is a resolved override for that port, return it
	2.	else return the monomorphic definition type
	3.	if the port’s definition is polymorphic and has no resolved override → UnresolvedType error

This avoids “wrong default” and avoids “infer direction” bugs.

B) Const becomes unit-polymorphic by definition

Const output should be float<u> (or whatever payload) unless explicitly specified.
It is not float<scalar> in the type system.

If the user wants a “ScalarConst” UX, that’s UI sugar that sets u = scalar explicitly — not a hidden default inside the compiler.

C) Diagnostics must be explicit

When a Const is unconstrained:
	•	error: “Cannot resolve unit for Const.output”
	•	show connected constraints if any
	•	provide one required fix: “set Const unit” OR “connect to typed consumer” OR “insert adapter” (whichever applies)

No fallback paths.

⸻

About your “Options Forward”
	•	(1) Make pass0 unit inference exhaustive — correct direction, but only if you stop doing local inference and implement full constraint solving as above.
	•	(2) Don’t specialize units in getPortType — breaks the spec; you’ll be back in implicit-conversion hell.
	•	(3) Relax unit checking for generics — breaks the spec; same outcome.
	•	(4) Revert unit inference entirely — defers the real problem and guarantees you do it again later.

So: (1) with a real solver + no fallback is the only “do it once” path.
