Then you need one move that’s conceptually simple but mechanically far-reaching:

stop encoding “signal/field/event” as separate IR families, and make them derived views of a single, axis-complete type system.

Below is the canonical, engineer-ready spec for that redesign.

⸻

1) CanonicalType becomes the whole truth

1.1 CanonicalType axes

CanonicalType = { payload, unit, extent }

extent MUST be able to represent every value “shape” the system supports:

Extent = {
cardinality: { kind: 'zero' } | { kind: 'one' } | { kind: 'many', instanceId: InstanceId },
temporality: 'continuous' | 'discrete',
binding: 'unbound' | 'weak' | 'strong' | 'identity',
perspective: 'default',  // keep as-is
branch: 'default',       // keep as-is
}

1.2 No other “kind” field exists in types

There is no sig/field/event wrapper type, and no k: 'sig' | 'field' | 'event' in type land.

If you still want to display “Signal / Field / Event” in UI, it is derived:
•	Signal := {cardinality: one, temporality: continuous}
•	Field := {cardinality: many(instance), temporality: continuous}
•	Event := {temporality: discrete} (with cardinality either one or many(instance))

This is purely a naming layer.

⸻

2) Single expression IR: ValueExpr

2.1 Replace SigExpr / FieldExpr / EventExpr with one family

All computed values are ValueExprId referring into a single ValueExpr[] table.

type ValueExprId = number;

type ValueExpr =
| { op: 'const', type: CanonicalType, value: ConstValue }
| { op: 'external', type: CanonicalType, channel: string }
| { op: 'intrinsic', type: CanonicalType, which: 'index'|'normIndex'|'randomId'|'uv'|'rank'|'seed' }
| { op: 'kernel', type: CanonicalType, kernelId: KernelId, args: ValueExprId[] }
| { op: 'phi', type: CanonicalType } // for cycles / SSA-like graph lowering
| { op: 'state', type: CanonicalType, stateOp: StateOp, args: ValueExprId[] }
;

Key rule: every ValueExpr carries its CanonicalType, and that CanonicalType is the solver result, not guessed.

2.2 Kill “FieldExprBroadcast/Zip/Map” as separate expression kinds

Broadcast/Zip/Map are not “field-only” expression families. They are just kernels or adapters whose legality is determined by the axes:
•	Broadcast: one → many(instance) with other axes preserved.
•	Zip: requires identical cardinality and compatible temporality rules (see below).
•	Map: same.

You can keep specialized implementations for performance, but not specialized semantics.

⸻

3) Semantics of temporality and cardinality (operational contract)

This is the part that makes the axes real instead of decorative.

3.1 Temporality semantics

Every value has a notion of “when it updates”:
•	continuous: value is defined for every frame (or every sample step in your engine).
•	discrete: value is defined only at ticks/edges; between ticks, it is not implicitly held.

If something needs “hold-last-value,” that is an explicit operator:
•	Hold: discrete → continuous with a defined hold policy.
•	Latch: event-driven state update.

No implicit conversions.

3.2 Cardinality semantics

Cardinality describes indexing over an instance domain, not vector stride, not bundling:
•	one: one value per frame.
•	many(instanceId): one value per lane, per frame (or per tick if discrete).

“vec2/vec3/color stride” is part of payload, not cardinality.

⸻

4) Type legality rules for kernels/blocks

Every kernel (and thus every block) advertises a type function over these axes.

4.1 Kernel signature language (mandatory)

Each kernel must specify:
•	payload transform
•	unit transform
•	extent constraints and transforms

Example: Add (pure pointwise)

Add:
inputs:  a: T, b: T   (same payload+unit)
output:  T
extent constraints:
- cardinality: either equal, OR one can be broadcast to the other via explicit adapter insertion (frontend policy)
- temporality: both inputs must match, OR require explicit Hold/Sample adapter (no implicit)
extent transform: preserve

Example: Broadcast

Broadcast:
input:  {cardinality: one, temporality: X}
output: {cardinality: many(instance), temporality: X}
other axes preserved

Example: Pulse (continuous → discrete)
(Your current “EventExpr” becomes just discrete temporality.)

Pulse:
input:  {temporality: continuous, payload: float}
output: {temporality: discrete, payload: bool or float}
cardinality preserved

This immediately makes “field with discrete temporality” a valid, meaningful thing: a per-lane event stream.

⸻

5) Runtime evaluation model (so this doesn’t become hand-wavy)

5.1 Storage is keyed by (ValueExprId, lane)

You already have a slot system; extend the addressing scheme so it’s coherent for all axis combinations:
•	For cardinality: one, allocate stride contiguous slots.
•	For cardinality: many(instance), allocate stride * instanceCount contiguous slots.

For discrete temporality, you still allocate the same shape, but you also allocate a stamp buffer:
•	valueStamp[ValueExprId, lane] = lastTickOrFrameWritten
•	The value is considered “present” only if stamp == currentTick (or meets whatever discrete time key you use).

No holding unless an explicit Hold operator exists and writes continuous values every frame.

5.2 Evaluation has two clocks

You need explicit separation:
•	frameIndex (continuous)
•	tickIndex (discrete / event step)

A discrete expression is evaluated/propagated only on ticks, continuous on every frame.

If you currently only have frames, you can define “tick == frame” as v0, but the contract must exist.

⸻

6) Frontend normalization and adapters under the axis-complete world

Your stated adapter philosophy fits perfectly here, but now it’s cleanly grounded:
•	Frontend is allowed to auto-insert only blocks whose adapterSpec is an extent-transforming kernel with well-defined type function.
•	Example: float→phase01 wrapping is just a unit+payload interpretation with extent.preserve and pure+stable.

Because everything is CanonicalType, the adapter search works uniformly:
•	It doesn’t care whether the endpoints “were signals or fields.”
•	It cares about {payload, unit, extent} deltas.

⸻

7) What gets deleted / refactored

7.1 Delete as semantic primitives
•	SigExpr, FieldExpr, EventExpr as separate typed expression families.
•	“field-only” port types (signalTypeField() style) as a fundamental concept.

7.2 Keep as implementation optimizations (optional)
•	Specialized evaluators for common cases (scalar continuous one-lane).
•	Specialized kernels for broadcasting or zip on tight loops.

But those are lowerings, not semantics.

⸻

8) The invariants that prevent backsliding into ad-hoc land
    1.	CanonicalType is complete: no additional semantic flags (“isField”, “isEvent”, etc.) are permitted anywhere in typing or IR.
    2.	All legality is expressed as constraints on axes, never “if expr.kind === …”.
    3.	All conversions are explicit blocks, whether auto-inserted or user-inserted.
    4.	No implicit hold: discrete values do not magically become continuous; any “between ticks” meaning requires an explicit operator.
    5.	Cardinality is domain indexing only: vectors/colors never use cardinality, only payload stride/shape.

⸻

If you implement exactly that, the axes will genuinely cover everything, and “signal/field/event” becomes nothing more than derived naming plus a few optimized fast paths in the backend.