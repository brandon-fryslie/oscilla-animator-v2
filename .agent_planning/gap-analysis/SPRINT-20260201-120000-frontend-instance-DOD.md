# Definition of Done: Frontend-Instance

Generated: 2026-02-01T12:00:00Z
Status: PARTIALLY READY
Plan: SPRINT-20260201-120000-frontend-instance-PLAN.md

## Acceptance Criteria

### Remove Backend Type Rewriting
- [ ] Lines 411-428 removed from `lower-blocks.ts`
- [ ] `withInstance` and `makeInstanceRef` removed from `lower-blocks.ts` imports (line 15)
- [ ] `outTypes` read directly from `portTypes` without any `.map()` transformation
- [ ] Backend enforcement test (from Sprint A) un-skipped and passing
- [ ] Zero calls to `withInstance()` in `src/compiler/backend/` directory

### Frontend Instance Resolution
- [ ] `portTypes` from Pass 1 contains fully resolved instance IDs
- [ ] Field-typed output ports of cardinality-preserving blocks carry correct instance reference
- [ ] Test: Array(Circle,10) -> Mul(field, signal) output portType has Circle instance
- [ ] Test: signal -> Sin output portType has cardinality=one (no instance)
- [ ] Test: chain of cardinality-preserving blocks propagates instance correctly

### Backend Cleanup
- [ ] `inferInstanceContext()` removed or justified with documented reason
- [ ] `instanceContextByBlock` removed or justified
- [ ] `LowerCtx.inferredInstance` removed or derives from portTypes
- [ ] No redundant instance inference between frontend and backend

### Global
- [ ] `npm run build` passes (zero typecheck errors)
- [ ] `npm run test` passes (all tests green)
- [ ] Backend directory (`src/compiler/backend/`) imports no type-mutating functions from `canonical-types.ts`

## Exit Criteria (for MEDIUM items to reach HIGH)
- [ ] User has confirmed instance resolution belongs in frontend (SUMMARY.md P3 #7)
- [ ] Full audit of `ctx.inferredInstance` usage across all block lowering functions
- [ ] Prototype passes all existing compilation tests
