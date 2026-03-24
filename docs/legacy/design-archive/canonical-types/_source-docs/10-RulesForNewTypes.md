Rules for adding any new type-related thing (so you don’t leak “old world” concepts)

1) There is only one semantic type carrier
   •	Every value-producing artifact that can be connected / stored / evaluated must carry exactly one type field:
   type: CanonicalType
   •	CanonicalType := { payload, unit, extent } is the only place semantics live.
   •	Do not add parallel type fields like isField, domainId, isEvent, stride, world, signalKind, etc. If you need it, it must be derivable from CanonicalType (or from non-type graph metadata like block identity).

2) No “signal/field/event” encoded in names or enums
   •	You may keep legacy wrappers during migration, but new additions must not introduce:
   •	SignalType, FieldType, EventType
   •	signalTypeField()-style constructors as the primary representation
   •	“Signal vs Field vs Event” is not a type, it’s a derived classification from extent.
   •	If you need a helper, it returns a CanonicalType with an extent shape, not a new type family.

3) Extent axes must be total and non-contradictory
   When you introduce a new kind of value, you must be able to assign all 5 axes meaningfully:
   •	cardinality: zero | one | many(instance)
   •	temporality: continuous | discrete
   •	binding: unbound | weak(ref) | strong(ref) | identity(ref)
   •	perspective: a concrete id (or default)
   •	branch: a concrete id (or default)

If you can’t assign an axis, you’re trying to model something that isn’t a value type (it might be config, a block param, a graph resource, or a compile-time construct).

4) Axis meaning is enforced by invariants, not “best effort”
   For every new IR node / expression kind you add, you must also add:
   •	A validation rule that checks its required extent shape.
   •	A construction rule (IRBuilder assertions or a frontend validation pass) that prevents invalid combinations from being created.

Example: if you add ValueExprSampleAndHold, you must specify:
•	allowed temporality (continuous output, discrete trigger input)
•	allowed cardinality relationships (preserve / broadcast / reduce)
•	what happens to binding/perspective/branch (usually preserve)

5) Payload and unit are inseparable contracts
   •	Every CanonicalType has a payload and a unit. Unit is never optional.
   •	If a payload “doesn’t have units,” it uses unit.kind = 'none' (closed union).
   •	Add a payload ⇒ you must update the allowed unit table and a default unit.
   •	Add a unit ⇒ you must update allowed units and adapter policy, plus any explicit conversion blocks.

6) Literal representation must be payload-shaped, not “anything”
   If you add/extend const/literal support:
   •	The runtime literal representation must be a discriminated union keyed by payload kind, not number|string|boolean.
   •	The literal node must satisfy: literal.shape is a function of type.payload.kind.
   •	If you can store a value whose JS type doesn’t correspond to the payload, you have a hole.

7) Don’t store derived info in CanonicalType
   CanonicalType should not accumulate caches like:
   •	stride (derive from payload)
   •	isEvent/isField (derive from extent)
   •	domainId strings (derive from cardinality.many.instance)
   •	“defaulted” flags (resolve defaults once, then operate on resolved form)

If you need performance, add separate ResolvedCanonicalType that is mechanically derived from CanonicalType, and keep it one-way.

8) Every conversion across axes must be explicit and typed
   •	Any operation that changes any axis must be represented as:
   •	an explicit block/adapter, or
   •	an explicit IR node with a declared type transform.
   •	No hidden coercions like “signal auto-lifts to field” unless it is represented as an explicit adapter (e.g., Broadcast) or an explicit expression node whose type transform is validated.

9) “Default” is a temporary authoring convenience, not a semantic state
   •	Defaults (AxisTag.default) exist only until a defined “resolution point.”
   •	After that point, you should be working with fully-instantiated axes (a resolved form), and validators should require that.

10) Adding a new axis is forbidden without a full-system audit
    •	You don’t add a 6th axis “just for this feature.”
    •	If you think you need it, it’s almost always one of:
    •	payload
    •	unit
    •	binding target semantics (referent)
    •	graph/resource metadata (not a type)

11) Cardinality and temporality must be treated as orthogonal, even if your current runtime isn’t
    •	You’re allowed to currently only implement:
    •	continuous for values and
    •	discrete for events,
    but the type system must still be able to represent the cross-product without lying.
    •	If you forbid some combinations today, forbid them explicitly in validation rules; don’t pretend they “can’t exist by definition.”

12) “New type work” isn’t done until it’s used end-to-end
    Whenever you add a new payload/unit/expr kind, Definition-of-Done requires:
    •	CanonicalType can express it (payload+unit+extent)
    •	ports can declare it
    •	constraints/unification can propagate it
    •	validation rejects mismatches
    •	lowering/eval/render can consume it (or it is explicitly blocked with a diagnostic)
    •	inspector/UI can display it

These are the rules to keep the system mechanically consistent and prevent the “old world” types from reappearing.