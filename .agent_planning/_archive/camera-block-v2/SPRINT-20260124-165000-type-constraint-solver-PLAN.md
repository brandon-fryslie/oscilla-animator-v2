# Sprint: type-constraint-solver - Implement Constraint-Based Type Inference

Generated: 2026-01-24T16:50:00Z
Confidence: HIGH: 2, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY

## Sprint Goal

Replace ad-hoc unit inference with a proper constraint solver that resolves all polymorphic types (payload + unit) or emits actionable compile errors.

## Scope

**Deliverables:**
- Constraint solver pass that resolves all polymorphic types deterministically
- Hard errors for unresolved types (no `scalar` fallback)
- All 16 unit-mismatch test failures fixed
- Const blocks become unit-polymorphic by definition

## Work Items

### P0: Remove scalar fallback in pass2-types.ts (HIGH)

**Acceptance Criteria:**
- [ ] `getPortType()` returns `UnresolvedType` sentinel for unresolved polymorphic ports
- [ ] Compilation fails with diagnostic for unresolved types
- [ ] Diagnostic includes: block, port, why unconstrained, fix suggestions
- [ ] No silent `defaultUnitForPayload()` fallback for generic blocks

**Technical Notes:**
- Line 288-296 in pass2-types.ts currently falls back to `defaultUnitForPayload()`
- Replace with: if polymorphic and unresolved → return sentinel → later fail with diagnostic
- This change will make tests fail loudly rather than silently mismatching

### P1: Define unit-polymorphic types in block definitions (HIGH)

**Acceptance Criteria:**
- [ ] Const block output type is `float<UnitVar>` not `float<scalar>`
- [ ] UnitVar is a placeholder that MUST be resolved by constraint solving
- [ ] Block definitions can declare unit constraints (e.g., "output unit = input unit")
- [ ] Camera block inputs have concrete units (no change needed there)

**Technical Notes:**
- Add `UnitVar` to canonical-types.ts as a special unit kind
- Const output changes from `canonicalType('float')` to `canonicalType('float', unitVar())`
- Other generic blocks (Add, Mul, etc.) may need similar treatment

### P2: Implement constraint solver pass (MEDIUM)

**Acceptance Criteria:**
- [ ] New pass `pass0.5-type-constraints.ts` runs after pass0 (structural) and before pass1 (default sources)
- [ ] Collects constraints from all edges: `Type(fromPort) == Type(toPort)`
- [ ] Unifies payload variables and unit variables
- [ ] Produces `resolvedPortTypes: Map<PortKey, CanonicalType>`
- [ ] Handles transitive constraints (A→B→C propagates A's type to C)

**Technical Notes:**
- Use union-find or simple propagation algorithm
- Initialize known types from monomorphic ports
- For each edge, unify source and target types
- After fixed point: any remaining UnitVar is an error

### P3: Integrate solver output into pass2-types.ts (MEDIUM)

**Acceptance Criteria:**
- [ ] `getPortType()` first checks `resolvedPortTypes` cache
- [ ] Falls back to monomorphic definition only if not polymorphic
- [ ] Polymorphic ports without resolved type → compile error
- [ ] All existing tests pass

**Technical Notes:**
- `resolvedPortTypes` keyed by `blockId:portName:in|out`
- pass2-types receives solved types from earlier pass
- No type fabrication allowed in pass2

## Dependencies

- P0 must complete first (makes failures visible)
- P1 and P2 can proceed in parallel
- P3 depends on P2

## Risks

- **Ordering**: Solver must run after default sources are materialized OR handle them specially
- **Adapters**: Unit conversion adapters may interact with constraint solving (need to ensure adapters are inserted AFTER solving, not during)
- **Cycles**: Graph cycles need careful handling in solver (should work with union-find)
