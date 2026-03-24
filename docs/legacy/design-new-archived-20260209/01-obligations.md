The class of problems: Constraint-Dependent Derived Structure

“Missing inputs” is one member of a broader class:

You need to create or choose graph structure, but the choice is only well-defined after some constraints are solved (types, cardinality, instance identity, combine semantics, etc.).

This is not “type inference.” It’s graph completion under solved constraints.

Typical examples (some you already have, some you’re about to hit):
•	Missing input completion: choose a producer for an unconnected input.
•	Signal↔field mediation: insert broadcast/reduce/projection structure once cardinality/instance is known.
•	Unit/type adapters: insert a concrete adapter block once the mismatch is known.
•	Lens expansion: materialize a lens chain into concrete blocks after you know the payload shape.
•	Event shaping: insert edge detectors / debouncers / monotone OR wrappers after you know discrete/continuous and cardinality.
•	Domain/instance dependent helpers: e.g., “FromDomainId” / intrinsic readers need a concrete domain/instance.

The maximally generic idea is:

Normalize by emitting obligations (holes) early, then materialize them deterministically once constraints are solved.

That prevents “one-off DefaultSource hacks” because the mechanism is not “DefaultSource special”; it’s “constraint-dependent derivation special.”

⸻

Comprehensive Spec: Obligation-Driven Normalization (ODN)

0) Goals and non-goals

Goals
1.	Single authority for choices that require solved facts: resolve once, deterministically, in a dedicated pass.
2.	No lower-time branching on cardinality/fieldness/signalness.
3.	No compiler mutation of the final NormalizedGraph consumed by lowering.
4.	Deterministic IDs for all derived artifacts, stable across recompiles.
5.	Uniform mechanism for “needs derived structure later” (missing input is one case).

Non-goals
•	Solving types earlier than your existing inference pipeline.
•	Adding runtime polymorphism.
•	Letting unresolved generics silently default (still a hard error unless explicitly policy-driven and diagnosable).

⸻

1) Core abstraction: Obligation

Definition

An Obligation is a declarative request to produce some graph structure later, once specific facts are known.

It must be:
•	Deterministic: same input patch ⇒ same obligations.
•	Anchored: stable ID derived from user graph anchors.
•	Total: either materializes to concrete structure or produces a targeted diagnostic.

Data model

Use a discriminated union (no optional fields), with stable anchors.

type ObligationId = string;        // stable, derived
type ObligationKind =
| 'missingInput'
| 'coerce'
| 'lens'
| 'busJunction'        // if you ever reintroduce buses, or for “rails”
| 'other';

type Obligation =
| MissingInputObligation
| CoerceObligation
| LensObligation
| ...;

type MissingInputObligation = {
kind: 'missingInput';
id: ObligationId;
target: { kind: 'port'; port: PortRef };      // the input port to satisfy
policy: DefaultPolicyRef;                     // how to choose a default producer
anchor: AnchorRef;                            // stable derivation
};

type CoerceObligation = {
kind: 'coerce';
id: ObligationId;
edge: EdgeId;
from: PortRef;
to: PortRef;
anchor: AnchorRef;
mode: 'broadcastIfNeeded' | 'reduceIfNeeded' | 'unitAdapter' | ...;
};

type DefaultPolicyRef = {
kind: 'defaultPolicy';
key: string; // e.g. "render.pos", "render.color", "generic"
};

Anchor strategy

You already do deterministic IDs like _ds_{targetBlockId}_{portId} and _adapter_{edgeId}.

Generalize this as:

type AnchorRef =
| { kind: 'missingInput'; blockId: BlockId; portId: PortId }
| { kind: 'coerce'; edgeId: EdgeId }
| { kind: 'lens'; portId: PortId; lensId: LensId }
| ...;

ObligationId is a pure function of AnchorRef:
•	obl:missingInput:${blockId}:${portId}
•	obl:coerce:${edgeId}
•	etc.

⸻

2) Two outputs of normalization: SkeletonGraph + Obligations

Key move

Your normalization pipeline should produce a graph that is “structurally explicit,” but allowed to contain deferred seams, plus a list of obligations describing what must be materialized later.

You have two representation choices:

Option 1 (recommended): Obligations side-table
•	NormalizedGraphSkeleton contains user + already-materialized derived structure (composites expanded, lenses that are purely syntactic, etc.).
•	Obligations are a separate array keyed by anchors.

type NormalizedFrontend = {
graph: NormalizedGraphSkeleton;
obligations: Obligation[];
};

Option 2: Obligations as placeholder blocks

Represent obligations as derived blocks in the graph (e.g. DeferredSource, DeferredCoerce) that are guaranteed to be rewritten away.

This makes “every input has a source” trivially true early, but it also forces type inference to account for placeholder node kinds. It’s workable, but it tends to leak.

Side-table is cleaner because obligations are not semantic nodes.

⸻

3) Materialization pass: turning obligations into concrete blocks/edges

Contract

The Materialization pass consumes:
•	the skeleton graph
•	solved facts: resolved CanonicalType for every port + cardinality/instance resolution + unit resolution
•	obligations list

…and outputs a Fully Explicit NormalizedGraph with:
•	every input satisfied (I26)
•	all adapters/coercions explicit
•	no remaining obligations
•	deterministic ids for all inserted nodes/edges

Materialization is the last mutating pass before the graph becomes immutable input to the compiler proper, satisfying I6.

Signature

type SolvedFacts = {
portTypes: Map<PortRef, CanonicalType>;        // fully finalized
// if cardinality many includes InstanceRef, this is implicit in CanonicalType.
};

function materializeObligations(
skel: NormalizedGraphSkeleton,
obligations: Obligation[],
facts: SolvedFacts,
policyTable: DefaultPolicyTable
): NormalizedGraph;

Determinism requirements
•	Obligations processed in stable order (sort by ObligationId).
•	Inserted artifacts have IDs derived from obligation anchors:
•	_ds_${blockId}_${portId} for missingInput
•	_adapter_${edgeId} for coerce
•	etc.
•	Any iteration over maps/sets must be stabilized by sorting.

⸻

4) Default policies: making missing inputs generic, not a one-off

“Missing input” becomes generic by separating:
•	mechanism: an obligation exists for an unconnected port
•	policy: given the port’s resolved type and a policy key, choose a producer

DefaultPolicyTable

A pure function or table:

type DefaultProducerPlan =
| { kind: 'const'; value: ConstValue }                          // scalar const
| { kind: 'fieldConst'; instance: InstanceRef; value: ConstValue }
| { kind: 'rail'; rail: 'phaseA' | 'time' | 'palette' | ... }
| { kind: 'block'; blockKind: string; params: Record<string, any>; inputs?: ... };

type DefaultPolicyTable = {
resolve(policyKey: string, targetType: CanonicalType, targetPort: PortRef): DefaultProducerPlan | Diagnostic;
};

Resolution rules (must be total)

For a missing input obligation targeting port P with resolved type T:
1.	If T.extent.cardinality = one:
•	choose a scalar default (const or rail).
2.	If T.extent.cardinality = many(instanceX):
•	choose a field default that is explicitly bound to instanceX (fieldConst/broadcast plan).
3.	If unresolved or illegal type (should not happen post-solve):
•	emit UnresolvedType or MissingConstraint diagnostic targeted to the port.

This cleanly supports your desire for “different default sources per type/port” without making a god block:
•	render.pos might default to vec2(0.5,0.5) for signals, or fieldConst for fields.
•	render.color might default to palette (signal) or HSV(phaseA,…) bound per lane (field).
•	radius might default to 0.05, etc.

PolicyKey assignment

During normalization, assign a policy key deterministically:
•	by consumer block kind + port name (best, stable)
•	RenderInstances2D.pos ⇒ defaultPolicy:render.pos
•	fallback defaultPolicy:generic if unknown.

No inference required.

⸻

5) How it fits into your existing normalization pipeline

You currently have passes 0–4:
0.	Composite Expansion
1.	Default Source Materialization
2.	Lens + Adapter Insertion
3.	Varargs Validation
4.	Block Indexing

You want to avoid turning “missing input” into a one-off. So:

Proposed pipeline refactor: split “normalization” into structural and type-dependent materialization

Phase A: Structural normalization (no solved types required)
0.	Composite Expansion (unchanged)
1.	Obligation Collection (replaces Default Source Materialization)
•	For every unconnected input port, emit MissingInputObligation
•	Do not insert a block yet
2.	Lens Materialization (user-defined lenses → blocks) (keep if it doesn’t require solved facts; otherwise also obligation)
3.	Varargs Validation (read-only)
4.	Block Indexing for skeleton (optional; you may want to index only after full materialization)

Output: NormalizedFrontend { skeletonGraph, obligations }

Phase B: Constraint solving
This is your existing type inference + cardinality solver + unit resolution stage.
Output: SolvedFacts (portTypes finalized).

Phase C: Obligation Materialization (new)
5.	MaterializeObligations
•	Missing inputs become concrete default producer nodes/edges
•	Coerce obligations become explicit adapters/broadcast/reduce nodes
•	Anything else you choose to defer becomes concrete
6.	Final Indexing
•	Dense BlockIndex mapping and deterministic edge ordering after the graph is fully explicit

Output: NormalizedGraph (immutable input to compilation/lowering), satisfying I6 and I26.

How this respects your invariants
•	I6 (compiler never mutates graph): compilation starts after materialization; compilation sees a fully explicit immutable graph.
•	I26 (every input has a source): enforced after materialization, before compilation.
•	Determinism: obligations and materialization are both deterministic functions of the patch + solved facts.

⸻

6) Diagnostics spec (critical to keep it non-hacky)

Every failed obligation resolution must produce a diagnostic with:
•	TargetRef pointing to the input port (or edge)
•	obligation id and kind (for debugging)
•	“what fact was missing” vs “what policy failed”

Diagnostic cases
•	MissingInputDefaultUnresolvable
•	policy key exists but cannot produce a plan for the resolved type
•	MissingInputTypeUnconstrained
•	port type still has vars after solving (hard error per your rules)
•	CoerceImpossible
•	e.g. unit mismatch without adapter, or cross-instance broadcast prohibited by metadata
•	CoerceRequiresExplicitReduce
•	many→one requires explicit reduce, and policy says don’t insert automatically

This turns “we inserted a hole” into an auditable pipeline stage, not a magical exception.

⸻

7) Implementation details: minimum concrete artifacts to add

New types/files
•	src/graph/obligations.ts
•	Obligation union types
•	Anchor → ObligationId helpers
•	src/graph/passes/normalize-obligations.ts
•	emits obligations for missing inputs (and optionally for coercions)
•	src/graph/passes/materialize-obligations.ts
•	consumes obligations + solved facts, outputs final graph
•	src/graph/default-policy-table.ts
•	policy keys and resolution table

Changes to existing passes
•	Replace current “Default Source Materialization” pass with “Obligation Collection”.
•	Keep adapter insertion either:
•	as early pass (if purely structural), or
•	migrate to CoerceObligation materialization (better long-term because it depends on solved types).

⸻

8) How this avoids one-off naming and usage

Naming

Don’t name anything “DefaultSourceHole” in the architecture. That’s how it becomes a one-off.

Use:
•	Obligation
•	Materialization
•	Completion / Completion pass
•	Derived structure resolution

“Missing input” is just one ObligationKind.

Usage rule

Any time a normalization pass wants to insert derived structure but cannot do so without solved facts, it must:
1.	emit an obligation (with anchor + target)
2.	leave the graph skeleton unchanged (or minimally annotated)
3.	rely on materialization to insert the concrete nodes/edges later

That’s the “maximally generic” rule that keeps this from degenerating.

⸻

9) Tests (the ones that prove it’s not a one-off)
    1.	Missing input for field port
          •	RenderInstances2D.pos unconnected ⇒ materializes a field default bound to the instance.
    2.	Missing input for signal port
          •	simple signal-only consumer unconnected ⇒ materializes scalar const/rail.
    3.	Policy differentiation
          •	pos default differs from color default for the same consumer.
    4.	Determinism
          •	same patch compiled twice ⇒ identical derived ids and edge ordering.
    5.	Failure diagnostic
          •	unknown policy key or unsupported type ⇒ targeted diagnostic, no crash.

⸻

10) Relationship to cardinality polymorphism

This mechanism and cardinality polymorphism address different causality layers:
•	Cardinality polymorphism: “generic blocks can type-check without lower branching.”
•	Obligation materialization: “derived structure selection that depends on solved facts (and policy).”

Even with perfect cardinality polymorphism, default selection still needs policy (pos vs color vs radius, palette vs white, etc.). The obligation mechanism is the principled place for that policy to live, and it remains valuable even after cardinality vars exist.

That’s why this is not a one-off fix; it’s a general “derived structure under solved constraints” stage that your system already implicitly needs.