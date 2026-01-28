# Definition of Done: reduce-op
Generated: 2026-01-28-061600  
Status: READY FOR IMPLEMENTATION (HIGH items), RESEARCH REQUIRED (MEDIUM items)  
Plan: SPRINT-20260128-061600-reduce-op-PLAN.md

## Acceptance Criteria

### P0: IR Type System Complete
**Work Item**: Add SigExprReduceField to IR types  
**Status**: Not Started

- [ ] `SigExprReduceField` interface exists in `src/compiler/ir/types.ts`
- [ ] Has `kind: 'reduce_field'` field
- [ ] Has `field: FieldExprId` field (input to reduce)
- [ ] Has `op: 'min' | 'max' | 'sum' | 'avg'` field
- [ ] Has `type: CanonicalType` field (output type with cardinality=one)
- [ ] Added to `SigExpr` union type at line 84-93
- [ ] TypeScript compiles with no errors
- [ ] Exhaustive switch checks in SignalEvaluator catch new case
- [ ] Exhaustive switch checks in Materializer catch new case (if applicable)

**Verification**:
```bash
npm run build
grep "kind: 'reduce_field'" src/compiler/ir/types.ts
```

---

### P0: IRBuilder API Functional
**Work Item**: Implement IRBuilder.ReduceField method  
**Status**: Not Started

- [ ] `ReduceField()` method declared in `IRBuilder` interface
- [ ] Method signature: `ReduceField(field: FieldExprId, op: 'min'|'max'|'sum'|'avg', type: CanonicalType): SigExprId`
- [ ] Implementation exists in `IRBuilderImpl` class
- [ ] Implementation allocates new SigExprId correctly
- [ ] Implementation pushes correct expr to `sigExprs` array
- [ ] Implementation returns the allocated ID
- [ ] Method is symmetric with `Broadcast()` (inverted types)
- [ ] TypeScript compiles with no errors
- [ ] No instance inference logic needed (reduce is instance-agnostic)

**Verification**:
```typescript
// Can be called in block lower functions:
const sigId = ctx.b.ReduceField(fieldId, 'sum', outputType);
```

---

### P1: Block Registration Complete
**Work Item**: Register Reduce block in field-blocks.ts  
**Status**: Not Started

- [ ] Block registered with type `'Reduce'` in `src/blocks/field-blocks.ts`
- [ ] Category is `'field'`
- [ ] Form is `'primitive'`
- [ ] Capability is `'pure'`
- [ ] Cardinality mode is `'transform'`
- [ ] Lane coupling is `'laneGlobal'` (all elements contribute)
- [ ] Parameter `op` defined with 4 options: ['min', 'max', 'sum', 'avg']
- [ ] Default operation is 'sum'
- [ ] Input port `field` has type `signalTypeField(payloadVar(...), 'default')`
- [ ] Output port `signal` has type `canonicalType(payloadVar(...))`
- [ ] Payload-generic contract uses `ALL_CONCRETE_PAYLOADS`
- [ ] `lower()` function calls `ctx.b.ReduceField(...)`
- [ ] `lower()` returns signal output with correct type and slot
- [ ] Block appears in UI block picker under 'field' category
- [ ] TypeScript compiles with no errors

**Verification**:
```bash
npm run dev
# In UI: Check 'field' category contains 'Reduce' block
# Create block and verify parameter dropdown shows 4 options
```

---

### P1: Signal Evaluation Working
**Work Item**: Add signal evaluation for 'reduce_field'  
**Status**: Not Started (MEDIUM confidence - research needed)

- [ ] Case handler `'reduce_field':` added to SignalEvaluator.ts switch (~line 200)
- [ ] Calls materialize() to get field buffer (or equivalent)
- [ ] Reads buffer length and stride from field type
- [ ] Dispatches to correct operation (min/max/sum/avg)
- [ ] Returns scalar result (number)
- [ ] Handles empty field: returns 0
- [ ] Handles NaN: propagates NaN to result
- [ ] No circular dependency issues with Materializer
- [ ] Multi-component types (vec2, color) handled correctly
- [ ] Result stored in appropriate slot(s) based on stride

**Exit Criteria** (for MEDIUM→HIGH):
- [ ] Confirmed how to return multi-component results from signals
- [ ] Verified Materializer access pattern is safe

**Verification**:
```typescript
// Unit test:
const result = evaluateSignal(reduceExprId, signals, state);
expect(result).toBe(expectedValue);
```

---

### P1: Runtime Aggregation Correct
**Work Item**: Implement runtime aggregation logic  
**Status**: Not Started (MEDIUM confidence - componentwise verification needed)

- [ ] **Sum operation**:
  - Computes Σ(field[i]) for each component
  - Returns 0 for empty field
  - Propagates NaN if any element is NaN
- [ ] **Avg operation**:
  - Computes Σ(field[i]) / count for each component
  - Returns 0 for empty field (not NaN from 0/0)
  - Propagates NaN if any element is NaN
- [ ] **Min operation**:
  - Computes min(field) for each component
  - Returns 0 for empty field (not Infinity)
  - Propagates NaN if any element is NaN
- [ ] **Max operation**:
  - Computes max(field) for each component
  - Returns 0 for empty field (not -Infinity)
  - Propagates NaN if any element is NaN
- [ ] **Componentwise semantics verified**:
  - float (stride=1): single value reduction
  - vec2 (stride=2): independent x and y reductions
  - vec3 (stride=3): independent x, y, z reductions
  - color (stride=4): independent r, g, b, a reductions
- [ ] **Edge cases handled**:
  - Empty field (count=0) → returns 0
  - Single element → returns that element (for min/max/avg)
  - All zeros → returns 0
  - Field with Infinity → propagates Infinity

**Exit Criteria** (for MEDIUM→HIGH):
- [ ] NaN propagation policy confirmed (likely: fail-fast)
- [ ] Componentwise semantics tested with vec2 reference case

**Verification**:
```typescript
// Known value tests:
sum([1, 2, 3]) === 6
avg([2, 4, 6]) === 4
min([3, 1, 2]) === 1
max([3, 1, 2]) === 3

// Componentwise:
sum([vec2(1,2), vec2(3,4)]) === vec2(4, 6)
```

---

### P2: Test Coverage Complete
**Work Item**: Comprehensive test coverage  
**Status**: Not Started

- [ ] **Unit tests file created**: `src/runtime/__tests__/reduce-op.test.ts`
- [ ] **Operation correctness tests**:
  - sum([1, 2, 3]) === 6
  - avg([2, 4, 6]) === 4
  - min([3, 1, 2]) === 1
  - max([3, 1, 2]) === 3
- [ ] **Componentwise tests**:
  - sum([vec2(1,2), vec2(3,4)]) === vec2(4, 6)
  - avg([vec2(2,4), vec2(6,8)]) === vec2(4, 6)
- [ ] **Edge case tests**:
  - Empty field: sum([]) === 0
  - Single element: min([5]) === 5
  - NaN handling: sum([1, NaN]) === NaN
  - All zeros: sum([0, 0, 0]) === 0
  - Infinity: max([1, Infinity]) === Infinity
- [ ] **Integration test added** to `src/runtime/__tests__/integration.test.ts`:
  - Creates patch: Array → Field op → Reduce → downstream
  - Verifies full compilation and execution
  - Checks result in RuntimeState slots
- [ ] **Block registration test** in `src/blocks/__tests__/field-blocks.test.ts`:
  - Verifies block in registry
  - Checks input/output/param types
  - Tests lower() returns valid IR
- [ ] **Performance test**:
  - Reduces 10k float elements in <1ms
  - Reduces 10k vec2 elements in <2ms
  - No memory leaks (buffers returned to pool)
- [ ] All tests pass in CI
- [ ] Test coverage >90% for new code

**Verification**:
```bash
npm test -- reduce-op
npm test -- integration
# All tests pass
```

---

## Exit Criteria (Sprint Complete)

### Must Have (Blocking)
- [ ] All P0 acceptance criteria met (IR types, IRBuilder)
- [ ] All P1 acceptance criteria met (block, evaluation, runtime)
- [ ] All P2 acceptance criteria met (tests)
- [ ] TypeScript compiles with no errors
- [ ] All unit tests pass (200+ existing + new tests)
- [ ] Integration tests pass
- [ ] Block appears in UI and is usable

### Should Have (Non-blocking)
- [ ] Performance benchmarks run and documented
- [ ] Code reviewed by second developer
- [ ] Inline documentation complete (TSDoc comments)
- [ ] EVALUATION file updated with implementation results

### Nice to Have (Future work)
- [ ] Optimization for large fields (parallel/SIMD)
- [ ] Extended to support boolean operations (any/all)
- [ ] Streaming reduction for infinite fields
- [ ] GPU acceleration path

---

## Verification Commands

```bash
# Build
npm run build

# Run all tests
npm test

# Run specific test file
npm test -- reduce-op

# Run integration tests
npm test -- integration

# Type check only
npx tsc --noEmit

# Start dev server (manual UI testing)
npm run dev
```

---

## Sign-off Checklist

- [ ] Developer: Implementation complete and self-tested
- [ ] Tests: All automated tests passing
- [ ] Documentation: Inline comments and TSDoc added
- [ ] Code quality: No linting errors, follows project patterns
- [ ] UI verification: Block tested in visual editor
- [ ] Performance: No regressions, benchmarks acceptable

**Ready for merge when all P0, P1, P2 criteria met and sign-off complete.**
