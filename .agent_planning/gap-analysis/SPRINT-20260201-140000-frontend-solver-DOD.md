# Definition of Done: Frontend Solver Completeness

Generated: 2026-02-01T14:00:00Z
Plan: SPRINT-20260201-140000-frontend-solver-PLAN.md

## Gate: Sprint Complete

All of these must be true:

- [ ] Cardinality constraint variables exist and are resolved by the type solver
- [ ] Instance identity is resolved in frontend (TypedPatch contains concrete instance refs)
- [ ] `isTypeCompatible` remains pure 2-arg function (Sprint 1 enforcement tests still green)
- [ ] Zero `withInstance()` in backend (Sprint 1 enforcement test still green)
- [ ] Adapter insertion uses only resolved types + adapter registry (no block-name lookups)
- [ ] All Sprint 1 regression TODOs resolved (tests that broke from removing impurities are green)
- [ ] TypeScript compiles with zero errors
- [ ] Full test suite passes (`npm run test`)
- [ ] No new enforcement test regressions

## Verification Commands

```bash
# All Sprint 1 enforcement tests still pass
npm run test -- --include "**/forbidden-patterns*"

# No block-name lookups in type compatibility or adapter insertion
grep -r 'getBlockCardinalityMetadata\|isCardinalityGeneric' src/compiler/frontend/
# Expected: 0 hits

# No withInstance in backend
grep -r 'withInstance' src/compiler/backend/
# Expected: 0 hits

# Full suite
npm run typecheck && npm run test
```
