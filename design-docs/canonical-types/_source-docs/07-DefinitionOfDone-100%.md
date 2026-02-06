
100% complete checklist (cannot be rationalized away)

1) Hard “no old types” proof
   •	Repository-wide rg for each legacy/banned symbol returns 0 hits (or hits only in a single compatibility shim file marked @deprecated with a removal ticket):
   •	ResolvedPortType
   •	ConcreteType (as a separate interface/shape)
   •	SignalPortType / FieldPortType / EventPortType (as separate shapes)
   •	isField, isSignal, isEvent, port.kind ===
   •	any struct with { payload: ..., unit: ..., extent: ... } that is not the canonical alias
   •	There is exactly one exported canonical type and it is imported everywhere types are discussed.

2) CanonicalType completeness is enforced by code, not convention
   •	There is a single predicate isResolvedCanonicalType(t) used as a gate.
   •	The frontend produces either:
   •	fully resolved types, or
   •	a typed-but-unresolved result with explicit diagnostics explaining what is unresolved.
   •	Any attempt to lower/compile with unresolved types throws a single, clear “unresolved type” diagnostic (not a cascade of mismatches).

3) No fallback semantics exist
   •	defaultUnitForPayload is never called from:
   •	getPortType()
   •	isTypeCompatible()
   •	any pass that is deciding connectability
   •	If a unit var isn’t solved, the system reports “unsolved unit var” rather than silently treating it as scalar.

4) One classification function, zero ad-hoc checks
   •	There is exactly one implementation of:
   •	classifyValue(t): 'static'|'signal'|'field'|'event' (or whatever labels you use)
   •	rg confirms there are no other checks of (temporality/cardinality) combos scattered around that re-derive the label differently.

5) Adapter insertion is the only conversion mechanism
   •	Every conversion that makes an invalid connection valid results in:
   •	an explicit adapter block in the normalized graph
   •	an explicit edge rewiring visible to the UI
   •	rg confirms there is no implicit conversion logic inside isTypeCompatible besides equality / exact-match rules.

6) TypedPatch is stable and UI-safe even on failure
   •	Given a patch with a known type error (e.g., degrees → radians), the frontend still returns:
   •	port types for all ports it can resolve
   •	precise diagnostics for the mismatch
   •	a deterministic place in the UI to insert the correct adapter
   •	This is covered by a test that asserts TypedPatch existence and diagnostic content even when backend compilation fails.

7) Tests that prove eradication of old behavior
   •	Add a “type system invariants” test suite that:
   •	fails if any banned symbol appears in the compiled output bundle (string scan of built artifacts)
   •	fails if any port type contains unresolved vars at the backend boundary
   •	fails if any adapter insertion occurs in backend passes
   •	CI runs these invariant tests.

8) Documentation lock-in
   •	A single CANONICAL-TYPES.md (or similar) exists with:
   •	canonical type shape
   •	the resolvedness predicate
   •	the classification function definition
   •	the exact rule: “no other type structs allowed”
   •	The doc is referenced at the top of the canonical types module and in the frontend entrypoint.

9) Migration shims are either gone or quarantined
   •	If any shims remain, they live in one folder (e.g., src/compat/) and:
   •	are not imported by new code
   •	have a single import path that is easy to delete later
   •	are forbidden from being used in frontend/backend boundaries

⸻

The “agent-proof” acceptance gates

These are binary gates you can enforce in CI so nobody can argue:
1.	Ripgrep gate: a script that asserts banned identifiers count == 0.
2.	Backend boundary gate: compile fails if any CanonicalType crossing into backend is unresolved.
3.	Single-classifier gate: compile fails if more than one classifyValue implementation exists (exported symbol uniqueness + rg guard).
4.	No-fallback gate: defaultUnitForPayload may not be referenced from specified files/functions (getPortType, compatibility, passes).
5.	Adapter-only gate: a test that intentionally creates a mismatch and asserts normalization inserts an adapter block (and without that, the edge remains invalid).

That’s the checklist.