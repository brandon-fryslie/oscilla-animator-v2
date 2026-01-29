# Sprint: cleanup-violations - Remove Duplicated Authority

**Generated**: 2026-01-29T01:25:00Z
**Confidence**: HIGH: 3, MEDIUM: 0, LOW: 0
**Status**: ✅ APPROVED (2026-01-29)

**Review Notes**:
- ✓ Removing duplicate authority (instanceId? fields) prevents long-term corruption
- ✓ Deleting placeholder nodes with no storage semantics (FieldExprArray) is correct
- **LOCKED**: Single derivation path everywhere via `requireManyInstance(expr.type)`

---

## Sprint Goal

Remove fields that duplicate type authority (violating invariant I1). Specifically, remove `instanceId?` from FieldExprMap, FieldExprZip, FieldExprZipSig.

---

## Scope

**Deliverables:**
1. Remove instanceId from FieldExpr variants
2. Update all code that sets instanceId
3. Update all code that reads instanceId (use getManyInstance instead)

---

## Work Items

**CRITICAL INVARIANT** (from review):
> If a property is derivable from CanonicalType, it must not be stored anywhere else in IR. Store only CanonicalType, and derive everything else on demand (or cache derived values in a memo table that is explicitly non-authoritative).

### P0: Remove instanceId from FieldExprMap

**Confidence**: HIGH

**LOCKED**: Use `requireManyInstance(expr.type)` as the SINGLE derivation path.

**Current** (`types.ts` line 264):
```typescript
export interface FieldExprMap {
  readonly kind: 'map';
  readonly input: FieldExprId;
  readonly fn: PureFn;
  readonly type: CanonicalType;
  readonly instanceId?: InstanceId;  // <-- REMOVE
}
```

**Target**:
```typescript
export interface FieldExprMap {
  readonly kind: 'map';
  readonly input: FieldExprId;
  readonly fn: PureFn;
  readonly type: CanonicalType;
  // instanceId derived via requireManyInstance(expr.type)
}
```

**Acceptance Criteria:**
- [ ] `instanceId` field removed from interface
- [ ] All places that read `instanceId` use `requireManyInstance(expr.type)`
- [ ] NO ad-hoc peeking into `expr.type.extent.cardinality` — use the helper

---

### P1: Remove instanceId from FieldExprZip

**Confidence**: HIGH

**LOCKED**: Use `requireManyInstance(expr.type)` as the SINGLE derivation path.

**Current** (`types.ts` line 272):
```typescript
export interface FieldExprZip {
  readonly kind: 'zip';
  readonly inputs: readonly FieldExprId[];
  readonly fn: PureFn;
  readonly type: CanonicalType;
  readonly instanceId?: InstanceId;  // <-- REMOVE
}
```

**Acceptance Criteria:**
- [ ] `instanceId` field removed from interface
- [ ] All places that read `instanceId` use `requireManyInstance(expr.type)`
- [ ] NO ad-hoc peeking into extent — use the helper

---

### P2: Remove instanceId from FieldExprZipSig

**Confidence**: HIGH

**LOCKED**: Use `requireManyInstance(expr.type)` as the SINGLE derivation path.

**Current** (`types.ts` line 281):
```typescript
export interface FieldExprZipSig {
  readonly kind: 'zipSig';
  readonly field: FieldExprId;
  readonly signals: readonly SigExprId[];
  readonly fn: PureFn;
  readonly type: CanonicalType;
  readonly instanceId?: InstanceId;  // <-- REMOVE
}
```

**Acceptance Criteria:**
- [ ] `instanceId` field removed from interface
- [ ] All places that read `instanceId` use `requireManyInstance(expr.type)`
- [ ] NO ad-hoc peeking into extent — use the helper

---

## Dependencies

- **constructors-helpers** — Need `getManyInstance()` helper

## Risks

| Risk | Mitigation |
|------|------------|
| Code relies on instanceId for fast lookup | getManyInstance is O(1), just as fast |
| May break IR serialization | Update serializers to not include instanceId |

---

## Files to Modify

- `src/compiler/ir/types.ts` — Remove fields
- All files that construct FieldExprMap/Zip/ZipSig
- All files that read instanceId from these types

---

## Verification Commands

```bash
# Find all usages
grep -rn "instanceId" src/compiler --include="*.ts" | grep -E "(Map|Zip|ZipSig)"

# After removal, this should return nothing:
grep -n "instanceId?: InstanceId" src/compiler/ir/types.ts
```
