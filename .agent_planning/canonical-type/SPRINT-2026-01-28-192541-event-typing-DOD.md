# Definition of Done: event-typing
Generated: 2026-01-28-192541
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-2026-01-28-192541-event-typing-PLAN.md

## Acceptance Criteria

### C-1: Add type: CanonicalType to EventExpr

#### Type Definitions
- [ ] EventExprConst (types.ts:330-333) has `readonly type: CanonicalType` field
- [ ] EventExprPulse (types.ts:335-338) has `readonly type: CanonicalType` field
- [ ] EventExprWrap (types.ts:340-345) has `readonly type: CanonicalType` field
- [ ] EventExprCombine (types.ts:347-350) has `readonly type: CanonicalType` field
- [ ] EventExprNever (types.ts:352-354) has `readonly type: CanonicalType` field

#### Helper Function
- [ ] `eventType(cardinality: CardinalityAxis): CanonicalType` exists in canonical-types.ts
- [ ] Helper enforces: payload.kind='bool', unit.kind='none', temporality='discrete'
- [ ] Helper is exported and available to construction sites

#### Construction Sites (estimate 30+)
- [ ] All EventExpr construction sites updated to include type field
- [ ] All construction sites use eventType() helper OR manually enforce invariants
- [ ] No EventExpr created with payload≠bool OR unit≠none OR temporality≠discrete

#### Test Coverage
- [ ] Test exists: EventExprConst invariant validation (payload=bool, unit=none, temporality=discrete)
- [ ] Test exists: EventExprPulse invariant validation
- [ ] Test exists: EventExprWrap invariant validation
- [ ] Test exists: EventExprCombine invariant validation
- [ ] Test exists: EventExprNever invariant validation
- [ ] Tests verify cardinality can be 'one' or 'many(instance)'
- [ ] All existing tests pass (with type fields added to fixtures)
- [ ] TypeScript compilation succeeds

---

### C-6: Fix string → InstanceId Leakage

#### Type Definitions
- [ ] InstanceDecl (types.ts:435) uses `readonly id: InstanceId` (not string)
- [ ] StepMaterialize (types.ts:540) uses `readonly instanceId: InstanceId`
- [ ] StepRender (types.ts:546) uses `readonly instanceId: InstanceId`
- [ ] StepContinuityMapBuild (types.ts:587) uses `readonly instanceId: InstanceId`
- [ ] StepContinuityApply (types.ts:598) uses `readonly instanceId: InstanceId`
- [ ] StateMappingField (types.ts:681) uses `readonly instanceId: InstanceId`

#### Construction Sites
- [ ] All construction sites updated to use instanceId() factory function
- [ ] No raw strings passed where InstanceId expected (TypeScript enforces)
- [ ] All imports of InstanceId come from core/ids.ts (not Indices.ts)

#### Verification
- [ ] All tests pass
- [ ] TypeScript compilation succeeds
- [ ] Zero type errors related to InstanceId
- [ ] Grep verification: no `instanceId: string` in Step types

---

## Integration Verification
- [ ] Full test suite passes (`npm test`)
- [ ] TypeScript compilation clean (`npm run typecheck`)
- [ ] No console errors or warnings in runtime
- [ ] Git diff shows EventExpr types and Step types updated correctly

---

## Unblocking Confirmation
- [ ] C-4 (axis enforcement) can now validate EventExpr.type invariants
- [ ] C-5 (getManyInstance) can now derive instance from EventExpr.type
- [ ] All EventExpr construction sites enforce hard invariants
- [ ] No string leakage in Step types (type safety restored)

---

## Documentation
- [ ] Comments on eventType() helper explain invariants
- [ ] Git commit messages explain rationale for changes
- [ ] Any breaking changes documented (if public API affected)
