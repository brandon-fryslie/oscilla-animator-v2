90–95% complete checklist (bulk work)

A. Type surface-area inventory
•	ripgrep shows exactly one canonical value-type shape used for ports/wires: CanonicalType, and everything else is an alias.
•	No new structs exist that restate payload/unit/extent (e.g. ResolvedPortType, ConcreteType, PortType as a separate interface).
•	All “port type” getters return the canonical type alias, not bespoke objects.

B. Derived labels are not stored
•	No port/wire/expression node stores kind: 'sig'|'field'|'event' (or isField, isEvent, etc.) as authoritative type info.
•	There is a single classifyValue(canonicalType) helper used everywhere a label is needed.

C. Constraint solving ownership
•	Frontend produces a TypedPatch artifact that includes canonical types for every port + edge, even when compilation fails later.
•	Backend consumes typed+normalized graph and does no type inference and no adapter insertion.

D. Default usage is quarantined
•	Defaults (AxisTag.default, defaultUnitForPayload) are used only at creation-time for ergonomic constructors, not to “fix” unresolved types during checking.
•	No call sites use defaultUnitForPayload as a fallback when inference didn’t resolve.

E. Compatibility is purely type-based
•	Every connectability decision is driven by isTypeCompatible(from: CanonicalType, to: CanonicalType) plus explicit adapter blocks.
•	No block-name-based exceptions (Const not special-cased; Timeroot exception only if explicitly permitted).

F. Mechanical refactors are complete
•	All old helper constructors (e.g. signalTypeField, signalTypeSignal, signalTypeTrigger) either:
•	remain as thin wrappers that just set extent axes on CanonicalType, or
•	are removed and replaced with CanonicalType construction + extent overrides.
•	All locations that previously used “world” concepts (signal/field/event) now use extent axes or derived classification.

