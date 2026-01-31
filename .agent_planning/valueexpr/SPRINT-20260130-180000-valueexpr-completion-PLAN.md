# Sprint: valueexpr-completion — Complete ValueExpr Unification (Non-Deferred)

Generated: 2026-01-30T18:30:00Z
Confidence: HIGH: 4, MEDIUM: 1, LOW: 0
Status: PARTIALLY READY

## Sprint Goal

Fix test regressions, clean up IRBuilderImpl, replace deriveKind call sites, and — critically — **write tests that enforce the new type system behavior so agents cannot silently revert it**. Every structural change must have a corresponding test that FAILS on the old behavior and PASSES on the new.

## Strategy: Tests as Enforcement

The core problem is: refactoring work without active consumers gets reverted by agents. The fix is:

1. **Write enforcement tests FIRST** (or alongside) that assert the new behavior
2. **Update legacy tests** that assert old behavior to assert new behavior instead
3. **Each code change is locked by a test** — reverting the change breaks the test

---

## Work Items

### WI-1: Write enforcement tests + clean IRBuilderImpl phantom instanceId
**Confidence: HIGH**
**Beads:** oscilla-animator-v2-4ykh, oscilla-animator-v2-4fbt

**Tests to write FIRST (enforcement):**
```typescript
// src/compiler/ir/__tests__/no-instanceid-on-fieldexpr.test.ts
describe('FieldExpr instanceId enforcement', () => {
  it('FieldExprIntrinsic has no instanceId property', () => {
    const b = new IRBuilderImpl();
    b.fieldIntrinsic('index', someFieldType);
    const expr = b.build().fields[0];
    expect(expr).not.toHaveProperty('instanceId');
  });

  it('FieldExprPlacement has no instanceId property', () => { ... });
  it('FieldExprMap has no instanceId property', () => { ... });
  it('FieldExprZip has no instanceId property', () => { ... });
  it('FieldExprZipSig has no instanceId property', () => { ... });
  it('FieldExprStateRead has no instanceId property', () => { ... });

  it('requireManyInstance extracts instance from type, not from expr field', () => {
    // Verify the canonical path works
  });
});
```

**Legacy tests to update:**
- `hash-consing.test.ts`: Remove `instanceId` from test setup variables where unused
- Any test that constructs FieldExpr objects with instanceId — update to not include it

**Code changes:**
- Remove `instanceId` from all 6 field builder method bodies in IRBuilderImpl
- Remove `inferFieldInstance()` and `inferZipInstance()` methods
- Remove stale instanceId validation check in `fieldPlacement()`

**Acceptance Criteria:**
- [ ] Enforcement tests exist and PASS with new code
- [ ] Enforcement tests FAIL if instanceId is re-added to builder output
- [ ] No field builder emits instanceId into expression objects
- [ ] `inferFieldInstance`/`inferZipInstance` removed
- [ ] `npx tsc --noEmit` exits 0

---

### WI-2: Fix instance name mismatch + test instance resolution
**Confidence: HIGH**
**Bead:** oscilla-animator-v2-hdep

**Tests to write (enforcement):**
```typescript
describe('Instance name resolution', () => {
  it('requireManyInstance returns an instanceId that exists in the instance map', () => {
    // Compile a simple patch, then for every field expr:
    // requireManyInstance(expr.type).instanceId must be in ir.instances
  });

  it('no field expr type carries instanceId="default" when instances are auto-named', () => {
    // Structural assertion on compiled IR
  });
});
```

**Code changes:**
- Investigate and fix root cause of "default" vs "instance_0" mismatch
- Either block lowering must use the registered name, or registration must use the type's name

**Acceptance Criteria:**
- [ ] Test asserts instance names match between type and instance map
- [ ] All 20 "Instance not found" test failures resolved
- [ ] No hard-coded "default" instanceId where auto-generated names expected

---

### WI-3: Replace deriveKind + test that it's not used
**Confidence: HIGH**
**Bead:** oscilla-animator-v2-s1mt

**Tests to write (enforcement):**
```typescript
describe('deriveKind elimination', () => {
  it('no production code imports deriveKind', () => {
    // grep-based: count deriveKind imports outside tests and canonical-types.ts
    // Must be 0 (or only the re-export in types/index.ts)
  });

  it('axis-validate uses isSignalType/isFieldType/isEventType directly', () => {
    // Can be structural or just verify the file doesn't import deriveKind
  });

  it('zero-cardinality types are handled correctly (not mapped to signal)', () => {
    // isSignalType(canonicalConst(FLOAT)) should be false
    // isFieldType(canonicalConst(FLOAT)) should be false
    // isEventType(canonicalConst(FLOAT)) should be false
    // deriveKind would return 'signal' — that's the OLD broken behavior
  });
});
```

**Legacy tests to update:**
- Any test asserting `deriveKind(constType) === 'signal'` → update to assert the NEW behavior

**Code changes:**
- Replace 6 call sites with isSignalType/isFieldType/isEventType
- Handle zero-cardinality explicitly at each site

**Acceptance Criteria:**
- [ ] Enforcement test FAILS if deriveKind is re-imported in production code
- [ ] Zero-cardinality test FAILS if someone makes deriveKind return 'signal' for zero
- [ ] No `deriveKind()` calls in production code
- [ ] `npx tsc --noEmit` exits 0, tests pass

---

### WI-4: Fix 5 pre-existing test failures
**Confidence: HIGH**
**Bead:** oscilla-animator-v2-akml

**Approach:** Read each failing test, determine if it asserts OLD behavior (update test) or reveals a real bug (fix code).

**Likely updates:**
- bridges.test.ts: Update expectations for new Binding values (unbound/weak/strong/identity)
- bridges.test.ts: Update expectations for new extent axis descriptions
- cardinality-metadata.test.ts: Update for new cardinality values
- compile/initial-compile tests: May need TimeRoot validation fix

**Acceptance Criteria:**
- [ ] All 5 tests pass
- [ ] Tests assert NEW type system behavior, not OLD
- [ ] `npx tsc --noEmit` exits 0

---

### WI-5: ValueExpr structural invariant tests
**Confidence: MEDIUM**
**Bead:** oscilla-animator-v2-4fbt (partial)

**Tests to write (enforcement):**
```typescript
describe('ValueExpr type invariants', () => {
  it('every ValueExpr variant has readonly type: CanonicalType', () => {
    // TypeScript compile-time check via conditional types
    // Runtime: construct one of each variant, assert .type exists
  });

  it('ValueExpr has exactly 9 top-level kind values', () => {
    // Assert the discriminant set
  });

  it('no ValueExpr variant has an op discriminant', () => {
    // Assert none of the variants have an 'op' field
  });

  it('ValueExpr uses kind, not op, as discriminant', () => {
    // Structural assertion
  });
});
```

**Acceptance Criteria:**
- [ ] Tests exist for ValueExpr structural invariants
- [ ] Tests would FAIL if someone adds `op` discriminant or removes `type`
- [ ] All tests pass

#### Unknowns to Resolve
- Best way to enumerate union variants at runtime for structural checks

---

## Execution Order

```
WI-1 (instanceId enforcement + cleanup) ──┐
                                           ├──→ WI-4 (pre-existing failures) ──→ WI-5 (invariant tests)
WI-2 (instance name mismatch) ────────────┘
WI-3 (deriveKind replacement) ──── independent, can parallel with WI-1/WI-2
```

## Dependencies

- WI-1 and WI-2 are independent — can run in parallel
- WI-3 is independent of WI-1/WI-2
- WI-4 depends on WI-1 + WI-2 (need clean baseline)
- WI-5 depends on WI-1 through WI-4

## Deferred Work (beads created)

| Bead | Title | Priority | Blocked by |
|------|-------|----------|------------|
| oscilla-animator-v2-vqkj | AdapterSpec restructure | P2 | This sprint |
| oscilla-animator-v2-73lv | Zero-cardinality enforcement | P3 | This sprint |
| oscilla-animator-v2-bzh2 | First ValueExpr consumer | P3 | This sprint |

## Target

- 0 TypeScript errors
- 0 test failures
- Every type system change locked by an enforcement test
