Units and Adapters Specification

This spec defines (A) the unit system and (B) port-attached adapters that the editor creates and graph normalization materializes as derived blocks, so the compiler only ever sees blocks and edges.

⸻

Part A — Unit System

A1. Core rule

Every typed value has:
•	payload: PayloadType
•	unit: Unit (always present; never optional)
•	extent: Extent

There is no implicit unit or payload conversion. Any change of (payload, unit) requires an adapter (Part B) or an explicitly typed block whose contract performs that conversion.

A2. PayloadType set

The canonical payload set for v2.5 (including 3D readiness) is:

type PayloadType =
| 'float'
| 'int'
| 'vec2'
| 'vec3'
| 'color'
| 'bool'
| 'shape';

Notes:
•	phase is not a payload. Phase is payload:'float' with unit:'phase01'.
•	The old unit payload is removed; [0,1] is represented as payload:'float' with unit:'norm01'.
•	??? is not a payload; polymorphism is represented via type inference in the compiler, not a runtime-visible payload tag.

A3. Unit is a closed, discriminated union

Unit is always present and always one of these:

type Unit =
| { kind: 'none' }                 // for payloads that do not carry units (bool, shape)
| { kind: 'scalar' }               // dimensionless numeric
| { kind: 'norm01' }               // clamped [0,1]
| { kind: 'phase01' }              // cyclic [0,1) with wrap semantics
| { kind: 'radians' }              // angle in radians
| { kind: 'degrees' }              // angle in degrees
| { kind: 'ms' }                   // milliseconds
| { kind: 'seconds' }              // seconds
| { kind: 'count' }                // integer count / index
| { kind: 'ndc2' }                 // normalized device coords vec2 in [0,1]^2
| { kind: 'ndc3' }                 // normalized device coords vec3 in [0,1]^3
| { kind: 'world2' }               // world-space vec2 (renderer-defined scale)
| { kind: 'world3' }               // world-space vec3
| { kind: 'rgba01' };              // float color RGBA each in [0,1]

This list is the entire unit universe for v2.5. Adding a unit is a spec change with explicit review; it is never an ad-hoc string.

A4. Allowed unit set per payload

A value is valid only if its (payload, unit) combination is allowed by this table:

A4.1 float

Allowed units:
•	scalar
•	norm01
•	phase01
•	radians
•	degrees
•	ms
•	seconds

A4.2 int

Allowed units:
•	count
•	ms

(If you need more later, add units explicitly; no “int scalar” in v2.5.)

A4.3 vec2

Allowed units:
•	ndc2
•	world2

A4.4 vec3

Allowed units:
•	ndc3
•	world3

A4.5 color

Allowed units:
•	rgba01

A4.6 bool

Allowed units:
•	none

A4.7 shape

Allowed units:
•	none

A5. Type compatibility (strict)

Two ports are directly connectable (without an adapter) iff:
1.	payload is identical
2.	unit is identical (deep-equal on the union)
3.	extent unifies under your existing axis unification rules (cardinality/temporality/binding/perspective/branch)
4.	Any additional port constraints (block registry) are satisfied

If any of these fails, the graph is invalid unless an adapter exists that makes it valid.

A6. Unit behavior is semantic, not representational

Even if two units share the same runtime representation (e.g., phase01 and scalar are both float32), they are not compatible without an adapter. Units exist to prevent “it runs but it’s wrong.”

⸻

Part B — Port Adapters

B1. Core rule

Adapters are:
•	attached to ports (input or output)
•	created by the editor (not by the compiler)
•	visible to the user with low-noise UI (badge/annotation, not a full node)
•	materialized by graph normalization into explicit derived blocks + edges
•	fully explicit by the time the compiler runs (compiler sees only normal blocks and derived adapter blocks)

There is no implicit conversion in isTypeCompatible().

B2. Adapter attachment model (editor-layer)

B2.1 PortAttachment structure

Each port may have zero or more attached adapters, but in v2.5 the editor must enforce:
•	At most one adapter per port per connected edge.
•	Adapters are edge-local: an adapter is attached to “this port for this connection,” not globally changing the port type.

Conceptual structure:
•	AdapterAttachment { id, kind, side, blockId, portId, edgeId, params }

Where:
•	side ∈ {'input','output'}
•	kind is a member of the adapter registry (B4)
•	params is a closed, adapter-specific struct (often empty)

B2.2 UX requirement (visibility without node noise)
•	The editor renders adapters as a badge on the port or on the edge near the port.
•	Clicking the badge reveals:
•	adapter kind (e.g. PhaseToRadians)
•	exact type transformation (payload, unit) -> (payload, unit)
•	any parameters (if the adapter has them)
•	Adapters participate in undo/redo as user intent.

B3. Normalization materialization (required)

GraphNormalization consumes RawGraph + adapter attachments and produces a NormalizedGraph containing only:
•	Blocks
•	Edges

All adapters become explicit derived blocks with explicit edges.

B3.1 DerivedBlockMeta extension

Add a new derived meta variant:

{ kind: "adapter"; target: { kind:"portEdge"; blockId: BlockId; portId: PortId; edgeId: EdgeId } }

B3.2 Stable anchors (required)

Adapters must have stable IDs so state migration and debug tooling remain deterministic.

Anchor format:
•	Input adapter: adapter:in:<blockId>:<portId>:<edgeId>:<adapterKind>
•	Output adapter: adapter:out:<blockId>:<portId>:<edgeId>:<adapterKind>

The derived adapter block’s blockId is deterministically derived from the anchor (same mechanism you use for DefaultSource).

B3.3 Materialization wiring rules

Input-side adapter
For an edge A.out -> B.in where an input adapter is attached at B.in:

Normalize to:
•	A.out -> Adapter.in
•	Adapter.out -> B.in

Output-side adapter
For an edge A.out -> B.in where an output adapter is attached at A.out:

Normalize to:
•	A.out -> Adapter.in
•	Adapter.out -> B.in

(Structurally identical; the “side” only changes anchoring and UI ownership.)

If both sides specify adapters on the same edge, normalization must materialize them as two blocks in series, ordered:
•	output-adapter first, then input-adapter

This ordering is structural; it is not subject to compiler discretion.

B4. Adapter registry (closed set)

All adapters are defined in a registry with:
•	adapterKind
•	inputType: (payload, unit)
•	outputType: (payload, unit)
•	paramsSchema (closed; may be empty)
•	semantics (precise mapping)
•	implementationRef (IR selection: opcode/kernel)

B4.1 Required adapters for v2.5

These are the canonical adapters you must support immediately:

Phase / angle adapters
1.	PhaseToScalar01
•	in: float:phase01
•	out: float:scalar
•	semantics: y = x (no wrap/clamp; semantic boundary only)
2.	ScalarToPhase01
•	in: float:scalar
•	out: float:phase01
•	semantics: y = wrap01(x)
3.	PhaseToRadians
•	in: float:phase01
•	out: float:radians
•	semantics: y = x * 2π
4.	RadiansToPhase01
•	in: float:radians
•	out: float:phase01
•	semantics: y = wrap01(x / 2π)
5.	DegreesToRadians
•	in: float:degrees
•	out: float:radians
•	semantics: y = x * (π/180)
6.	RadiansToDegrees
•	in: float:radians
•	out: float:degrees
•	semantics: y = x * (180/π)

Time adapters
7.	MsToSeconds
•	in: float:ms or int:ms (pick one; v2.5 requires int:ms for tMs)
•	out: float:seconds
•	semantics: y = x / 1000
8.	SecondsToMs
•	in: float:seconds
•	out: int:ms (rounded) or float:ms (pick one and keep it consistent)
•	semantics: defined explicitly (rounding policy is part of the adapter)

Normalization adapters
9.	ScalarToNorm01Clamp
•	in: float:scalar
•	out: float:norm01
•	semantics: y = clamp01(x)
10.	Norm01ToScalar

	•	in: float:norm01
	•	out: float:scalar
	•	semantics: y = x

B4.2 Disallowed adapters

Adapters that would cause silent semantic ambiguity are forbidden in v2.5:
•	Phase01ToNorm01 (disallowed because it invites treating cyclic values as clamped scalars without an explicit decision; the correct boundary is PhaseToScalar01 or PhaseToRadians depending on intent)
•	Any adapter between int and float without an explicit rounding policy (if you add one later, it must be a named adapter with a declared policy)

B5. Adapter blocks in the compiler IR

An adapter derived block is a normal block kind from the compiler’s perspective:
•	kind: e.g. "Adapter_PhaseToRadians"
•	one input port, one output port
•	payload/unit changes are exactly the registry mapping
•	cardinality is preserved (adapter is cardinality-generic by construction)
•	temporality is preserved

The compiler does not “special-case adapters.” It compiles them like any other block.

B6. Adapters and cardinality

Adapters are always cardinality-preserving:
•	Signal<T> -> Signal<U>
•	Field<T>(I) -> Field<U>(I)

No adapter may change instance identity or lane count.

If an adapter is attached where input and output cardinalities differ, normalization must reject the graph as invalid (diagnostic: ADAPTER_CARDINALITY_MISMATCH).

B7. Diagnostics (required, no ambiguity)

B7.1 Editor-time diagnostics

If a user connects two ports whose types are incompatible and no adapter exists:
•	show: TYPE_MISMATCH
•	offer: list of valid adapters from registry that would make the connection valid (0 or more)

B7.2 Normalization-time diagnostics

If adapter attachments are invalid:
•	UNKNOWN_ADAPTER_KIND
•	ADAPTER_TYPE_MISMATCH (adapter does not map from actual source type to required destination type)
•	ADAPTER_CHAIN_INVALID (both sides attached but composition is not type-correct)
•	ADAPTER_CARDINALITY_MISMATCH
•	ADAPTER_TEMPORALITY_MISMATCH (adapter must preserve temporality)

B7.3 Compiler-time diagnostics

The compiler remains strict:
•	if the normalized graph types still don’t unify, it emits the normal type errors; it does not insert adapters.

B8. Determinism and edit-safety

Because adapters are editor-authored intent and normalized into derived blocks with stable anchors:
•	recompilation produces the same adapter blocks for the same attachments
•	hot-swap state migration is unaffected (adapters are pure and have no state)
•	debug tracing can attribute conversions to a concrete blockId

⸻

Why “one adapter per port (per edge)” is the right rule

Because an adapter is a typed, named morphism A → B on (payload, unit) with crisp semantics. If you allow arbitrary chains on a single port, you get:
•	Ambiguous intent (multiple ways to reach the same target type).
•	Non-local reasoning (the meaning of a connection depends on a hidden chain).
•	Difficult normalization (you’ve reinvented a mini graph inside a port).
•	Hard-to-debug behavior (users see “a badge” but it encodes an unbounded program).

So the rule “≤ 1 adapter per port per edge” isn’t claiming you’ll never need multiple conversions; it’s enforcing that if you do, you express them as two port adapters (one on each end) or as an explicit block, keeping the chain shallow and debuggable.

Will we ever need more than 2?

In v2.5, a well-designed unit/adapters table makes almost all useful conversions either:
•	0 adapters (exact match), or
•	1 adapter (source → sink), or
•	2 adapters (one on each end) in the rare case you want to keep each port’s declared contract strict but still connect via a common intermediate.

If you find you “need 3+”, it’s almost always a smell that:
•	a missing canonical adapter should exist (direct mapping), or
•	the port contract is wrong (it should accept a different unit), or
•	you’re trying to express a semantic operation that isn’t a conversion (should be a real block).

So: chains longer than 2 are treated as design errors, not normal usage.

The safe automatic detection algorithm (editor-side)

The editor can auto-insert adapters deterministically using a closed adapter registry and a shortest-path search with strict tie-breaking.

Inputs
•	Source port type: Ts = (payload_s, unit_s, extent_s)
•	Sink port type: Tt = (payload_t, unit_t, extent_t)
•	Registry: directed edges AdapterKind: (payload, unit) -> (payload, unit) (cardinality-preserving by spec)

Preconditions (fail fast)
1.	Extents must unify (or be unifiable via existing rules). Adapters never change extent.
2.	Cardinality must match (or be broadcast-compatible via separate broadcast rules). Adapters never change cardinality.
3.	Payload must match or payload conversion must be explicitly supported by an adapter in the registry (most systems disallow payload conversion entirely; if you keep that, payload must match here).

Step 1 — build a conversion graph over (payload, unit)
Vertices: pairs (payload, unit)
Edges: adapters from registry

Step 2 — compute minimal adapter chain
Run BFS (or Dijkstra if you add costs) from (payload_s, unit_s) to (payload_t, unit_t).

Hard constraint: maximum path length = 2
•	length 0: connect directly
•	length 1: attach one adapter (choose side per policy below)
•	length 2: attach two adapters (one at each end)

If no path ≤ 2, do not auto-insert; show diagnostic and require explicit user action or a new adapter/block.

Step 3 — deterministic tie-breaking
If multiple shortest paths exist, choose deterministically using:
1.	Prefer paths with fewer semantic-boundary adapters (e.g. PhaseToScalar01) if you classify them.
2.	Prefer adapters that preserve “stronger” invariants:
•	prefer phase01 -> radians over phase01 -> scalar if the sink expects an angle unit
•	prefer scalar -> norm01 clamp only if sink requires clamped
3.	If still tied, choose lexicographically smallest (adapterKind1, adapterKind2).

No “best guess” based on runtime values.

Step 4 — where to attach (side policy)
You need a single deterministic rule so the graph doesn’t flap.

Policy:
•	If chain length is 1: attach to the sink input port (most readable; “this port expects X”).
•	If chain length is 2: attach the first adapter at the source output port and the second at the sink input port (mirrors the chain structure).

This keeps “port contract” ownership intuitive and makes normalization anchoring stable.

Step 5 — stability rule
Auto-insertion must be idempotent:
•	Running auto-adapt twice yields the same set of attachments.
•	If the user later changes a port’s required unit, the editor recomputes and either updates the adapter kind (same attachment ID) or removes it if no longer needed.

This is enforced by anchoring adapter attachments to (edgeId, portId, side) plus a deterministic chosen adapterKind.

Why this is safe
•	Uses a closed registry: no implicit casts.
•	Bounded chain length: no hidden programs.
•	Deterministic selection + attachment side: no flapping.
•	Normalization materializes concrete blocks: compiler stays strict and simple.

---

Practical implications for your “phase vs float” problem

With this spec:
•	phaseA is float:phase01
•	Any port that currently says “float” must also declare its unit:
•	if it wants phase semantics: it declares float:phase01
•	if it wants ordinary math: it declares float:scalar (or float:radians, etc.)

When a user wants to connect phaseA to a float:scalar input, the editor attaches PhaseToScalar01 on that port/edge, normalization materializes it, and the compiler sees a fully explicit graph.

That statement.