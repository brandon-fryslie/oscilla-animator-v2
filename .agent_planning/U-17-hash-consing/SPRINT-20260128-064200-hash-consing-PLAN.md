# Sprint: hash-consing - Expression Deduplication via Hash-Consing
Generated: 2026-01-28-064200
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-2026-01-28-064128.md

## Sprint Goal
Implement structural sharing via ExprId canonicalization to eliminate duplicate expressions and reduce compilation/runtime memory bloat by 30-50%.

## Scope
**Deliverables:**
- Hash cache infrastructure in IRBuilderImpl
- Hash-consing for all SigExpr builders (~10 methods)
- Hash-consing for all FieldExpr builders (~5 methods)
- Hash-consing for EventExpr builders (~5 methods)
- Comprehensive test coverage verifying deduplication
- Optional: Deduplication statistics tracking

**Out of Scope:**
- Custom hash functions (using JSON.stringify)
- Hash-consing for composite structures beyond expressions
- Runtime evaluation optimization (separate concern)

---

## Work Items

### P0 (Critical): Hash Cache Infrastructure

**Confidence**: HIGH
**Dependencies**: None
**Spec Reference**: INVARIANTS.md:188-197 (I13) • **Status Reference**: EVALUATION-2026-01-28-064128.md lines 256-322

#### Description
Add hash-consing infrastructure to IRBuilderImpl: cache maps, hash functions, and helper utilities. This is the foundation for all expression deduplication.

The evaluation shows that all expression types are readonly with no circular references (lines 90-142), making them perfect for structural hashing via JSON.stringify.

#### Acceptance Criteria
- [ ] `sigExprCache: Map<string, SigExprId>` added to IRBuilderImpl
- [ ] `fieldExprCache: Map<string, FieldExprId>` added to IRBuilderImpl
- [ ] `eventExprCache: Map<string, EventExprId>` added to IRBuilderImpl
- [ ] `hashSigExpr(expr: SigExpr): string` function implemented using JSON.stringify
- [ ] `hashFieldExpr(expr: FieldExpr): string` function implemented using JSON.stringify
- [ ] `hashEventExpr(expr: EventExpr): string` function implemented using JSON.stringify
- [ ] All hash functions handle nested structures (PureFn, arrays, optional fields)
- [ ] Cache maps are initialized in constructor
- [ ] Unit test verifies hash function produces identical strings for identical expressions

#### Technical Notes
**Hash Function Implementation** (EVALUATION:289-300):
```typescript
function hashSigExpr(expr: SigExpr): string {
  // JSON.stringify is deterministic for readonly objects
  // All fields are primitives, numbers, strings, or arrays
  // No functions, no circular references
  return JSON.stringify(expr);
}
```

**Why JSON.stringify works**:
- All expression fields are primitives, numbers, strings, or nested readonly objects
- No functions or circular references in expression types
- Readonly = deterministic field order
- Fast enough for compilation (not hot path)
- Alternative custom hash only needed if profiling shows bottleneck

**Cache Map Location**:
Add as private fields in IRBuilderImpl class (src/compiler/ir/IRBuilderImpl.ts:1-50)

---

### P0 (Critical): SigExpr Deduplication

**Confidence**: HIGH
**Dependencies**: P0 Hash Cache Infrastructure
**Spec Reference**: INVARIANTS.md:188-197 (I13), 04-compilation.md:451-469 • **Status Reference**: EVALUATION-2026-01-28-064128.md lines 59-89

#### Description
Apply hash-consing pattern to all SigExpr builder methods. Currently each call creates a unique ID even for identical expressions (EVALUATION lines 59-89). With hash-consing, identical expressions will share ExprIds.

Methods to modify: `sigConst`, `sigSlot`, `sigTime`, `sigExternal`, `sigMap`, `sigZip`, `sigShapeRef`, `sigBinOp`, `sigUnaryOp`, `sigCombine`, `sigStateRead`, `sigReduceField`, `sigEventRead` (~13 methods total).

#### Acceptance Criteria
- [ ] All `sig*` builder methods check `sigExprCache` before creating new ID
- [ ] Pattern applied uniformly: (1) hash expression, (2) check cache, (3) return existing or create new
- [ ] Duplicate `sigConst(1.0, FLOAT)` calls return identical SigExprId
- [ ] Duplicate compound expressions (e.g., `sigBinOp(a, b, OpCode.Add, FLOAT)`) return identical SigExprId
- [ ] Cache is updated on every new expression creation
- [ ] Unit test: create same expression twice, assert IDs are equal
- [ ] Unit test: create different expressions, assert IDs are different
- [ ] All 13+ sig* methods consistently apply hash-consing

#### Technical Notes
**Before/After Pattern** (EVALUATION:261-279):
```typescript
// BEFORE (current):
sigConst(value: number | string | boolean, type: CanonicalType): SigExprId {
  const id = sigExprId(this.sigExprs.length);
  this.sigExprs.push({ kind: 'const', value, type });
  return id;
}

// AFTER (hash-consing):
sigConst(value: number | string | boolean, type: CanonicalType): SigExprId {
  const hash = hashSigExpr({ kind: 'const', value, type });
  const existing = this.sigExprCache.get(hash);
  if (existing !== undefined) {
    return existing; // Reuse!
  }
  const id = sigExprId(this.sigExprs.length);
  this.sigExprs.push({ kind: 'const', value, type });
  this.sigExprCache.set(hash, id);
  return id;
}
```

**Common Duplication Patterns** (EVALUATION:178-193):
- Constants: `sigConst(1.0, FLOAT)` repeated across blocks
- Time references: `sigTime('tMs', FLOAT)` used everywhere
- Common subexpressions: `Add(a, b)` reused downstream

**Methods List** (from EVALUATION:81-83):
File: `src/compiler/ir/IRBuilderImpl.ts:109-143`
- sigConst, sigSlot, sigTime, sigExternal
- sigMap, sigZip, sigShapeRef
- sigBinOp, sigUnaryOp, sigCombine
- sigStateRead, sigReduceField, sigEventRead

---

### P1 (High): FieldExpr Deduplication

**Confidence**: HIGH
**Dependencies**: P0 Hash Cache Infrastructure
**Spec Reference**: INVARIANTS.md:188-197 (I13) • **Status Reference**: EVALUATION-2026-01-28-064128.md lines 109-121

#### Description
Apply hash-consing pattern to all FieldExpr builder methods. Same pattern as SigExpr but for field expressions, which have additional complexity (optional instanceId field, intrinsics).

Methods to modify: `fieldConst`, `fieldIntrinsic`, `fieldPlacement`, `fieldArray`, `fieldBroadcast`, `fieldMap`, `fieldZip`, `fieldZipSig`, `fieldStateRead`, `fieldPathDerivative` (~10 methods).

#### Acceptance Criteria
- [ ] All `field*` builder methods check `fieldExprCache` before creating new ID
- [ ] Hash correctly includes optional `instanceId` field (different instances = different expressions)
- [ ] Duplicate `fieldConst` calls return identical FieldExprId
- [ ] Duplicate `fieldIntrinsic(instance, 'index', type)` calls return identical FieldExprId
- [ ] Different instanceIds produce different hashes (correctly)
- [ ] Unit test: identical field expressions share ExprIds
- [ ] Unit test: field expressions with different instanceIds get different IDs
- [ ] All 10+ field* methods consistently apply hash-consing

#### Technical Notes
**FieldExpr Variants** (EVALUATION:109-121):
```typescript
export type FieldExpr =
  | FieldExprConst      // { kind: 'const', value, type }
  | FieldExprIntrinsic  // { kind: 'intrinsic', instanceId, intrinsic, type }
  | FieldExprBroadcast  // { kind: 'broadcast', signal, type }
  | FieldExprMap        // { kind: 'map', input, fn, type, instanceId? }
  | FieldExprZip        // { kind: 'zip', inputs, fn, type, instanceId? }
  | FieldExprZipSig     // { kind: 'zipSig', signal, field, fn, type }
  | FieldExprArray
  | FieldExprStateRead
  | FieldExprPathDerivative
  | FieldExprPlacement;
```

**Edge Case: instanceId** (EVALUATION:338-339):
- **Q**: What about instanceId fields?
- **A**: Include in hash. Different instances = different expressions (correctly).

**Common Duplication** (EVALUATION:182-183):
- Intrinsics: `fieldIntrinsic(instance, 'index', type)` repeated in loops
- Constants: `fieldConst` values broadcast across fields

---

### P2 (Medium): Tests & Validation

**Confidence**: HIGH
**Dependencies**: P0 SigExpr Deduplication, P1 FieldExpr Deduplication
**Spec Reference**: INVARIANTS.md:188-197 (I13) • **Status Reference**: EVALUATION-2026-01-28-064128.md lines 395-429

#### Description
Comprehensive test coverage to verify hash-consing works correctly for all expression types, including edge cases (nested expressions, optional fields, arrays). The evaluation provides specific test templates (lines 395-429).

Tests should verify both deduplication (identical → same ID) and distinction (different → different ID).

#### Acceptance Criteria
- [ ] Test: identical SigExpr return same SigExprId (EVALUATION:398-404)
- [ ] Test: identical FieldExpr return same FieldExprId
- [ ] Test: compound expressions deduplicate transitively (EVALUATION:417-429)
- [ ] Test: different expressions get different IDs
- [ ] Test: expressions with different instanceIds get different IDs
- [ ] Test: PureFn with composed ops hash correctly (array order preserved)
- [ ] Test: float precision handled consistently (JS number → JSON)
- [ ] Optional: Test deduplication statistics tracking (EVALUATION:407-414)
- [ ] All tests pass in CI

#### Technical Notes
**Test Template 1: Basic Deduplication** (EVALUATION:398-404):
```typescript
it('identical expressions share ExprIds (I13)', () => {
  const b = new IRBuilderImpl();
  const id1 = b.sigConst(1.0, FLOAT);
  const id2 = b.sigConst(1.0, FLOAT);
  expect(id1).toBe(id2); // MUST be same ID
});
```

**Test Template 2: Compound Deduplication** (EVALUATION:417-429):
```typescript
it('deduplicates compound expressions', () => {
  const b = new IRBuilderImpl();
  const a = b.sigConst(2.0, FLOAT);
  const b1 = b.sigConst(3.0, FLOAT);
  const b2 = b.sigConst(3.0, FLOAT);
  expect(b1).toBe(b2); // Constants deduplicated
  
  const sum1 = b.sigBinOp(a, b1, OpCode.Add, FLOAT);
  const sum2 = b.sigBinOp(a, b2, OpCode.Add, FLOAT);
  expect(sum1).toBe(sum2); // Operations deduplicated
});
```

**Test Template 3: Stats Tracking** (EVALUATION:407-414):
```typescript
it('tracks deduplication statistics', () => {
  const b = new IRBuilderImpl();
  // ... build IR with duplicates ...
  const stats = b.getHashConsStats();
  expect(stats.totalRequests).toBeGreaterThan(stats.uniqueExpressions);
});
```

**Edge Cases to Test** (EVALUATION:333-345):
- Array order: `[a, b]` ≠ `[b, a]` (JSON.stringify preserves order)
- Optional instanceId: included in hash
- Float precision: JS number → JSON always same representation
- PureFn composed ops: array order preserved

---

## Dependencies

**Dependency Graph**:
```
P0 Hash Cache Infrastructure
├─→ P0 SigExpr Deduplication
└─→ P1 FieldExpr Deduplication
    └─→ P2 Tests & Validation
```

**Critical Path**: All items are sequential except SigExpr/FieldExpr which can be done in parallel after infrastructure.

**External Dependencies**: None (standalone feature)

---

## Risks

### Risk 1: Incomplete Application of Pattern
**Severity**: Medium
**Likelihood**: Medium
**Description**: Missing hash-consing on some builder methods would lead to partial deduplication and confusing behavior.
**Mitigation**: 
- Create checklist of all builder methods (~20 total)
- Write comprehensive test that exercises all expression types
- Code review focusing on pattern consistency

### Risk 2: Hash Collision
**Severity**: Low
**Likelihood**: Very Low
**Description**: JSON.stringify could theoretically produce identical strings for different expressions.
**Mitigation**:
- Expression types are simple readonly objects with no ambiguity
- JSON.stringify is deterministic for our data structures
- Test coverage includes edge cases
- If collision found (unlikely), can switch to custom hash

### Risk 3: Performance Regression
**Severity**: Low
**Likelihood**: Very Low
**Description**: Hash lookup overhead could outweigh deduplication benefits in worst case (all unique expressions).
**Mitigation**:
- Evaluation shows typical 30-50% deduplication (line 366)
- Worst case: small overhead, no correctness impact
- Can measure with optional stats tracking
- Spec explicitly requires hash-consing (I13)

---

## Success Metrics

**Functional**:
- All identical expressions share ExprIds (100% deduplication)
- No behavior changes (optimization only)
- All existing tests continue to pass

**Performance** (Expected):
- 30-50% reduction in unique expression count for typical patches (EVALUATION:366)
- Smaller FrameCache arrays (proportional to deduplication)
- Compilation time: neutral or slight improvement

**Code Quality**:
- Pattern applied uniformly to all ~20 builder methods
- Test coverage for all expression types
- No increase in code complexity (mechanical transformation)

---

## Notes

**Complexity Estimate**: LOW (~130 LOC total)
- Hash functions: 20 LOC
- Cache maps: 3 LOC
- Builder modifications: 60 LOC
- Tests: 45 LOC

**Implementation Time**: 2-4 hours for experienced developer

**Spec Interpretation** (EVALUATION:373-384):
- System is **correct** without hash-consing (no logic breaks)
- System is **unusable** without it (performance degrades to unacceptable)
- Therefore: MUST implement, but failures are performance bugs not logic bugs

**Alternative Considered**: Custom hash function with explicit field handling
- Faster but more code
- Only optimize if profiling shows JSON.stringify is bottleneck (unlikely)

---

## References

- **Spec**: `design-docs/CANONICAL-oscilla-v2.5-20260109/INVARIANTS.md:188-197` (I13)
- **Spec**: `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md:451-469`
- **Gap**: `.agent_planning/gap-analysis/unimplemented/topic-04-compilation.md:24-28`
- **Code**: `src/compiler/ir/IRBuilderImpl.ts:109-143` (current sequential pattern)
- **Code**: `src/compiler/ir/types.ts:84-368` (expression type definitions)
- **Evaluation**: `EVALUATION-2026-01-28-064128.md` (complete analysis)
