# Sprint: const-value - ConstValue Discriminated Union
Generated: 2026-01-28-192541
Confidence: HIGH: 1, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-2026-01-28-191553.md
Dependencies: Sprint 3 (authority-consolidation) - requires C-4 (axis enforcement)

## Sprint Goal
Replace loose `value: number | string | boolean` with strongly-typed ConstValue discriminated union keyed by payload kind, enforcing Invariant I5 (const literal shape matches payload).

## Scope
**Deliverables:**
- Define ConstValue discriminated union (7 variants: float, int, bool, vec2, vec3, color, cameraProjection)
- Replace value field in SigExprConst and FieldExprConst
- Update 40+ const construction sites
- Add constValueMatchesPayload validator
- Integrate with axis enforcement pass (C-4)

**Dependencies**: Requires Sprint 3 C-4 (axis enforcement pass to validate payload match)

## Work Items

### P0 (Critical): C-8 - ConstValue Discriminated Union

**Dependencies**: Sprint 3 C-4 (axis enforcement validates ConstValue.kind matches payload.kind)
**Spec Reference**: 00-exhaustive-type-system.md:275-293, 15-FiveAxesTypeSystem-Conclusion.md:95-99 • **Status Reference**: EVALUATION-2026-01-28-191553.md:212-244

**Confidence**: HIGH (spec in 00-exhaustive-type-system.md is complete, no ambiguities)

#### Description
Replace `value: number | string | boolean` with strongly-typed ConstValue discriminated union in SigExprConst and FieldExprConst. This enforces Invariant I5: "Const literal shape matches payload." Currently you can construct `SigExprConst` with `value: "string"` and `type.payload.kind: 'float'`, causing runtime crashes in renderer (assumes value shape matches payload). ConstValue prevents this at compile time.

**Current State**:
- src/compiler/ir/types.ts:98 — SigExprConst uses `value: number | string | boolean`
- src/compiler/ir/types.ts:225-230 — FieldExprConst uses same pattern
- No ConstValue type exists
- No payload-shape validation at construction sites
- Runtime hazard: renderer assumes value shape matches payload, crash if wrong

**Spec Contract** (00-exhaustive-type-system.md:275-293):
```typescript
export type ConstValue =
  | { readonly kind: 'float'; readonly value: number }
  | { readonly kind: 'int'; readonly value: number }
  | { readonly kind: 'bool'; readonly value: boolean }
  | { readonly kind: 'vec2'; readonly value: readonly [number, number] }
  | { readonly kind: 'vec3'; readonly value: readonly [number, number, number] }
  | { readonly kind: 'color'; readonly value: readonly [number, number, number, number] }
  | { readonly kind: 'cameraProjection'; readonly value: string };

export function constValueMatchesPayload(payload: PayloadType, v: ConstValue): boolean {
  return payload.kind === v.kind;
}
```

**Invariant I5** (15-FiveAxesTypeSystem-Conclusion.md:95-99):
- Const literal representation must be payload-shaped, not "anything"
- ConstValue.kind MUST match CanonicalType.payload.kind
- Axis enforcement pass checks this invariant

#### Acceptance Criteria (REQUIRED)
- [ ] ConstValue discriminated union defined in canonical-types.ts or types.ts (7 variants)
- [ ] constValueMatchesPayload(payload, value): boolean validator exists
- [ ] SigExprConst.value type changed from `number | string | boolean` to `ConstValue`
- [ ] FieldExprConst.value type changed from loose union to `ConstValue`
- [ ] All 40+ const construction sites updated to use discriminated union
- [ ] Axis enforcement pass (C-4) validates payload match (calls constValueMatchesPayload)
- [ ] Tests verify: float const with float payload (valid)
- [ ] Tests verify: vec2 const with vec2 payload (valid)
- [ ] Tests verify: float const with vec2 payload (invalid — caught by axis enforcement)
- [ ] Tests verify: string value with float payload (type error at compile time)
- [ ] All tests pass
- [ ] TypeScript compilation succeeds

#### Technical Notes

**Define ConstValue** (add to canonical-types.ts or types.ts):
```typescript
/**
 * Strongly-typed constant value representation.
 * 
 * INVARIANT I5: ConstValue.kind MUST match CanonicalType.payload.kind
 * This is enforced at:
 * 1. Compile time: TypeScript prevents wrong value types
 * 2. Runtime: Axis enforcement validates kind matches payload
 * 
 * Tuple values are readonly to prevent mutation (maintains immutability contract).
 */
export type ConstValue =
  | { readonly kind: 'float'; readonly value: number }
  | { readonly kind: 'int'; readonly value: number }
  | { readonly kind: 'bool'; readonly value: boolean }
  | { readonly kind: 'vec2'; readonly value: readonly [number, number] }
  | { readonly kind: 'vec3'; readonly value: readonly [number, number, number] }
  | { readonly kind: 'color'; readonly value: readonly [number, number, number, number] }
  | { readonly kind: 'cameraProjection'; readonly value: string };

/**
 * Validate that ConstValue.kind matches PayloadType.kind.
 * Used by axis enforcement pass to catch mismatches.
 */
export function constValueMatchesPayload(
  payload: PayloadType,
  constValue: ConstValue
): boolean {
  return payload.kind === constValue.kind;
}
```

**Update SigExprConst** (types.ts:98):
```typescript
// BEFORE
export interface SigExprConst {
  readonly kind: 'const';
  readonly type: CanonicalType;
  readonly value: number | string | boolean;  // <-- WRONG
}

// AFTER
export interface SigExprConst {
  readonly kind: 'const';
  readonly type: CanonicalType;
  readonly value: ConstValue;  // <-- CORRECT
}
```

**Update FieldExprConst** (types.ts:225-230):
```typescript
// BEFORE
export interface FieldExprConst {
  readonly kind: 'const';
  readonly type: CanonicalType;
  readonly value: number | string | boolean;  // <-- WRONG
}

// AFTER
export interface FieldExprConst {
  readonly kind: 'const';
  readonly type: CanonicalType;
  readonly value: ConstValue;  // <-- CORRECT
}
```

**Construction pattern:**
```typescript
// BEFORE (type unsafe)
const expr: SigExprConst = {
  kind: 'const',
  type: someFloatType,
  value: "wrong"  // Compiles but causes runtime crash!
};

// AFTER (type safe)
const expr: SigExprConst = {
  kind: 'const',
  type: someFloatType,
  value: { kind: 'float', value: 42.0 }  // Must match payload.kind
};

// Vec2 example
const expr: SigExprConst = {
  kind: 'const',
  type: someVec2Type,
  value: { kind: 'vec2', value: [1.0, 2.0] as const }  // Tuple is readonly
};

// Bool example
const expr: SigExprConst = {
  kind: 'const',
  type: someBoolType,
  value: { kind: 'bool', value: true }
};
```

**Axis enforcement integration** (add to axis-enforcement.ts from C-4):
```typescript
// In validateAxes function, add:

// Check ConstValue matches payload
for (const expr of findAllConstExpr(patch)) {
  if (expr.kind === 'const' && !constValueMatchesPayload(expr.type.payload, expr.value)) {
    diagnostics.push({
      kind: 'AxisInvalid',
      location: getExprLocation(expr),
      reason: 'Const value kind must match payload kind',
      expressionKind: expr.kind,
      violation: `value.kind=${expr.value.kind}, payload.kind=${expr.type.payload.kind}`
    });
  }
}
```

**Helper for constructing typed const values:**
```typescript
// Optional: Add helpers for common cases
export function floatConst(value: number): ConstValue {
  return { kind: 'float', value };
}

export function boolConst(value: boolean): ConstValue {
  return { kind: 'bool', value };
}

export function vec2Const(x: number, y: number): ConstValue {
  return { kind: 'vec2', value: [x, y] as const };
}

export function vec3Const(x: number, y: number, z: number): ConstValue {
  return { kind: 'vec3', value: [x, y, z] as const };
}
```

#### Construction Sites (estimate 40+)

**Search commands:**
```bash
# Find SigExprConst construction sites
grep -rn "kind: 'const'" src/ | grep Sig

# Find FieldExprConst construction sites
grep -rn "kind: 'const'" src/ | grep Field

# Find direct value assignments
grep -rn "value: [0-9]" src/ | grep -E "SigExpr|FieldExpr"
```

**Typical locations:**
- src/compiler/ir-builder/ — IR builder creates const nodes
- src/compiler/passes-v2/ — Normalization/optimization passes
- src/__tests__/ — Test fixtures
- src/runtime/ — If runtime creates const expressions

**Migration strategy:**
1. Define ConstValue type
2. Update SigExprConst and FieldExprConst interfaces
3. Run TypeScript compiler — it will identify ALL construction sites
4. Update each site based on payload kind
5. Add axis enforcement validation
6. Run tests

**TypeScript will find all sites:**
```bash
npm run typecheck 2>&1 | grep -E "SigExprConst|FieldExprConst|value"
```

#### Test Cases

**Add to axis-enforcement.test.ts** (from C-4):
```typescript
describe('Axis Enforcement: ConstValue', () => {
  test('Valid float const passes', () => {
    const expr: SigExprConst = {
      kind: 'const',
      type: {
        payload: { kind: 'float' },
        unit: { kind: 'none' },
        extent: { /* ... */ }
      },
      value: { kind: 'float', value: 42.0 }  // Matches payload
    };
    const patch: TypedPatch = { events: [], signals: [expr], fields: [] };

    const diagnostics = validateAxes(patch);
    expect(diagnostics).toHaveLength(0);
  });

  test('Valid vec2 const passes', () => {
    const expr: SigExprConst = {
      kind: 'const',
      type: {
        payload: { kind: 'vec2' },
        unit: { kind: 'none' },
        extent: { /* ... */ }
      },
      value: { kind: 'vec2', value: [1.0, 2.0] as const }  // Matches payload
    };
    const patch: TypedPatch = { events: [], signals: [expr], fields: [] };

    const diagnostics = validateAxes(patch);
    expect(diagnostics).toHaveLength(0);
  });

  test('Float const with vec2 payload fails', () => {
    const expr: SigExprConst = {
      kind: 'const',
      type: {
        payload: { kind: 'vec2' },  // Expects vec2
        unit: { kind: 'none' },
        extent: { /* ... */ }
      },
      value: { kind: 'float', value: 42.0 }  // MISMATCH
    };
    const patch: TypedPatch = { events: [], signals: [expr], fields: [] };

    const diagnostics = validateAxes(patch);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].kind).toBe('AxisInvalid');
    expect(diagnostics[0].violation).toContain('value.kind=float, payload.kind=vec2');
  });

  test('Vec2 tuple is readonly (immutability)', () => {
    const value: ConstValue = { kind: 'vec2', value: [1.0, 2.0] as const };
    
    // TypeScript should prevent mutation
    // @ts-expect-error — readonly tuple
    // value.value[0] = 99.0;
    
    expect(value.value).toEqual([1.0, 2.0]);
  });

  // Add tests for: int, bool, vec3, color, cameraProjection
});
```

**Add to canonical-types.test.ts:**
```typescript
describe('constValueMatchesPayload', () => {
  test('float value matches float payload', () => {
    const payload: PayloadType = { kind: 'float' };
    const value: ConstValue = { kind: 'float', value: 42.0 };
    
    expect(constValueMatchesPayload(payload, value)).toBe(true);
  });

  test('float value does not match vec2 payload', () => {
    const payload: PayloadType = { kind: 'vec2' };
    const value: ConstValue = { kind: 'float', value: 42.0 };
    
    expect(constValueMatchesPayload(payload, value)).toBe(false);
  });

  test('vec2 value matches vec2 payload', () => {
    const payload: PayloadType = { kind: 'vec2' };
    const value: ConstValue = { kind: 'vec2', value: [1.0, 2.0] as const };
    
    expect(constValueMatchesPayload(payload, value)).toBe(true);
  });

  // Add tests for all 7 ConstValue variants
});
```

---

## Dependencies
- **REQUIRES Sprint 3 C-4**: Axis enforcement pass must exist to validate payload match
- **COMPLETES**: CanonicalType migration (all 8 work items from gap analysis)

## Risks
- **Moderate Impact**: Touches 40+ const construction sites
- **Mitigation**: TypeScript compiler identifies all sites, test suite validates correctness
- **Low Risk**: Spec is complete and unambiguous

---

## Success Criteria
- ✅ ConstValue discriminated union defined (7 variants)
- ✅ constValueMatchesPayload validator exists
- ✅ SigExprConst and FieldExprConst use ConstValue (not loose unions)
- ✅ All 40+ construction sites updated
- ✅ Axis enforcement validates ConstValue.kind matches payload.kind
- ✅ Tests verify payload matching (positive + negative cases)
- ✅ All tests pass
- ✅ Zero TypeScript compilation errors
- ✅ Runtime type safety: impossible to construct mismatched const values

---

## Estimated Effort
- C-8 (ConstValue discriminated union): 6 hours
  - Define type: 1 hour
  - Update interfaces: 1 hour
  - Update 40+ construction sites: 3 hours
  - Tests + axis enforcement integration: 1 hour
**Total: 6 hours**

---

## Definition of Done (CanonicalType Migration Complete)

After this sprint, all 8 work items from gap analysis are complete:
- ✅ C-1: EventExpr typed (Sprint 2)
- ✅ C-2: core/ids.ts authority (Sprint 1)
- ✅ C-3: reduce_field renamed (Sprint 1)
- ✅ C-4: Axis enforcement (Sprint 3)
- ✅ C-5: instanceId removed, getManyInstance added (Sprint 3)
- ✅ C-6: string leakage fixed (Sprint 2)
- ✅ C-7: FieldExprArray deleted (Sprint 1)
- ✅ C-8: ConstValue discriminated union (Sprint 4) ← THIS SPRINT

**Next Phase**: U-1 (ValueExpr IR) can safely start — axis enforcement ensures valid IR.
