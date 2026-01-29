# Sprint: event-typing - EventExpr Canonical Typing
Generated: 2026-01-28-192541
Confidence: HIGH: 2, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-2026-01-28-191553.md
Dependencies: Sprint 1 (foundation) - requires C-2 (core/ids.ts)

## Sprint Goal
Add `type: CanonicalType` to all EventExpr variants with HARD invariants enforcement (payload=bool, unit=none, temporality=discrete), and fix string leakage in Step types using branded InstanceId.

## Scope
**Deliverables:**
- Add type: CanonicalType to 5 EventExpr variants with invariant enforcement
- Fix 6 sites where `instanceId: string` should be `instanceId: InstanceId`
- Add EventExpr invariant tests

**Dependencies**: Requires Sprint 1 C-2 (InstanceId in core/ids.ts)

## Work Items

### P0 (Critical): C-1 - Add type: CanonicalType to EventExpr

**Dependencies**: Sprint 1 C-2 (needs InstanceId from core/ids.ts)
**Spec Reference**: 15-FiveAxesTypeSystem-Conclusion.md:69-100, 00-exhaustive-type-system.md:323-354 • **Status Reference**: EVALUATION-2026-01-28-191553.md:62-81

#### Description
Add `type: CanonicalType` field to all 5 EventExpr variants and enforce HARD invariants at all construction sites. EventExpr MUST satisfy: `payload.kind === 'bool'`, `unit.kind === 'none'`, `extent.temporality === 'discrete'`. Cardinality can be 'one' or 'many(instance)' for per-instance events. This is a foundational requirement for axis enforcement (C-4) and getManyInstance helper (C-5).

**Current State**:
- src/compiler/ir/types.ts:323-354 — All 5 EventExpr variants lack type field:
  - EventExprConst (L330-333): Only has `fired: boolean`
  - EventExprPulse (L335-338)
  - EventExprWrap (L340-345)
  - EventExprCombine (L347-350)
  - EventExprNever (L352-354)
- No CanonicalType attached means: cannot enforce temporality=discrete, cannot track instance cardinality for per-instance events
- BLOCKS C-4 (axis enforcement needs types to validate)

**Spec Contract** (15-FiveAxesTypeSystem-Conclusion.md:69-100):
```typescript
// REQUIRED INVARIANTS (hard checked by axis enforcement):
type.payload.kind === 'bool'           // events are fired/not-fired
type.unit.kind === 'none'              // events are dimensionless
type.extent.temporality === 'discrete' // DEFINITION: events fire at instants
// cardinality can be 'one' OR many(instanceRef) for per-instance events
```

**Spec Reference** (00-exhaustive-type-system.md:323-354):
```typescript
export interface EventExprConst {
  readonly kind: 'const';
  readonly type: CanonicalType;  // <-- ADD
  readonly fired: boolean;
}
```

#### Acceptance Criteria (REQUIRED)
- [ ] All 5 EventExpr interfaces have `readonly type: CanonicalType` field
- [ ] All 30+ construction sites create types with payload=bool, unit=none, temporality=discrete
- [ ] Helper function `eventType(cardinality: CardinalityAxis): CanonicalType` exists in canonical-types.ts
- [ ] Test suite includes invariant validation (see Missing Checks below)
- [ ] All existing tests pass (may need to add type fields to test fixtures)
- [ ] TypeScript compilation succeeds

#### Technical Notes
**Add helper to canonical-types.ts:**
```typescript
export function eventType(cardinality: CardinalityAxis): CanonicalType {
  return {
    payload: { kind: 'bool' },
    unit: { kind: 'none' },
    extent: {
      cardinality,
      temporality: { kind: 'inst', value: { kind: 'discrete' } },
      binding: { kind: 'inst', value: { kind: 'unbound' } },
      perspective: { kind: 'inst', value: { kind: 'default' } },
      branch: { kind: 'inst', value: { kind: 'main' } }
    }
  };
}
```

**Construction pattern:**
```typescript
// Example: EventExprConst at tick boundary
const expr: EventExprConst = {
  kind: 'const',
  type: eventType({ kind: 'inst', value: { kind: 'one' } }),
  fired: true
};
```

**CRITICAL**: Every construction site must use the helper or manually enforce invariants. No shortcuts.

#### Missing Checks (Add to Test Suite)
**Location**: `src/core/__tests__/canonical-types.test.ts`

Add test block:
```typescript
describe('EventExpr Type Invariants', () => {
  test('EventExprConst has bool payload, none unit, discrete temporality', () => {
    const expr: EventExprConst = {
      kind: 'const',
      type: eventType({ kind: 'inst', value: { kind: 'one' } }),
      fired: true
    };
    expect(expr.type.payload.kind).toBe('bool');
    expect(expr.type.unit.kind).toBe('none');
    expect(expr.type.extent.temporality).toEqual({
      kind: 'inst',
      value: { kind: 'discrete' }
    });
  });
  
  // Repeat for EventExprPulse, EventExprWrap, EventExprCombine, EventExprNever
});
```

---

### P1 (High): C-6 - Fix string → InstanceId Leakage in Step Types

**Dependencies**: Sprint 1 C-2 (needs InstanceId in core/ids.ts)
**Spec Reference**: 00-exhaustive-type-system.md:1-45 • **Status Reference**: EVALUATION-2026-01-28-191553.md:167-186

#### Description
Replace `instanceId: string` with `instanceId: InstanceId` at 6 sites in Step types. Currently these types use raw strings, losing type safety and branding protection. This creates a runtime hazard: easy to pass wrong ID (e.g., BlockId where InstanceId expected).

**Current State** (types.ts):
- Line 435: InstanceDecl - has comment `// InstanceId` indicating known issue
- Line 540: StepMaterialize
- Line 546: StepRender
- Line 587: StepContinuityMapBuild
- Line 598: StepContinuityApply
- Line 681: StateMappingField

**Fix**: Change type from `instanceId: string` to `instanceId: InstanceId` at all 6 locations.

#### Acceptance Criteria (REQUIRED)
- [ ] InstanceDecl (L435) uses `readonly id: InstanceId` (not string)
- [ ] StepMaterialize (L540) uses `readonly instanceId: InstanceId`
- [ ] StepRender (L546) uses `readonly instanceId: InstanceId`
- [ ] StepContinuityMapBuild (L587) uses `readonly instanceId: InstanceId`
- [ ] StepContinuityApply (L598) uses `readonly instanceId: InstanceId`
- [ ] StateMappingField (L681) uses `readonly instanceId: InstanceId`
- [ ] All call sites updated (TypeScript will identify them as errors)
- [ ] All tests pass
- [ ] TypeScript compilation succeeds

#### Technical Notes
**Pattern:**
```typescript
// BEFORE
export interface StepMaterialize {
  readonly kind: 'materialize';
  readonly instanceId: string;  // <-- WRONG
  // ...
}

// AFTER
export interface StepMaterialize {
  readonly kind: 'materialize';
  readonly instanceId: InstanceId;  // <-- CORRECT
  // ...
}
```

**Import required** (if not already present):
```typescript
import { InstanceId } from '../../core/ids';
```

**TypeScript will find all call sites**: When you change the type, any code passing a raw string will produce a type error. Use `instanceId(stringValue)` factory to convert.

**Example call site fix:**
```typescript
// BEFORE
const step: StepMaterialize = {
  kind: 'materialize',
  instanceId: 'inst_123',  // type error after change
  // ...
};

// AFTER
import { instanceId } from '../../core/ids';
const step: StepMaterialize = {
  kind: 'materialize',
  instanceId: instanceId('inst_123'),  // properly branded
  // ...
};
```

---

## Dependencies
- **REQUIRES Sprint 1 C-2**: InstanceId must exist in core/ids.ts before this sprint can proceed
- **UNBLOCKS**:
  - C-4 (axis enforcement needs EventExpr.type to validate invariants)
  - C-5 (getManyInstance needs EventExpr.type to derive instance)

## Risks
- **Moderate Impact**: C-1 touches 30+ construction sites (EventExpr builders)
- **Mitigation**: TypeScript compiler will identify all sites that need updating
- **Low Risk**: C-6 is purely mechanical (TypeScript enforces correctness)

---

## Success Criteria
- ✅ All 5 EventExpr variants have type: CanonicalType field
- ✅ All EventExpr construction sites enforce invariants (payload=bool, unit=none, temporality=discrete)
- ✅ All 6 Step types use branded InstanceId (no string leakage)
- ✅ EventExpr invariant tests exist and pass
- ✅ All tests pass
- ✅ Zero TypeScript compilation errors
- ✅ C-4 and C-5 unblocked

---

## Estimated Effort
- C-1 (EventExpr typing + invariants): 6 hours
- C-6 (Fix string leakage): 2 hours
**Total: 8 hours**
