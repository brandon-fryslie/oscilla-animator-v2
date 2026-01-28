# Sprint: reduce-op - ReduceOp for Field→Scalar Aggregation
Generated: 2026-01-28-061600  
Confidence: HIGH: 4, MEDIUM: 2, LOW: 0  
Status: READY FOR IMPLEMENTATION (HIGH confidence items), RESEARCH REQUIRED (MEDIUM runtime/testing)  
Source: EVALUATION-20260128-061533.md

## Sprint Goal
Implement ReduceOp expression type enabling field→scalar aggregation operations (min, max, sum, avg) with componentwise semantics for structured types.

## Scope
**Deliverables:**
- Add `SigExprReduceField` to IR type system
- Implement IRBuilder API for creating reduce expressions
- Register Reduce block in field-blocks.ts
- Add signal evaluation for 'reduce_field' in SignalEvaluator
- Implement runtime aggregation with componentwise semantics
- Comprehensive test coverage (unit + integration)

**Out of Scope:**
- Custom reduction functions (only 4 ops: min, max, sum, avg)
- Streaming/incremental reduction (materialize full field first)
- Parallel/GPU acceleration (single-threaded for now)

## Dependencies
**Prerequisite Work:**
- None - greenfield implementation

**Builds On:**
- Existing Broadcast implementation (dual operation pattern)
- SigExprShapeRef precedent (SigExpr with FieldExprId reference)
- Materializer infrastructure (field evaluation)
- SignalEvaluator architecture

**Blocks:**
- None identified

## Work Items

### P0: Add SigExprReduceField to IR Type System
**Confidence**: HIGH  
**Spec Reference**: 04-compilation.md:394, 409 • **Status Reference**: EVALUATION-20260128-061533.md §3 (Architecture Decision)

#### Description
Add new `SigExprReduceField` interface to the SigExpr union type. This follows the established pattern of `SigExprShapeRef` (line 147-154 in types.ts) which already references FieldExprId. Reduce is a signal expression (not a step) because it produces a signal value that can be composed with other expressions.

**Architecture Decision** (from evaluation):
- Reduce is a **SigExpr**, not just a Step
- Precedent: `SigExprShapeRef` has optional `FieldExprId` reference at line 152
- Pattern: Signal expressions can reference field IDs for lazy evaluation

#### Acceptance Criteria
- [ ] `SigExprReduceField` interface added to `src/compiler/ir/types.ts` with fields:
  - `kind: 'reduce_field'`
  - `field: FieldExprId` (input field to aggregate)
  - `op: 'min' | 'max' | 'sum' | 'avg'` (reduction operation)
  - `type: SignalType` (output signal type with cardinality=one)
- [ ] Added to `SigExpr` union type (lines 84-93)
- [ ] TypeScript compilation succeeds with no errors
- [ ] Exhaustive switch checks in `SignalEvaluator.ts` and `Materializer.ts` catch new variant

#### Technical Notes
- Insert after `SigExprShapeRef` in union type (line 92)
- Output type will have `cardinality: 'one'` but same payload as input field
- The `op` type is reused from spec definition (line 409)

**File**: `src/compiler/ir/types.ts` (lines 84-93, new interface ~line 166)

---

### P0: Implement IRBuilder.ReduceField Method
**Confidence**: HIGH  
**Spec Reference**: 04-compilation.md:394 • **Status Reference**: EVALUATION-20260128-061533.md §5 (IRBuilder API)

#### Description
Add `ReduceField()` method to IRBuilder interface and implementation. This creates a `SigExprReduceField` and returns its ID. Follows the exact pattern of `Broadcast()` (IRBuilderImpl.ts:286-290) but inverted (Field→Signal instead of Signal→Field).

#### Acceptance Criteria
- [ ] Method signature added to `IRBuilder` interface (src/compiler/ir/IRBuilder.ts):
  ```typescript
  ReduceField(field: FieldExprId, op: 'min'|'max'|'sum'|'avg', type: SignalType): SigExprId;
  ```
- [ ] Implementation added to `IRBuilderImpl` class (src/compiler/ir/IRBuilderImpl.ts):
  - Allocates new SigExprId
  - Pushes `SigExprReduceField` to `sigExprs` array
  - Returns the ID
- [ ] Type signature matches Broadcast pattern (symmetry verified)
- [ ] No instance inference needed (reduce is instance-agnostic like broadcast)

#### Technical Notes
- Insert after `sigShapeRef()` method (~line 140 in IRBuilder.ts)
- Implementation should be ~5 lines (mirror of Broadcast at line 286-290)
- No need to infer instance (reduce operates on already-resolved field)

**Files**: 
- `src/compiler/ir/IRBuilder.ts` (~line 140)
- `src/compiler/ir/IRBuilderImpl.ts` (~line 290)

---

### P1: Register Reduce Block in field-blocks.ts
**Confidence**: HIGH  
**Spec Reference**: 02-block-system.md:436, 04-compilation.md:409 • **Status Reference**: EVALUATION-20260128-061533.md §6 (Block Definition)

#### Description
Register Reduce block following the Broadcast pattern (field-blocks.ts:33-90). The block is payload-generic (works with all concrete payloads) and has a parameter for selecting the operation (min/max/sum/avg). Unlike Broadcast which is many→many, Reduce is many→one (field cardinality to signal cardinality).

**Cardinality Pattern**:
- Input: Field (cardinality=many)
- Output: Signal (cardinality=one)
- Mode: 'transform' but with laneCoupling='laneGlobal' (all elements contribute to result)

#### Acceptance Criteria
- [ ] Block registered in `src/blocks/field-blocks.ts` with properties:
  - `type: 'Reduce'`
  - `category: 'field'`
  - `form: 'primitive'`
  - `capability: 'pure'`
  - `cardinality.cardinalityMode: 'transform'`
  - `cardinality.laneCoupling: 'laneGlobal'` (all lanes contribute)
- [ ] Parameter defined for operation selection:
  - `op: { label: 'Operation', type: 'enum', options: ['min', 'max', 'sum', 'avg'], default: 'sum' }`
- [ ] Input port: `field: { label: 'Field', type: signalTypeField(payloadVar(...), 'default') }`
- [ ] Output port: `signal: { label: 'Result', type: signalType(payloadVar(...)) }`
- [ ] Payload-generic contract implemented (ALL_CONCRETE_PAYLOADS)
- [ ] `lower()` function calls `ctx.b.ReduceField(...)` and returns signal output
- [ ] Block appears in block picker UI under 'field' category
- [ ] TypeScript compilation succeeds

#### Technical Notes
- Insert after Broadcast block definition (~line 91)
- Use `payloadVar('reduce_payload')` for type unification
- Output has same payload as input but cardinality=one
- The parameter `op` is user-selectable at block authoring time

**File**: `src/blocks/field-blocks.ts` (~line 91, ~80 lines)

---

### P1: Add Signal Evaluation for 'reduce_field'
**Confidence**: MEDIUM (runtime materialization complexity)  
**Spec Reference**: 04-compilation.md:394, 409 • **Status Reference**: EVALUATION-20260128-061533.md §7 (Materializer Support)

#### Description
Add case handler for `'reduce_field'` in SignalEvaluator's `evaluateSigExpr()` function. When evaluating a reduce expression, the evaluator must materialize the input field, iterate over all elements, apply the reduction operation componentwise, and return the scalar result.

**Key Challenge**: SignalEvaluator currently doesn't materialize fields—that's Materializer's job. We need to call into Materializer from SignalEvaluator to get the field buffer, then reduce it.

#### Acceptance Criteria
- [ ] Case `'reduce_field':` added to switch in `src/runtime/SignalEvaluator.ts` (~line 200)
- [ ] Field materialization: calls `materialize()` to get field buffer
- [ ] Stride handling: respects `expr.type.payload` stride (1 for float, 2 for vec2, 4 for color)
- [ ] Implements all 4 operations correctly:
  - `'sum'`: componentwise sum (Σx, Σy for vec2)
  - `'avg'`: sum / count (per component)
  - `'min'`: componentwise minimum
  - `'max'`: componentwise maximum
- [ ] Empty field handling: returns 0 for numeric, false for bool
- [ ] NaN handling: propagates NaN if any element is NaN (IEEE 754)
- [ ] Returns scalar value (single number for float, stride values for vec2/color)

#### Technical Notes
- Need to import/access Materializer's `materialize()` function
- For structured types (vec2, color), reduce each component independently:
  ```typescript
  // Pseudocode for vec2 sum:
  let sum_x = 0, sum_y = 0;
  for (let i = 0; i < count; i++) {
    sum_x += buffer[i * 2 + 0];
    sum_y += buffer[i * 2 + 1];
  }
  return vec2(sum_x, sum_y); // But signals are numbers, so pack into slot
  ```
- **Question**: How do we return multi-component results from a signal? 
  - Answer from evaluation: Store in consecutive slots (stride-aware)
  - Signal evaluation returns a single number, but higher-level can read multiple slots

#### Unknowns to Resolve
1. **Signal return value for vec2/color**: Do we return first component only, or write to multiple slots?
   - Research approach: Check how SigExprShapeRef handles multi-component types
2. **Materializer access pattern**: Can SignalEvaluator call materialize() without circular dependency?
   - Research approach: Review existing cross-layer calls (e.g., Materializer calling evaluateSignal)

#### Exit Criteria (to reach HIGH confidence)
- [ ] Confirmed pattern for multi-component signal storage
- [ ] Verified no circular dependency issues with Materializer

**File**: `src/runtime/SignalEvaluator.ts` (~line 200, ~50 lines)

---

### P1: Implement Runtime Aggregation Logic
**Confidence**: MEDIUM (componentwise semantics verification needed)  
**Spec Reference**: 04-compilation.md:409, registry.ts:196 (componentwise) • **Status Reference**: EVALUATION-20260128-061533.md §8 (Type System)

#### Description
Implement the core reduction algorithms for each operation (min, max, sum, avg) with componentwise semantics for structured types. This is the actual computation kernel that processes field buffers.

**Componentwise Pattern** (from evaluation §8):
- vec2 sum: `[vec2(1,2), vec2(3,4)] → vec2(4, 6)` (sum x's, sum y's separately)
- NOT magnitude: `[vec2(1,2)] ≠ scalar(sqrt(5))`
- Each component is reduced independently as if it were a separate scalar field

#### Acceptance Criteria
- [ ] All 4 operations implemented correctly:
  - **sum**: `Σ(field[i])` per component
  - **avg**: `Σ(field[i]) / count` per component (returns 0 if count=0)
  - **min**: `min(field)` per component (returns 0 if count=0)
  - **max**: `max(field)` per component (returns 0 if count=0)
- [ ] Componentwise semantics verified for:
  - float (stride=1): single value
  - vec2 (stride=2): independent x and y
  - vec3 (stride=3): independent x, y, z
  - color (stride=4): independent r, g, b, a
- [ ] Edge cases handled:
  - Empty field (count=0): returns 0
  - Single element: returns that element
  - NaN in field: propagates NaN to result
  - Infinity: propagates to result
- [ ] Performance: processes 10k elements in <1ms (verified in P2 tests)

#### Technical Notes
- Implementation pattern:
  ```typescript
  const stride = strideOf(expr.type.payload);
  const count = buffer.length / stride;
  const result = new Float32Array(stride);
  
  // For sum (componentwise):
  for (let comp = 0; comp < stride; comp++) {
    let sum = 0;
    for (let i = 0; i < count; i++) {
      sum += buffer[i * stride + comp];
    }
    result[comp] = sum;
  }
  ```
- Min/max need special handling for empty fields (return 0, not Infinity)
- Avg must guard against divide-by-zero

#### Unknowns to Resolve
1. **NaN propagation policy**: Should `sum([1, NaN, 3])` return NaN or 4?
   - Research approach: Check IEEE 754 standard and existing runtime behavior
   - Likely answer: Return NaN (fail-fast on invalid data)

#### Exit Criteria (to reach HIGH confidence)
- [ ] NaN propagation policy confirmed against existing runtime
- [ ] Componentwise semantics verified with reference implementation

**File**: `src/runtime/SignalEvaluator.ts` (helper functions, ~80 lines)

---

### P2: Comprehensive Test Coverage
**Confidence**: HIGH  
**Spec Reference**: All of above • **Status Reference**: EVALUATION-20260128-061533.md §9 (Test Coverage)

#### Description
Write unit tests for IR types, block registration, and runtime evaluation, plus integration tests for end-to-end field→reduce→signal data flow. Tests verify correctness, edge cases, and performance.

#### Acceptance Criteria
- [ ] **Unit tests** in `src/runtime/__tests__/reduce-op.test.ts`:
  - All 4 operations with known inputs/outputs:
    - `sum([1, 2, 3]) === 6`
    - `avg([2, 4, 6]) === 4`
    - `min([3, 1, 2]) === 1`
    - `max([3, 1, 2]) === 3`
  - Componentwise semantics for vec2:
    - `sum([vec2(1,2), vec2(3,4)]) === vec2(4, 6)`
  - Edge cases:
    - Empty field: `sum([]) === 0`
    - Single element: `min([5]) === 5`
    - NaN handling: `sum([1, NaN]) === NaN`
    - All zeros: `sum([0, 0, 0]) === 0`
- [ ] **Integration test** in `src/runtime/__tests__/integration.test.ts`:
  - Patch: Array → Field → Reduce → downstream block
  - Verifies field materialization → reduction → signal output
  - Confirms result appears in RuntimeState slots
- [ ] **Block registration test** in `src/blocks/__tests__/field-blocks.test.ts`:
  - Block appears in registry
  - Has correct inputs/outputs/params
  - Lower function returns valid IR
- [ ] **Performance regression test**:
  - Reduce 10k elements in <1ms
  - No memory leaks (buffer pool works correctly)
- [ ] All tests pass in CI
- [ ] Test coverage >90% for new code

#### Technical Notes
- Use `buildPatch` helper from test-utils
- Use `getTestArena()` for buffer allocation
- Pattern from integration.test.ts:1-100
- Test both scalar (float) and structured (vec2) payloads

**Files**: 
- `src/runtime/__tests__/reduce-op.test.ts` (new file, ~150 lines)
- `src/runtime/__tests__/integration.test.ts` (add 1 test, ~30 lines)
- `src/blocks/__tests__/field-blocks.test.ts` (add 1 test, ~20 lines)

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Multi-component signal storage** | MEDIUM | Research SigExprShapeRef pattern; may need slot-stride aware writes |
| **Circular dependency (SignalEvaluator ↔ Materializer)** | LOW | Materializer already imports SignalEvaluator; reverse is safe |
| **NaN propagation inconsistency** | LOW | Follow IEEE 754; document in code comments |
| **Performance for large fields (100k+ elements)** | LOW | Defer optimization; initial impl is correct, not fast |
| **Type system integration complexity** | LOW | Follow Broadcast precedent; payload resolution already works |

## Success Metrics
- [ ] All 4 operations (min, max, sum, avg) working correctly
- [ ] Componentwise semantics verified for vec2 and color
- [ ] Zero compiler or runtime errors
- [ ] >90% test coverage
- [ ] Block appears in UI and is usable
- [ ] Documentation updated (inline comments)

## Implementation Order
1. **P0 items first** (IR types, IRBuilder) - establishes foundation
2. **P1 block registration** - enables UI testing during dev
3. **P1 signal evaluation + runtime** - can develop/test together
4. **P2 tests** - verify everything works, catch edge cases

Estimated effort: 4-6 hours for experienced developer.

## Notes
- **Architecture resolved**: Reduce is a SigExpr (not just Step), following SigExprShapeRef precedent
- **Componentwise semantics confirmed**: registry.ts:196 defines this as standard pattern
- **Broadcast is the dual**: Implement Reduce as the exact inverse of Broadcast
- **Empty field default**: Return 0 (acceptable, low risk per evaluation)
