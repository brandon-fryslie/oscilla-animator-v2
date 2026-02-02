# Definition of Done: Sprint 3 Cleanup & Hardening

**Generated**: 2026-02-02
**Status**: READY FOR IMPLEMENTATION
**Plan**: SPRINT-20260202-sprint3-cleanup-PLAN.md

## Acceptance Criteria

### T1: Phase 1 lens expansion tests
- [ ] 5+ tests in pass2-adapters.test.ts covering expandExplicitLenses
- [ ] Test: single lens on input port → lens block inserted, edges rewired
- [ ] Test: multiple lenses on same port → all expanded correctly
- [ ] Test: lens type not found in registry → graceful error/skip
- [ ] Test: lens on port with no incoming edge → no crash
- [ ] All new tests pass

### T2: typesMatch() fix
- [ ] typesMatch() uses structured unit comparison (not just unit.kind)
- [ ] Test: angle{radians} vs angle{degrees} → returns false
- [ ] Test: space{world2} vs space{world3} → returns false
- [ ] Test: exact matches still work (float/scalar matches float/scalar)

### T3: Debug logging removed
- [ ] Zero console.log statements in src/ui/reactFlowEditor/lensUtils.ts
- [ ] Grep confirms no debug logging in lens-related files

### T4: Doc comment accuracy
- [ ] normalize-adapters.ts header comment accurately describes both phases
- [ ] Phase 2 description says "auto-insert adapters" not "type validation"

### T5: Diagnostic action fix
- [ ] "Add Adapter" diagnostic action either fully works or is disabled/removed
- [ ] No test creates orphan blocks via diagnostic actions

### T6: JSON.stringify (if applicable)
- [ ] Investigate and either fix or document why it's acceptable

## Regression Requirements
- [ ] All existing tests pass (npx vitest run)
- [ ] TypeScript builds clean (npx tsc --noEmit)
- [ ] No new console warnings

## Exit Criteria
Sprint is DONE when all T1-T5 are checked and regression passes.
T6 is optional — investigate and decide.
