# Definition of Done: hash-consing - Expression Deduplication
Generated: 2026-01-28-064200
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260128-064200-hash-consing-PLAN.md
Source: EVALUATION-2026-01-28-064128.md

## Sprint Exit Criteria

This sprint is complete when:
- [ ] All acceptance criteria below are met
- [ ] All tests pass in CI
- [ ] Code review approved
- [ ] No regressions in existing tests
- [ ] Documentation updated (if needed)

---

## Acceptance Criteria

### P0: Hash Cache Infrastructure

**File**: `src/compiler/ir/IRBuilderImpl.ts`

- [ ] `sigExprCache: Map<string, SigExprId>` field added to IRBuilderImpl class
- [ ] `fieldExprCache: Map<string, FieldExprId>` field added to IRBuilderImpl class
- [ ] `eventExprCache: Map<string, EventExprId>` field added to IRBuilderImpl class
- [ ] All cache maps initialized in constructor as empty Maps
- [ ] `hashSigExpr(expr: SigExpr): string` function implemented
  - Uses `JSON.stringify(expr)` for deterministic hashing
  - Returns string hash for cache key
  - Handles all SigExpr variants correctly
- [ ] `hashFieldExpr(expr: FieldExpr): string` function implemented
  - Uses `JSON.stringify(expr)` for deterministic hashing
  - Returns string hash for cache key
  - Handles all FieldExpr variants including optional instanceId
- [ ] `hashEventExpr(expr: EventExpr): string` function implemented
  - Uses `JSON.stringify(expr)` for deterministic hashing
  - Returns string hash for cache key
- [ ] Unit test verifies hash function produces identical strings for identical expressions
- [ ] Unit test verifies hash function produces different strings for different expressions
- [ ] Hash functions handle nested structures (PureFn with composed ops, arrays)

**Verification**:
```typescript
const expr1 = { kind: 'const', value: 1.0, type: FLOAT };
const expr2 = { kind: 'const', value: 1.0, type: FLOAT };
expect(hashSigExpr(expr1)).toBe(hashSigExpr(expr2));

const expr3 = { kind: 'const', value: 2.0, type: FLOAT };
expect(hashSigExpr(expr1)).not.toBe(hashSigExpr(expr3));
```

---

### P0: SigExpr Deduplication

**File**: `src/compiler/ir/IRBuilderImpl.ts`

All signal expression builder methods must follow the hash-consing pattern:

#### Core Pattern (Applied to ALL methods)
- [ ] Before creating new ExprId, compute hash of expression
- [ ] Check `sigExprCache.get(hash)` for existing ID
- [ ] If found, return existing ID immediately
- [ ] If not found, create new ID, push to array, cache, and return

#### Method Coverage (13+ methods)
- [ ] `sigConst(value, type)` - checks cache before creating const
- [ ] `sigSlot(slot, type)` - checks cache before creating slot ref
- [ ] `sigTime(which, type)` - checks cache before creating time ref
- [ ] `sigExternal(which, type)` - checks cache before creating external ref
- [ ] `sigMap(input, fn, type)` - checks cache before creating map
- [ ] `sigZip(inputs, fn, type)` - checks cache before creating zip
- [ ] `sigShapeRef(...)` - checks cache before creating shape ref
- [ ] `sigBinOp(left, right, op, type)` - checks cache before creating binop
- [ ] `sigUnaryOp(input, op, type)` - checks cache before creating unaryop
- [ ] `sigCombine(...)` - checks cache before creating combine
- [ ] `sigStateRead(...)` - checks cache before creating state read
- [ ] `sigReduceField(...)` - checks cache before creating reduce
- [ ] `sigEventRead(...)` - checks cache before creating event read

#### Functional Tests
- [ ] Unit test: `sigConst(1.0, FLOAT)` called twice returns same ID
- [ ] Unit test: `sigConst(1.0, FLOAT)` vs `sigConst(2.0, FLOAT)` returns different IDs
- [ ] Unit test: `sigTime('tMs', FLOAT)` called twice returns same ID
- [ ] Unit test: `sigBinOp(a, b, OpCode.Add, FLOAT)` called twice returns same ID
- [ ] Unit test: compound expressions deduplicate (see DOD example below)
- [ ] All existing IRBuilderImpl tests continue to pass (no regressions)

**Verification Example**:
```typescript
it('deduplicates identical SigExpr (I13)', () => {
  const b = new IRBuilderImpl();
  const id1 = b.sigConst(1.0, signalTypeSignal(FLOAT));
  const id2 = b.sigConst(1.0, signalTypeSignal(FLOAT));
  expect(id1).toBe(id2); // MUST be identical
});
```

---

### P1: FieldExpr Deduplication

**File**: `src/compiler/ir/IRBuilderImpl.ts`

All field expression builder methods must follow the hash-consing pattern:

#### Core Pattern (Applied to ALL methods)
- [ ] Before creating new ExprId, compute hash of expression
- [ ] Check `fieldExprCache.get(hash)` for existing ID
- [ ] If found, return existing ID immediately
- [ ] If not found, create new ID, push to array, cache, and return

#### Method Coverage (10+ methods)
- [ ] `fieldConst(value, type)` - checks cache before creating const
- [ ] `fieldIntrinsic(instanceId, intrinsic, type)` - checks cache (includes instanceId in hash)
- [ ] `fieldPlacement(...)` - checks cache before creating placement
- [ ] `fieldArray(...)` - checks cache before creating array
- [ ] `fieldBroadcast(signal, type)` - checks cache before creating broadcast
- [ ] `fieldMap(input, fn, type, instanceId?)` - checks cache (includes optional instanceId)
- [ ] `fieldZip(inputs, fn, type, instanceId?)` - checks cache (includes optional instanceId)
- [ ] `fieldZipSig(signal, field, fn, type)` - checks cache before creating zipsig
- [ ] `fieldStateRead(...)` - checks cache before creating state read
- [ ] `fieldPathDerivative(...)` - checks cache before creating path derivative

#### Functional Tests
- [ ] Unit test: `fieldConst(1.0, type)` called twice returns same ID
- [ ] Unit test: `fieldBroadcast(sig, type)` called twice returns same ID
- [ ] Unit test: `fieldIntrinsic(inst1, 'index', type)` called twice returns same ID
- [ ] Unit test: `fieldIntrinsic(inst1, 'index', type)` vs `fieldIntrinsic(inst2, 'index', type)` returns different IDs
- [ ] Unit test: `fieldMap` with same inputs/fn returns same ID
- [ ] Unit test: `fieldMap` with optional instanceId correctly distinguished
- [ ] All existing field expression tests continue to pass

**Verification Example**:
```typescript
it('deduplicates identical FieldExpr with instanceId', () => {
  const b = new IRBuilderImpl();
  const inst = instanceId(1);
  const id1 = b.fieldIntrinsic(inst, 'index', fieldTypeField(FLOAT));
  const id2 = b.fieldIntrinsic(inst, 'index', fieldTypeField(FLOAT));
  expect(id1).toBe(id2);
  
  const inst2 = instanceId(2);
  const id3 = b.fieldIntrinsic(inst2, 'index', fieldTypeField(FLOAT));
  expect(id3).not.toBe(id1); // Different instance = different expr
});
```

---

### P2: Tests & Validation

**File**: `src/compiler/ir/__tests__/hash-consing.test.ts` (new file)

#### Test Coverage
- [ ] Test file created with comprehensive hash-consing tests
- [ ] Test: Basic SigExpr deduplication (const, time, external)
- [ ] Test: Basic FieldExpr deduplication (const, intrinsic, broadcast)
- [ ] Test: Compound expression deduplication (nested expressions)
- [ ] Test: Different expressions get different IDs (negative cases)
- [ ] Test: PureFn with composed ops deduplicate correctly
- [ ] Test: Array order preserved in hash (different orders = different hash)
- [ ] Test: Optional instanceId included in hash
- [ ] Test: Float precision handled consistently

#### Compound Expression Test (Critical)
- [ ] Test verifies transitive deduplication:
  - Create const twice → same ID
  - Use const in binop twice → binop also deduplicated
  - Verify entire expression tree shares IDs

**Example Compound Test**:
```typescript
it('deduplicates compound expressions transitively (I13)', () => {
  const b = new IRBuilderImpl();
  
  // Constants deduplicate
  const a = b.sigConst(2.0, signalTypeSignal(FLOAT));
  const b1 = b.sigConst(3.0, signalTypeSignal(FLOAT));
  const b2 = b.sigConst(3.0, signalTypeSignal(FLOAT));
  expect(b1).toBe(b2);
  
  // Operations using deduplicated inputs also deduplicate
  const sum1 = b.sigBinOp(a, b1, OpCode.Add, signalTypeSignal(FLOAT));
  const sum2 = b.sigBinOp(a, b2, OpCode.Add, signalTypeSignal(FLOAT));
  expect(sum1).toBe(sum2);
});
```

#### Optional: Statistics Tracking
- [ ] (Optional) Add `getHashConsStats()` method to IRBuilderImpl
- [ ] (Optional) Returns `{ totalRequests: number, uniqueExpressions: number, hitRate: number }`
- [ ] (Optional) Test verifies stats tracking works correctly

---

## Edge Cases Verified

- [ ] **Array Order**: `sigZip([a, b], ...)` vs `sigZip([b, a], ...)` → different IDs
- [ ] **Optional Fields**: `fieldMap` with/without instanceId → correctly distinguished
- [ ] **Float Precision**: `sigConst(1.0, ...)` vs `sigConst(1.00, ...)` → same ID
- [ ] **PureFn Variants**: All 4 PureFn kinds hash correctly (opcode, kernel, expr, composed)
- [ ] **Nested Expressions**: Hash includes child ExprIds, not child content

---

## Integration Verification

- [ ] All existing tests in `src/compiler/__tests__/` pass without modification
- [ ] No behavior changes in compiled IR output (optimization only)
- [ ] No regressions in runtime evaluation
- [ ] IR size metrics show expected reduction (30-50% in typical patches)

---

## Documentation

- [ ] (Optional) Add comment to IRBuilderImpl explaining hash-consing pattern
- [ ] (Optional) Add JSDoc to hash functions explaining why JSON.stringify is sufficient
- [ ] (Optional) Update CHANGELOG or implementation notes if tracked

---

## Performance Validation (Post-Implementation)

Optional but recommended:
- [ ] Measure IR expression count before/after on real patches
- [ ] Verify FrameCache memory usage reduction
- [ ] Profile hash lookup overhead (should be negligible)
- [ ] Document deduplication rate in typical workloads

---

## Rollback Plan

If issues arise:
1. Hash-consing is optimization only (no correctness impact)
2. Can temporarily disable by returning early from cache check
3. Can remove cache maps and revert to sequential allocation
4. No data migration needed (stateless transformation)

---

## Sign-Off

- [ ] All acceptance criteria met
- [ ] All tests pass
- [ ] Code review complete
- [ ] No performance regressions
- [ ] Ready to merge

**Implementer**: _______________  
**Reviewer**: _______________  
**Date**: _______________
