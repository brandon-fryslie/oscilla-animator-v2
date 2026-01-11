Yes — you can, and you should do it, but you need to be strict about what “polymorphic” means so it doesn’t turn into runtime type chaos.

The right model: typed generics + world lifting rules

1) One block schema, multiple instantiations

A block like Add is declared once:
•	Type parameters: T
•	Ports: a: X<T>, b: X<T>, out: X<T>
•	Where X is a world (signal/field/scalar/config).

Then, at compile time, the block is instantiated to a concrete signature, e.g.
•	Add(field<float>, field<float>) -> field<float>
•	Add(signal<float>, signal<float>) -> signal<float>
•	Add(field<vec2>, field<vec2>) -> field<vec2>

The UI shows one Add. The compiler sees Add<T, X> specialized per use site.

2) Don’t allow “any world”; define exact world sets

You avoid having separate AddField, AddSignal, etc by letting Add accept one world parameter:
•	X ∈ {signal, field} (and optionally scalar if you really have it as a distinct runtime world)

But you do not want arbitrary mixing like Add(signal<float>, field<float>) unless you define an explicit lifting rule.

3) If you want mixing, make it deterministic with promotion rules

If you want “just Add” to work naturally, you need canonical promotions:

World order (typical):
config < scalar < signal < field

Promotion rule:
•	Unify to the max world present among inputs.
•	Insert implicit lifts (as IR nodes) that are pure and obvious:
•	LiftScalarToSignal
•	LiftSignalToField(domain)
•	BroadcastScalarToField(domain)
•	BroadcastSignalToField(domain)

Then Add(signal<float>, field<float>) becomes:
•	Add(LiftSignalToField(signal, domain), field) -> field<float>

This gives you “one Add block” without ambiguity, and keeps the IR explicit.

4) Domain-dependent promotions must be explicit about the domain

If a promotion produces a field<T>, it must be tied to a specific domain.
So either:
•	the block has an explicit domain input when needed, or
•	the compiler supplies domain from context (dangerous unless you have a single unambiguous domain in scope).

Canonical rule: field promotions require an explicit domain source (either wired or structurally inferred from the consuming render sink’s domain). Pick one and make it universal.

⸻

What “generic blocks” should exist vs not exist

Good candidates for generic blocks
•	Add<T, X>
•	Mul<T, X> where T is float or vector and one input is float
•	Min/Max/Clamp<T, X>
•	Mix<T, X> (lerp)
•	Abs/Neg/Saturate for numeric T
•	Eq/Lt/Gt for scalar-ish domains returning X<bool> or X<trigger> depending on your design

Bad candidates (keep explicit)
•	Blocks where semantics fundamentally differ by world:
•	Integrate / UnitDelay (field-state vs signal-state storage and layout)
•	Random (per-element vs global randomness is not the same thing)
•	Anything that allocates memory or interacts with scheduling/caching

These should be separate blocks or share an internal kernel with different block frontends.

⸻

How to implement it cleanly in the compiler

A) Represent polymorphism in the block definition

Each block declares type variables and constraints, e.g.
•	T: Numeric or T ∈ {float, vec2, vec3}
•	X ∈ {signal, field}
•	SameWorld(a, b, out)
•	SameDomain(a, b) if world is field

B) Solve types at compile time (unification)
•	Ports carry TypeDesc that can contain variables.
•	Edges impose equality constraints.
•	Promotions are inserted only if the rules allow them.
•	Result is a fully concrete IR: no generics at runtime.

C) Store the chosen specialization in the IR node

Your lowered SignalExpr / FieldExpr node for Add should include:
•	op: "add"
•	domain: float|vec2|vec3
•	world: signal|field (or implied by table)
•	input refs

So executors don’t do dynamic checks.

⸻

UI implications (so “one Add” stays intuitive)
•	Show one Add block.
•	Ports display their resolved type after wiring.
•	If a promotion was inserted, show it in debugging/IR traces, not as clutter in the patch.
•	If a promotion requires a domain and none is available, fail with a single clear error: “Cannot lift signal→field without domain.”

⸻

Bottom line

A single Add block is a good idea if you treat it as compile-time generics with a strict unification + promotion system that produces fully concrete IR, and you keep domain-dependent lifting deterministic and explicit.