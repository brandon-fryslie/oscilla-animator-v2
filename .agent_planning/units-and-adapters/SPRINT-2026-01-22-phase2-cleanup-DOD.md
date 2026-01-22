# Definition of Done: phase2-cleanup
Generated: 2026-01-22
Confidence: HIGH
Plan: SPRINT-2026-01-22-phase2-cleanup-PLAN.md

## Acceptance Criteria

### Remove Dual Enforcement
- [ ] `checkUnitCompatibility` function deleted from pass2-types.ts
- [ ] Call to `checkUnitCompatibility` removed (lines 383-387)
- [ ] `isTypeCompatible` is the single enforcer for unit checks
- [ ] Unit mismatch test still passes as hard error

### Fix Dead Guard
- [ ] Line 77 simplified: `if (from.unit.kind !== to.unit.kind)`
- [ ] No runtime behavior change

### Remove Dead Import
- [ ] `NumericUnit` removed from import at line 17
- [ ] No other usage of NumericUnit in this file

## Verification Commands

```bash
npm run typecheck
npm run test
```

## Definition of Complete

This sprint is complete when:
1. All three fixes applied
2. TypeScript compiles cleanly
3. All tests pass
4. No behavior change (same errors, same passes)
