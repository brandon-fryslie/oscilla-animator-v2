Canonical block definitions impact

1) Every block signature becomes a TypeScheme, not a pile of ad-hoc TypeDescs
   •	Each port’s type is a TypeExpr that may include type variables.
   •	Each block definition has:
   •	typeParams: TypeVar[]
   •	ports: { in/out: PortDef[] } where PortDef.type: TypeExpr
   •	constraints: Constraint[] (typeclasses + structural constraints)
   •	loweringContract: { worldRequirements, scheduleStepsEmitted } (non-type, but still part of the canonical block spec)

2) “Add”/“Mul”/etc. become one block per operator (generic), not per-world
   •	Instead of AddSignal, AddField, AddScalar, you define one Add with a type scheme like:
   •	Add<TWorld, TValue>(a: T, b: T) -> T
   •	constrained by Numeric(TValue) and SameShape(TWorld, a, b) (where shape is signal/field/scalar compatibility).
   •	If you want signal + scalar broadcast or field + scalar broadcast, that becomes an explicit rule:
   •	either a separate block (BroadcastAdd) or a constraint-driven coercion that inserts a canonical adapter in normalization (but if you forbid compiler auto-insertions, then it must be a distinct block or editor-authored edge role).

3) Field-ness and value-domain are always explicit in the type
   •	A field type is not “a signal with fieldDomain”; it’s a distinct world:
   •	TypeDesc{ world:"field", indexDomain: DomainId, valueDomain: DomainId }
   •	That means block signatures that operate on fields must declare:
   •	which index domain they preserve/require (often “same index domain as input” via a type variable).
   •	Example: Map2DToPos is field<idx=Particles, value=vec2> out; it’s not “maybe has fieldDomain”.

4) Bus and default-source “blocks” are still blocks in the canonical library
   •	They are not a separate concept in the compiler schema.
   •	They differ only by editor role metadata and UI affordances.
   •	So the block library includes definitions for:
   •	GlobalJunction / BusJunction block (one canonical internal node type),
   •	DefaultSource blocks (const/time/whatever), if they truly exist as nodes post-normalization,
   •	State blocks (UnitDelay, Integrator, etc.) even if shown as edge sidecars.

5) Port combine semantics are part of the block definition
   •	Because multi-input is universal, each input port must specify:
   •	combineMode (explicit enum; no optionals)
   •	combineIdentity (if required; also explicit)
   •	whether combine happens in world signal vs field vs event
   •	This stops engineers from inventing combine behavior ad hoc in compilation passes.

6) “Polymorphic const” becomes clean and unavoidable
   •	You don’t want six Const* blocks: you define:
   •	Const<T>(value: ConstLit<T>) -> T
   •	with T inferred from downstream constraints.
   •	If you also want editor-authored literal typing, the literal’s ConstLit carries a concrete domain (e.g., number/vec2/color), and unification checks compatibility.

7) Block lowering interfaces become uniform
   •	Lowering is keyed by world + expression table:
   •	signal outputs must return SignalExprId (or write directly to slots via steps),
   •	field outputs must return FieldExprId,
   •	event outputs return EventExprId.
   •	Canonical block definitions must state which table(s) they participate in; no hidden behavior via optional properties.