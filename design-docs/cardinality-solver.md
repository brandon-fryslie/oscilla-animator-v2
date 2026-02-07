Cardinality Polymorphism Spec (Complementary to Obligation Materialization)

This spec defines cardinality polymorphism as a first-class, constraint-solved axis in your type system so that blocks can be cardinality-neutral (no signal/field branching in lower) while still supporting zipBroadcast (“many wins”), transform/reduce semantics, and instance alignment.

This is complementary to Obligation Materialization:
•	Obligations handle structure selection that depends on solved facts (e.g., missing input defaults).
•	Cardinality polymorphism handles type-level genericity and ensures ports can remain symbolic until constraints solve, then become concrete before lowering.

⸻

0) Goals and invariants

Goals
1.	Lower-time cardinality neutrality: lower() must not inspect cardinality; it receives fully concrete CanonicalTypes.
2.	Single authority: cardinality is solved by a dedicated cardinality constraint solver, not by ad-hoc checks or scattered inference.
3.	Correct “many” semantics: many carries an instance identity; cross-instance lane mixing is rejected unless an explicit projection exists.
4.	Supports zipBroadcast: mixed one+many allowed where declared; output becomes many and signal lanes broadcast.
5.	Deterministic: same patch ⇒ identical cardinality solution and derived insertion decisions.

Required invariants (system laws)
•	No silent defaults: unresolved axis vars after solving is a compile error.
•	No “many with unknown instance” post-solve.
•	Instance alignment: field ops require same instance unless a deliberate reindex/projection exists.

⸻

1) Type representation: inference-time cardinality and instance variables

1.1 Extend inference types to allow axis variables

You already have AxisTag for canonical types. For inference types you need:

type Axis<V, VarId> =
| { kind: 'inst'; value: V }
| { kind: 'var'; id: VarId };

type CardinalityValue =
| { kind: 'zero' }
| { kind: 'one' }
| { kind: 'many'; instance: InstanceTerm };

1.2 InstanceTerm: concrete or variable

To avoid “many but unknown instance”, cardinality polymorphism requires instance propagation.

type InstanceTerm =
| { kind: 'inst'; ref: InstanceRef }          // concrete instance
| { kind: 'var'; id: InstanceVarId };         // instance variable

type CardinalityVarId = string;
type InstanceVarId = string;

So Axis<CardinalityValue, CardinalityVarId> can be:
•	inst({ kind:'one' })
•	var(cv0)
•	inst({ kind:'many', instance: { kind:'var', id:'iv2' } })

This is the critical piece that keeps field identity well-formed.

⸻

2) Block cardinality contracts: declarative constraints, not lowering behavior

Each BlockDef already has cardinality metadata:

cardinalityMode: 'transform' | 'preserve' | 'signalOnly' | 'fieldOnly';
laneCoupling: 'laneLocal' | 'laneCoupled';
broadcastPolicy: 'allowZipSig' | 'requireBroadcastExpr' | 'disallowSignalMix';

Cardinality polymorphism formalizes how this metadata becomes constraints.

2.1 Port cardinality variables

Blocks declare port extents with cardinality axes that may be:
•	concrete (fieldOnly/signalOnly)
•	shared var (preserve)
•	a join var (zipBroadcast)
•	transform-related vars (transform outputs)

Rule: If a block is intended to be cardinality-generic, its ports should use cardinality vars and constraints, not concrete one/many.

Patterns

Preserve / laneLocal / no zip
All ports share the same cardinality var and same instance var (if many):
•	create cv for the block
•	create iv for the block
•	define “if cv resolves to many, it must be many(iv)”

This expresses “preserve cardinality and instance identity.”

ZipBroadcast
Inputs may be independently one or many, but output is the join:
•	output cardinality = join(inputs) where:
•	if any input is many(instanceX), output is many(instanceX)
•	otherwise output is one (or zero if your system supports zero lanes here)

Also requires instance equality among all many inputs.

signalOnly / fieldOnly
•	signalOnly clamps ports to one
•	fieldOnly clamps ports to many(instanceVar) or many(concreteInstance) depending on whether the block is instance-preserving vs instance-consuming.

transform
Transform blocks (e.g. Array) create a new instance:
•	outputs are many(instanceCreatedByThisBlock) with a concrete InstanceRef term produced by normalization/instance-decl pass
•	input “element” is one (unless you later support field→field transforms)

This is not polymorphism; it’s a constraint emitting a concrete many with a fresh instance.

reduce
Reduce blocks consume a concrete instance and produce one.
•	input must be many(instanceX)
•	output must be one

⸻

3) Cardinality Constraint Graph

Do not fold this into payload/unit unification. Cardinality has non-equality rules.

You already have a union-find based cardinality solver with zipBroadcast behavior. Extend it to solve instance terms too.

3.1 Variables and nodes

Create solver variables for:
•	every cardinality axis var id cv*
•	every instance var id iv*

But you’ll also need to represent port cardinality terms even when not var:
•	inst(one)
•	inst(many(instRef or iv))

Represent each port by a CardNode:

type CardNodeId = number;

type CardNode = {
id: CardNodeId;
port: PortRef;
// the “term” initially declared on the port
declared: Axis<CardinalityValue, CardinalityVarId>;
};

And separate instance nodes:

type InstNodeId = number;

type InstNode = {
id: InstNodeId;
// either a concrete InstanceRef or a var
declared: InstanceTerm;
};

3.2 Constraints

Define constraint types:

type CardConstraint =
| { kind: 'equal'; a: CardNodeId; b: CardNodeId }                      // strict equality
| { kind: 'join'; out: CardNodeId; inputs: CardNodeId[]; mode:'zip' }  // zipBroadcast join
| { kind: 'clampOne'; node: CardNodeId }
| { kind: 'clampMany'; node: CardNodeId; instance: InstanceTerm }
| { kind: 'manyInstanceEq'; nodes: CardNodeId[] }                      // all many must share instance
| { kind: 'transformOut'; node: CardNodeId; instanceRef: InstanceRef } // concrete instance
| { kind: 'reduceIn'; node: CardNodeId }                               // must be many
| { kind: 'reduceOut'; node: CardNodeId };                             // must be one

Edge constraints (wires) are usually equality on the full type. For cardinality axis specifically:
•	For each edge from → to, add equal(card(from), card(to)) unless the edge is mediated by a coercion obligation that will insert a broadcast/reduce adapter. (More on integration below.)

Block-local constraints come from block metadata (preserve/zip/transform/reduce).

⸻

4) Solver semantics

4.1 Domain of solutions

Cardinality solution for each node is one of:
•	zero
•	one
•	many(instanceRef) where instanceRef is concrete (no vars remain)

Instance solution is:
•	a concrete InstanceRef

4.2 Unification rules

Equality
•	one == one ok
•	many(X) == many(Y) requires X == Y (instance equality)
•	one == many(X) is a conflict unless this equality is not actually required (i.e., the edge is zipBroadcast-allowed and will be mediated by broadcast). That’s why zipBroadcast must be modeled as join constraints, not equalities.

Join (zipBroadcast)

Let inputs be {c1..ck}.
•	If any input resolves to many(I), then out resolves to many(I).
•	Otherwise out resolves to one (or zero only if all are zero and your semantics allow).

Also: if multiple inputs are many, all must have the same instance I else error:
•	ZipBroadcastInstanceMismatch

Clamps
•	clampOne forces one, errors if already known many.
•	clampMany forces many(instanceTerm); instanceTerm must resolve to a concrete instance by end.

TransformOut

For Array-like blocks, out cardinality is fixed to many(instanceCreated). No polymorphism.

⸻

5) Integration with existing pipeline (with obligations)

This is the “complementary” part: cardinality polymorphism and obligation materialization must not fight each other.

5.1 Ordering

Recommended pipeline ordering:
1.	Structural normalization (composite expand, lenses, etc.)
2.	Constraint collection (payload/unit + cardinality constraints)
3.	Solve payload/unit (your existing)
4.	Solve cardinality+instance (this solver)
5.	Finalize types for all ports (now cardinality is concrete)
6.	Materialize obligations (defaults, coercions) using concrete types/instances
7.	Final indexing → immutable NormalizedGraph → lowering

5.2 Edges vs coercions

If an edge connects a signal to a field input where broadcast is allowed, you have two choices:

Choice A (cleanest): always model it as an obligation, never as a constraint exception
•	During constraint collection, keep edge equality as-is.
•	When it would conflict (one vs many), emit a CoerceObligation with broadcastIfNeeded.
•	During obligation materialization, insert the broadcast adapter, and then the new edges become equal-cardinality.

But this requires you to detect “would conflict” before solving, which is tricky because it depends on solved facts.

Choice B (recommended): represent “coercible edges” explicitly in constraints

Introduce an edge constraint form:

{ kind: 'edge'; from: CardNodeId; to: CardNodeId; policy: 'equal' | 'broadcastable' | 'reducible' }

	•	equal: must be equal
	•	broadcastable: treat as “to may be join(from, to)” or specifically “if to is many and from is one, allow; else must match”
	•	reducible: allow many→one only via explicit reduce unless you auto-insert it

Given your “make it impossible not documented” bias, I recommend:
•	broadcastable only when the destination port’s block metadata explicitly allows zip-signal mixing.
•	Otherwise it’s equal and must match.

Then you can solve cardinality without inserting nodes yet, and later materialize coercions deterministically based on solved facts (if an edge is broadcastable and ended up one→many, insert broadcast adapter).

This keeps the solver honest and avoids pre-solve “guessing.”

⸻

6) Declaring polymorphic cardinality in block defs

You don’t want every block to manually allocate cardinality vars in its port types. Provide helpers.

6.1 Block-level inference template

Add an optional cardinalityTemplate to BlockDef (pure metadata) that drives port axis construction:

type CardinalityTemplate =
| { kind: 'signalOnly' }
| { kind: 'fieldOnly'; instance: 'infer' }
| { kind: 'preserve' }
| { kind: 'zipBroadcast'; groups: { inputs: PortId[]; output: PortId }[] }
| { kind: 'transformOut'; instanceFrom: 'instanceDecl' };

interface BlockDef {
// ...
cardinalityTemplate?: CardinalityTemplate;
}

Then port types can omit cardinality details (or keep them but overridden by template).

This is how you “generify maximally”: the polymorphism is expressed once per block, not per port type literal.

If you don’t want a new field, you can derive the same from existing BlockCardinalityMetadata plus port grouping definitions for zip.

6.2 Preserve blocks (most math/stateful)
•	All inputs and outputs participate in a shared preserve group unless explicitly excluded.
•	The solver will enforce they align.

6.3 Expression block

Expression varargs should:
•	preserve cardinality across referenced vars
•	if expression combines vars of mixed cardinality, it must use zipBroadcast semantics (many wins) only if Expression declares that behavior; otherwise reject.

So Expression needs explicit metadata: “vararg mixing allowed = allowZipSig” vs “disallowSignalMix”.

⸻

7) Finalization: producing concrete CanonicalType

After solving cardinality and instances, update inference types:
•	All axis vars in extent.cardinality are replaced with concrete values.
•	Any many(instanceVar) becomes many(concreteInstanceRef).

Then deriveKind(type) is deterministic and total, and lowering can dispatch solely on EvalStrategy decided from the finalized extent.

⸻

8) Diagnostics

You need targeted, explainable errors.

Required diagnostic codes (examples)
•	CardinalityConflict (one vs many where equality required)
•	ZipBroadcastInstanceMismatch (many(instanceA) mixed with many(instanceB))
•	UnresolvedCardinalityVar (axis var remains after solve)
•	UnresolvedInstanceVar (many has instance var unresolved)
•	FieldOnlyViolated / SignalOnlyViolated
•	IllegalManyToOne (reduce required but not present/allowed)
•	IllegalOneToMany (broadcast required but not present/allowed)

Each diagnostic must include:
•	involved ports/edges
•	expected vs actual
•	suggested fix: insert Reduce/Broadcast block, change block policy, etc.

⸻

9) Testing matrix (the tests that prove it’s real polymorphism)

Core
1.	Preserve block used in signal context: all ports resolve to one.
2.	Same preserve block used in field context: all ports resolve to many(instanceX) and instance propagates.
3.	ZipBroadcast: one + many(instanceX) → many(instanceX); requires broadcast insertion later (or marks coercion needed).
4.	ZipBroadcast mismatch: many(A) + many(B) → error.
5.	Transform: Array outputs many(instanceCreated) and downstream preserve blocks adopt that instance.

Guardrails
6.	Ensure lower() never inspects cardinality: lint/grep gate + a unit test that fails if extent.cardinality is referenced in block lower modules.
7.	Unresolved vars are fatal: intentionally underconstrained graph yields UnresolvedCardinalityVar instead of defaulting.

⸻

10) Relationship to DefaultSource and obligations

Cardinality polymorphism does not replace obligation materialization for defaults; it makes types correct and generic so that once you choose a default producer, it fits perfectly.

DefaultSource specifically:
•	With cardinality polymorphism, a single DefaultSource block could type-check for one vs many, but you still need policy selection (“pos defaults differ from color”) and you still need instance-aware field defaults. That’s exactly what obligations handle cleanly.

So:
•	Cardinality polymorphism: makes your generic blocks correct and neutral.
•	Obligation materialization: chooses and inserts the right derived structure once types/instances are known.

⸻

11) Implementation phases (practical)

Phase 1 — Representation
•	Add InstanceVarId, CardinalityVarId constructors.
•	Add inference-axis var support for extent.cardinality.
•	Add finalize substitution slots for cardinality + instance.

Phase 2 — Constraint extraction
•	From block metadata, emit constraints:
•	preserve equality groups
•	zipBroadcast join groups
•	fieldOnly/signalOnly clamps
•	transformOut constraints
•	From edges, emit edge constraints with policy (equal vs broadcastable) based on destination block’s broadcast policy.

Phase 3 — Solver
•	Extend your existing union-find cardinality solver to support:
•	join constraints
•	instance term unification
•	clamp enforcement
•	deterministic tie-breaking and stable diagnostics

Phase 4 — Finalization
•	Produce subst.cardinalities (and instances if separate)
•	Finalize all port types to concrete cardinalities/instances

Phase 5 — Coercion materialization
•	If edge policy allowed broadcast and solved result is one→many, materialize broadcast adapter deterministically.
•	Keep many→one as explicit reduce-only unless you explicitly allow an auto reduce policy.

⸻

The non-negotiable design choice

Do not implement cardinality polymorphism by “axis var + equality unify.” You need the constraint solver semantics (join/clamp/transform), or you’ll break zipBroadcast and end up reintroducing forbidden lower-time branching.

That’s the complete complementary spec.