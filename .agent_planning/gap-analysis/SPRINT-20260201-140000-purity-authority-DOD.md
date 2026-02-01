# Definition of Done: Purity & Authority Hardening

Generated: 2026-02-01T14:00:00Z
Plan: SPRINT-20260201-140000-purity-authority-PLAN.md

## Gate: Sprint Complete

All of these must be true:

- [ ] `isTypeCompatible` is a pure 2-arg function (no block-name params)
- [ ] Zero `withInstance()` / type mutation calls in `src/compiler/backend/`
- [ ] Zero backend imports from `../frontend/`
- [ ] Enforcement tests 1-3 pass (green)
- [ ] Enforcement tests 4-5 exist as skipped with Sprint 3 TODO
- [ ] All 29 existing enforcement tests pass
- [ ] Zero `.bak`/`.backup2`/`.patch` files in `src/`
- [ ] instanceId enforcement test tightened
- [ ] TypeScript compiles (or failures are documented as Sprint 2 TODOs)
- [ ] Any test regressions documented with clear Sprint 2 markers

## Verification Commands

```bash
# Purity check
grep -r 'sourceBlockType\|targetBlockType\|getBlockCardinalityMetadata' src/compiler/frontend/analyze-type-graph.ts
# Expected: 0 hits

# Backend read-only check
grep -r 'withInstance\|withCardinality\|withTemporality' src/compiler/backend/
# Expected: 0 hits

# Backend boundary check
grep -r "from '\.\./frontend/" src/compiler/backend/
# Expected: 0 hits

# Backup files check
find src/ -name '*.bak' -o -name '*.backup2' -o -name '*.patch'
# Expected: 0 hits

# Full test suite
npm run typecheck && npm run test
```
