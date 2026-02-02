# Sprint: Migrate References - Remove norm01/phase01, Use Contracts
Generated: 2026-02-01
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Depends-on: SPRINT-20260201-core-types

## Sprint Goal
Remove `norm01` from UnitType, rename angle `phase01` to `turns`, and migrate ALL references to use `scalar + contract:clamp01` and `angle/turns + contract:wrap01` respectively.

## Scope
**Deliverables:**
- Remove `norm01` kind from UnitType union
- Rename angle unit `phase01` → `turns`
- Migrate all ~50 block files, 6 adapter files, 6 UI files, 12 test files
- Replace `unitNorm01()` with helper that returns `{ unit: scalar, contract: clamp01 }`
- Replace `unitPhase01()` with helper that returns `{ unit: angle/turns, contract: wrap01 }`

## Work Items

### P0: Update core UnitType and remove norm01
**Acceptance Criteria:**
- [ ] `norm01` kind removed from UnitType union in `units.ts`
- [ ] `unitNorm01()` function either removed or repurposed as convenience that returns `{ type with unit:scalar + contract:clamp01 }`
- [ ] angle unit value `'phase01'` renamed to `'turns'` in UnitType
- [ ] `unitPhase01()` updated to return `{ kind: 'angle', unit: 'turns' }` (or renamed to `unitTurns()`)
- [ ] `unitsEqual()` updated — remove `case 'norm01'`, update angle matching
- [ ] `ALLOWED_UNITS` in payloads.ts updated — remove `'norm01'` from float list
- [ ] `defaultUnitForPayload()` updated if it referenced norm01

**Technical Notes:**
- Strategy decision: Keep `unitNorm01()` as a convenience function that constructs `canonicalType(FLOAT, unitScalar(), undefined, contractClamp01())` — or remove it entirely and force callers to be explicit.
- Recommendation: KEEP as convenience but make it return the new representation. This minimizes call-site changes.
- Similarly keep `unitPhase01()` as convenience returning `{ kind: 'angle', unit: 'turns' }` with contract wrap01.

### P1: Migrate adapter blocks and adapter-spec patterns
**Acceptance Criteria:**
- [ ] `scalar-to-norm01-clamp.ts` updated: pattern matches `contract: clamp01` instead of `unit: norm01`
- [ ] `norm01-to-scalar.ts` updated: pattern matches `contract: clamp01` instead of `unit: norm01`
- [ ] `scalar-to-phase.ts` updated: angle unit `phase01` → `turns`, adds `contract: wrap01`
- [ ] `phase-to-scalar.ts` updated: angle unit `phase01` → `turns`
- [ ] `radians-to-phase.ts` updated: `phase01` → `turns` + `contract: wrap01`
- [ ] `phase-to-radians.ts` updated: `phase01` → `turns`
- [ ] All adapter-spec TypePattern references use new unit/contract values

**Technical Notes:**
- If `unitNorm01()` and `unitPhase01()` are kept as convenience functions returning new representations, adapter blocks just call the same functions and get correct types automatically.
- Adapter-spec patterns need manual update since they reference raw unit objects.

### P2: Migrate block definitions, UI, and tests
**Acceptance Criteria:**
- [ ] All ~30 block files using `unitNorm01()` or `unitPhase01()` updated (either via convenience function change or explicit migration)
- [ ] All ~6 UI files with `switch(unit.kind)` cases for `'norm01'` and `'phase01'` updated
- [ ] All ~12 test files updated with new type representations
- [ ] `src/__tests__/type-test-helpers.ts` updated
- [ ] All tests pass: `npm run test`
- [ ] Type check passes: `npm run typecheck`

**Technical Notes:**
- If convenience functions are kept (unitNorm01/unitPhase01), block files may need ZERO changes — the function just returns a different representation internally.
- BUT: block files currently use `canonicalType(FLOAT, unitNorm01())` which puts unit in the unit field. With the migration, we need `canonicalType(FLOAT, unitScalar(), undefined, contractClamp01())` — the function signature changes.
- UI switch/case statements that match on `unit.kind === 'norm01'` must change to check `type.contract?.kind === 'clamp01'` instead.
- Test assertions comparing units must change.

## Dependencies
- Sprint 1 (Core Types) must be complete first

## Risks
- **Largest risk**: Missing a reference causes runtime type mismatch that passes silently
- **Mitigation**: Run full test suite + typecheck after migration. The exhaustive switch pattern (`const _exhaustive: never = a`) in `unitsEqual` will catch any remaining `norm01` references at compile time once the union member is removed.
- **UI risk**: switch/case on unit.kind for display purposes must be updated to also check contract
