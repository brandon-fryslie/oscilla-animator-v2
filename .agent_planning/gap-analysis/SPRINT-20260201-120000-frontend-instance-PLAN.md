# Sprint: Frontend-Instance - Move Instance Resolution from Backend to Frontend

Generated: 2026-02-01T12:00:00Z
Confidence: HIGH: 1, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY
Source: EVALUATION-20260201-120000.md

## Sprint Goal

Move instance ID rewriting from backend `lower-blocks.ts` to frontend type inference so that `portTypes` is the single authoritative source of resolved types and the backend never modifies types.

## Scope

**Deliverables:**
- Remove `withInstance()` type rewriting from `lower-blocks.ts:411-428`
- Add instance resolution to frontend type solver (Pass 1) so portTypes contains fully resolved instance IDs
- Backend reads portTypes as read-only (no type mutation)
- Un-skip the backend read-only enforcement test from Sprint A
- Document the instance propagation model

## Work Items

### P0: Remove Backend Type Rewriting [HIGH]

**Dependencies**: Frontend instance resolution (MEDIUM item below) must land first or simultaneously
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md Guardrail #14 | **Status Reference**: SUMMARY.md P1 #2, critical/topic-compiler-adapters.md HIGH #2

#### Description
`src/compiler/backend/lower-blocks.ts:411-428` currently rewrites output types using `withInstance()` when a block has an `inferredInstance` from upstream. This violates the spec requirement that type solver output is authoritative and backend is read-only.

The mechanical fix is to remove lines 411-428 and the associated `withInstance`/`makeInstanceRef` imports. However, this only works if frontend type inference already produces correct instance IDs in `portTypes`.

#### Acceptance Criteria
- [ ] Lines 411-428 removed from `lower-blocks.ts`
- [ ] `withInstance` and `makeInstanceRef` (aliased as `instanceRef as makeInstanceRef`) removed from imports at line 15
- [ ] `outTypes` is read directly from `portTypes` without mutation
- [ ] Backend enforcement test from Sprint A un-skipped and passing
- [ ] All existing compilation tests pass

#### Technical Notes
The `inferredInstance` variable at line 392 and the `inferInstanceContext()` function (lines 282-296) may still be needed for non-type purposes (e.g., passing instance context to block lowering functions via `LowerCtx.inferredInstance`). Review whether `LowerCtx.inferredInstance` is used by block lowering functions and if so, whether it can derive from portTypes instead.

---

### P1: Frontend Instance Resolution in Pass 1 [MEDIUM]

**Dependencies**: Decision #7 (instance resolution location) from SUMMARY.md P3
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md Guardrail #10, Guardrail #14 | **Status Reference**: SUMMARY.md P3 #7, critical/topic-compiler-adapters-CONTEXT.md

#### Description
Currently, Pass 1 (`analyze-type-constraints.ts`) resolves port types but uses placeholder instance IDs from BlockDef definitions. The backend then rewrites these with actual instance IDs inferred from upstream connections.

The fix: Move instance inference into Pass 1. After initial type resolution, propagate instance IDs along edges. When a cardinality-generic/preserving block receives a field input, its output types should carry the same instance reference.

This overlaps with Sprint B's cardinality resolution -- the instance propagation and cardinality resolution are two aspects of the same problem. If Sprint B resolves cardinality in Pass 1, instance propagation should happen at the same time.

#### Acceptance Criteria
- [ ] `portTypes` from Pass 1 contains fully resolved instance IDs for all field-typed ports
- [ ] No instance rewriting needed in backend
- [ ] Test: field output of cardinality-preserving block has correct instance from upstream
- [ ] Test: signal output of cardinality-preserving block has no instance (cardinality=one)
- [ ] Instance propagation works through chains of 2+ blocks

#### Unknowns to Resolve
1. **Placeholder vs real instances** - Pass 1 currently doesn't know about runtime instances. How does it get instance IDs? Answer: Instance declarations come from Array/domain blocks in the normalized graph. Pass 1 can read these.
2. **Instance propagation order** - Does Pass 1 need topological ordering to propagate instances? Answer: Likely yes -- propagate along edge direction.
3. **Overlap with Sprint B** - This work is tightly coupled with cardinality resolution. Consider merging if Sprint B's approach resolves instances simultaneously.

#### Exit Criteria (to reach HIGH confidence)
- [ ] User has confirmed instance resolution belongs in frontend (#7)
- [ ] Prototype propagates instances correctly through 3+ test graphs
- [ ] Edge cases handled: multiple instance sources converging on one block

---

### P2: Clean Up inferInstanceContext in Backend [MEDIUM]

**Dependencies**: Frontend instance resolution above
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md Guardrail #14 | **Status Reference**: critical/topic-compiler-adapters-CONTEXT.md

#### Description
After moving instance resolution to frontend, evaluate whether `inferInstanceContext()` (lower-blocks.ts:282-296) and `instanceContextByBlock` (lower-blocks.ts:321) are still needed. If `LowerCtx.inferredInstance` is only used for type rewriting, it can be removed entirely. If block lowering functions use it for other purposes (e.g., determining instance count), it should derive from portTypes instead.

#### Acceptance Criteria
- [ ] `inferInstanceContext()` function removed or documented as necessary
- [ ] `instanceContextByBlock` map removed or documented as necessary
- [ ] If `LowerCtx.inferredInstance` retained, it derives from portTypes (not edge-walking)
- [ ] No redundant instance inference between frontend and backend

#### Unknowns to Resolve
1. **LowerCtx.inferredInstance usage** - Search all block lowering functions for uses of `ctx.inferredInstance`. Determine if any use it for non-type purposes.
2. **IRBuilder.getInstances()** - The backend uses `builder.getInstances().get(inferredInstance)` to get instance declarations. After frontend resolution, can this be removed?

#### Exit Criteria (to reach HIGH confidence)
- [ ] Full audit of `ctx.inferredInstance` usage in all block lowering functions
- [ ] Clear determination: remove entirely vs. derive from portTypes

## Dependencies
- Sprint A (housekeeping): enforcement tests must exist first
- Sprint B (type-compat-purity): cardinality resolution is closely related -- consider parallel or sequential execution
- User decision #7 (instance resolution location): blocks the MEDIUM items

## Risks
- **Risk**: Removing backend instance rewriting before frontend resolves instances will break field compilation. **Mitigation**: Implement frontend resolution first or simultaneously.
- **Risk**: `inferredInstance` is used by block lowering functions for non-type purposes. **Mitigation**: Audit all usages before removing.
- **Risk**: Instance propagation in Pass 1 requires topological ordering that doesn't exist yet. **Mitigation**: Pass 1 already iterates blocks in order; may need to add edge-following logic.
