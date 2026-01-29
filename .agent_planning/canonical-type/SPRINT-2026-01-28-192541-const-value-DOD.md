# Definition of Done: const-value
Generated: 2026-01-28-192541
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-2026-01-28-192541-const-value-PLAN.md

## Acceptance Criteria

### C-8: ConstValue Discriminated Union

#### Type Definition
- [ ] ConstValue discriminated union defined (7 variants: float, int, bool, vec2, vec3, color, cameraProjection)
- [ ] ConstValue defined in src/core/canonical-types.ts or src/compiler/ir/types.ts
- [ ] All tuple values (vec2, vec3, color) use readonly arrays: `readonly [number, number]`
- [ ] constValueMatchesPayload(payload, value): boolean exists and exported

#### Interface Updates
- [ ] SigExprConst.value type changed from `number | string | boolean` to `ConstValue`
- [ ] FieldExprConst.value type changed from loose union to `ConstValue`

#### Construction Sites (estimate 40+)
- [ ] All SigExprConst construction sites updated to use ConstValue
- [ ] All FieldExprConst construction sites updated to use ConstValue
- [ ] TypeScript enforces: cannot pass raw number/string/boolean (must wrap in ConstValue)
- [ ] All construction sites use correct ConstValue.kind for their payload.kind

#### Axis Enforcement Integration
- [ ] axis-enforcement.ts validates ConstValue.kind matches payload.kind
- [ ] findAllConstExpr helper (or equivalent) iterates all const expressions
- [ ] Mismatch produces AxisInvalid diagnostic with clear violation message
- [ ] Integration tested: mismatched const fails validation

#### Test Coverage
**Positive tests (should pass):**
- [ ] Float const with float payload
- [ ] Int const with int payload
- [ ] Bool const with bool payload
- [ ] Vec2 const with vec2 payload
- [ ] Vec3 const with vec3 payload
- [ ] Color const with color payload
- [ ] CameraProjection const with cameraProjection payload

**Negative tests (should fail):**
- [ ] Float const with vec2 payload → AxisInvalid
- [ ] Vec2 const with float payload → AxisInvalid
- [ ] Int const with bool payload → AxisInvalid
- [ ] String value with float payload → TypeScript compile error

**Immutability tests:**
- [ ] Vec2 tuple is readonly (cannot mutate elements)
- [ ] Vec3 tuple is readonly
- [ ] Color tuple is readonly

- [ ] All tests pass
- [ ] TypeScript compilation succeeds

---

## Integration Verification
- [ ] Full test suite passes (`npm test`)
- [ ] TypeScript compilation clean (`npm run typecheck`)
- [ ] Axis enforcement catches payload mismatches
- [ ] Runtime safe: impossible to construct mismatched const at compile time

---

## Completion Confirmation (All 8 Gap Analysis Items)
After this sprint, verify all critical items complete:
- [ ] ✅ C-1: EventExpr typed (Sprint 2)
- [ ] ✅ C-2: core/ids.ts authority (Sprint 1)
- [ ] ✅ C-3: reduce_field renamed (Sprint 1)
- [ ] ✅ C-4: Axis enforcement exists and passing (Sprint 3)
- [ ] ✅ C-5: instanceId removed from FieldExpr, getManyInstance added (Sprint 3)
- [ ] ✅ C-6: string leakage fixed in Step types (Sprint 2)
- [ ] ✅ C-7: FieldExprArray deleted (Sprint 1)
- [ ] ✅ C-8: ConstValue discriminated union (Sprint 4) ← THIS SPRINT

---

## Unblocking Confirmation
- [ ] U-1 (ValueExpr IR) can safely start — axis enforcement ensures valid IR
- [ ] Invariant I5 enforced (const literal shape matches payload)
- [ ] CanonicalType migration 100% complete (per gap analysis)

---

## Documentation
- [ ] ConstValue docstring explains payload matching requirement
- [ ] constValueMatchesPayload docstring documents validator purpose
- [ ] Helper functions documented (floatConst, vec2Const, etc.) if implemented
- [ ] Git commit messages explain rationale
- [ ] README or CHANGELOG updated with ConstValue migration notes (if applicable)
