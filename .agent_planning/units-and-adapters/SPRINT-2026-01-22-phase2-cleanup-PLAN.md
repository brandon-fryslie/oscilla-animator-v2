# Sprint: phase2-cleanup - Pre-Adapter Cleanup Fixes
Generated: 2026-01-22
Confidence: HIGH
Status: READY FOR IMPLEMENTATION
Source: AUDIT-2026-01-22-unit-adapter-migration.md

## Sprint Goal
Fix P1 issues identified in the unit system audit: remove dual enforcement, dead code, and unused imports in the type checking pass before implementing the adapter system.

## Scope

**Deliverables:**
- Remove dead guard in `isTypeCompatible` (unit is mandatory, guard is unreachable)
- Remove redundant `checkUnitCompatibility` function (dual enforcement violation)
- Remove unused `NumericUnit` import from pass2-types.ts

**Out of Scope:**
- Adapter block definitions (Sprint 2)
- TypeSignature extension (Sprint 2)
- Any functional changes to type checking behavior

## Work Items

### P0: Remove dual enforcement in pass2-types.ts

**Dependencies**: None
**Spec Reference**: Single Enforcer principle
**Location**: `src/compiler/passes-v2/pass2-types.ts`

#### Description
The unit compatibility check exists in two places with different severities:
1. `isTypeCompatible()` line 77: hard error (correct, single enforcer)
2. `checkUnitCompatibility()` lines 263-279: soft warning (redundant, unreachable for mismatches)

The warning path is unreachable: by the time `checkUnitCompatibility` is called (line 383), any unit mismatch has already been caught as a hard error by `isTypeCompatible` (line 367). The function should be removed entirely.

#### Acceptance Criteria
- [ ] `checkUnitCompatibility` function removed (lines 263-279)
- [ ] Call to `checkUnitCompatibility` removed (lines 383-387)
- [ ] `isTypeCompatible` remains the single enforcer for unit compatibility
- [ ] Unit mismatch test (`unit-validation.test.ts:29`) still passes
- [ ] No behavior change: unit mismatches still produce hard errors

### P0: Fix dead guard in isTypeCompatible

**Dependencies**: None
**Location**: `src/compiler/passes-v2/pass2-types.ts:77`

#### Description
```typescript
// Current (dead guard):
if (from.unit && to.unit && from.unit.kind !== to.unit.kind) {

// Correct (unit is mandatory per SignalType interface):
if (from.unit.kind !== to.unit.kind) {
```

`SignalType.unit` is declared as `readonly unit: Unit` (non-optional). The truthiness guard is dead code from before unit became mandatory.

#### Acceptance Criteria
- [ ] Guard simplified to `if (from.unit.kind !== to.unit.kind)`
- [ ] TypeScript still compiles cleanly
- [ ] All existing tests pass unchanged
- [ ] No behavior change

### P1: Remove unused NumericUnit import

**Dependencies**: None
**Location**: `src/compiler/passes-v2/pass2-types.ts:17`

#### Description
```typescript
import type { SignalType, NumericUnit } from "../../core/canonical-types";
```
`NumericUnit` is imported but never used in this file.

#### Acceptance Criteria
- [ ] `NumericUnit` removed from import statement
- [ ] TypeScript compiles cleanly
- [ ] No other files affected

## Dependencies

None. This sprint can be executed independently before or in parallel with Sprint 2.

## Risks

None. All changes are removal of dead/redundant code with no behavior change.

## Success Criteria

- [ ] All three fixes applied
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (858+ tests)
- [ ] Unit mismatch remains a hard error (existing test verifies)
- [ ] Single enforcer for unit compatibility: `isTypeCompatible` only
