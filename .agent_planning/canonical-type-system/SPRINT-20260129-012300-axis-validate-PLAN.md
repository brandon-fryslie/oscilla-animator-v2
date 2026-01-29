# Sprint: axis-validate - Axis Enforcement Pass

**Generated**: 2026-01-29T01:22:00Z
**Confidence**: HIGH: 4, MEDIUM: 0, LOW: 0
**Status**: ✅ APPROVED (2026-01-29)

**Review Notes**:
- ✓ "Single enforcement point, frontend gate, backend blocked on violation" is correct
- ✓ Builder assertions as developer ergonomics (not canonical enforcement) is correct
- **LOCKED**: Enforce only TRUE invariants, not "convenient expectations"

**ENFORCEMENT SCOPE** (from review):
> Validation should enforce only true invariants, not "convenient expectations."
> - **Hard invariants (enforce)**: event payload=bool, unit=none, temporality=discrete; field cardinality=many(instance); signal cardinality=one
> - **Avoid over-enforcing**: payload/unit combos unless genuinely non-negotiable. Otherwise you'll block evolution.

---

## Sprint Goal

Create the single canonical axis enforcement pass that prevents invalid axis combinations from reaching the backend. This is the "belt buckle" that makes the type system constraints enforceable at runtime.

---

## Scope

**Deliverables:**
1. Create `src/compiler/frontend/axis-validate.ts`
2. Implement `AxisViolation` diagnostic type
3. Implement `validateAxes()` function
4. Integrate into frontend compilation pipeline

---

## Work Items

### P0: Create axis-validate.ts File

**Confidence**: HIGH

**Target** (from spec lines 405-470):
```typescript
// src/compiler/frontend/axis-validate.ts
import {
  CanonicalType,
  assertEventType,
  assertFieldType,
  assertSignalType,
  deriveKind,
} from '../../core/canonical-types';
import { ValueExpr } from '../ir/value-expr';

export interface AxisViolation {
  readonly exprIndex: number;
  readonly op: string;
  readonly message: string;
}

export function validateAxes(exprs: readonly ValueExpr[]): AxisViolation[] {
  const out: AxisViolation[] = [];

  for (let i = 0; i < exprs.length; i++) {
    const e = exprs[i];

    try {
      validateExpr(e);
    } catch (err) {
      out.push({
        exprIndex: i,
        op: e.op,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return out;
}

function validateExpr(e: ValueExpr): void {
  const k = deriveKind(e.type);

  if (k === 'signal') assertSignalType(e.type);
  else if (k === 'field') assertFieldType(e.type);
  else assertEventType(e.type);

  switch (e.op) {
    case 'time':
      assertSignalType(e.type);
      break;
    case 'const':
      if (e.type.payload.kind !== e.value.kind) {
        throw new Error(`Const payload mismatch: type=${e.type.payload.kind} value=${e.value.kind}`);
      }
      break;
    default:
      break;
  }
}
```

**Acceptance Criteria:**
- [ ] File exists at `src/compiler/frontend/axis-validate.ts`
- [ ] `AxisViolation` interface defined
- [ ] `validateAxes(exprs)` function exists
- [ ] `validateExpr(e)` internal function exists
- [ ] Uses `deriveKind`, `assertSignalType`, `assertFieldType`, `assertEventType`
- [ ] Kind-specific validation for `time` and `const`

---

### P1: Define What Pass MUST NOT Do

**Confidence**: HIGH

Per spec constraints and review, axis-validate.ts:

**MUST enforce (hard invariants):**
- Event: payload=bool, unit=none, temporality=discrete
- Field: cardinality=many(instance), temporality=continuous
- Signal: cardinality=one, temporality=continuous

**MUST NOT do:**
- Type inference
- Insert adapters
- Scheduling/cycle legality
- Any "helpful coercions"
- Any backend-only legality rules
- **Over-enforcing payload/unit combos** unless genuinely non-negotiable (blocks evolution)

**Acceptance Criteria:**
- [ ] Pass is pure checker (no mutations)
- [ ] Only returns violations, never modifies input
- [ ] No imports from adapter/scheduler modules
- [ ] Enforces only the hard invariants listed above

---

### P2: Integrate into Frontend Pipeline

**Confidence**: HIGH

The pass must run AFTER normalization and type inference, BEFORE backend compilation.

**Acceptance Criteria:**
- [ ] Called in frontend pipeline after adapter insertion
- [ ] If violations returned, compilation aborts with AxisInvalid diagnostic
- [ ] Backend never receives invalid axis combinations

---

### P3: Temporary Adapter for Old Expression System

**Confidence**: HIGH

Until ValueExpr is implemented, we need to validate SigExpr/FieldExpr/EventExpr.

**Acceptance Criteria:**
- [ ] Temporary `validateAxesLegacy(sigExprs, fieldExprs, eventExprs)` function
- [ ] Same validation logic, different input signature
- [ ] Clear TODO comment to remove after value-expr sprint

---

## Dependencies

- **core-types** — Need `Axis<T, V>`, axis aliases
- **constructors-helpers** — Need `deriveKind`, `assertSignalType`, `assertFieldType`, `assertEventType`

## Risks

| Risk | Mitigation |
|------|------------|
| ValueExpr not ready yet | P3 provides temporary legacy adapter |
| May catch existing violations | Good! That's the point. Fix them. |

---

## Files to Create/Modify

- `src/compiler/frontend/axis-validate.ts` — CREATE
- `src/compiler/frontend/index.ts` — Add to pipeline
