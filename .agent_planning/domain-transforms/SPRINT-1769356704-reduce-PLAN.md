# Sprint: Reduce Adapter Block

Generated: 2026-01-25T17:18:24Z
Confidence: HIGH: 1, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Implement the Reduce block to collapse fields to scalars, enabling control flow loops between field computations and global modulation.

## Scope

**Deliverable:**
- Reduce block: many+continuous<T> → one+continuous<T> via operation param
- Support all operations: mean, sum, min, max, rms, any, all
- Type-safe connection validation
- Runtime evaluation for all supported types
- Full test coverage

## Work Items

### P0: Define Reduce Block in Registry

**Location**: `src/blocks/adapter-blocks.ts` (add new block definition)

**Implementation**:
1. Register Reduce block with:
   - `type: 'Reduce'`
   - `form: 'primitive'`
   - Input: `field` of type Field<*>
   - Input: `op` (parameter, enum: mean|sum|min|max|rms|any|all)
   - Output: scalar of same payload type as input
2. Set cardinality: input many → output one
3. Set temporality: both continuous

**Acceptance Criteria**:
- [ ] Block registered and findable in BLOCK_DEFS_BY_TYPE
- [ ] UI shows operation selector for op parameter
- [ ] Type signature correctly reflects many→one transform
- [ ] Block can be added to graph without errors

**Technical Notes**:
- Follow pattern of existing Broadcast block
- Operation param is readonly (user selects at creation time)
- Use `signalTypeField('*', 'default')` for polymorphic input

---

### P1: Implement Runtime Evaluation

**Location**: `src/blocks/adapter-blocks.ts` → `lower()` function for Reduce

**Implementation**:
1. Generate IR code that:
   - Reads field buffer
   - Applies operation to compute scalar
   - Per-operation implementations:
     - `mean`: sum all values, divide by count
     - `sum`: accumulate all values
     - `min`/`max`: iterate finding extrema
     - `rms`: sqrt(mean(x²))
     - `any`: OR all values (for bool)
     - `all`: AND all values (for bool)
2. Handle edge case: empty field → return 0 or default

**Acceptance Criteria**:
- [ ] IR generation compiles without errors
- [ ] Each operation produces correct scalar output
- [ ] Empty field returns sensible default
- [ ] No NaN or Infinity in output
- [ ] Type checking ensures payload types match

**Technical Notes**:
- Allocate scalar slot in IR (not field)
- Field buffer already exists from input connection
- Operation can be statically determined from params
- No state needed (unlike Broadcast with input tracking)

---

### P2: Type System Integration

**Location**: `src/compiler/passes-v2/pass0-payload-resolution.ts` and type validation

**Implementation**:
1. Ensure payload resolution understands Reduce:
   - Input payload type determines output payload type
   - Operation op doesn't affect typing
2. Update type validation to accept Reduce connections:
   - Field<T> → Reduce outputs Scalar<T>
   - Backward compat: existing type checks should still work

**Acceptance Criteria**:
- [ ] Type checker accepts Field → Reduce connections
- [ ] Output type matches input payload type
- [ ] Mismatched types rejected (e.g., connecting bool to mean)
- [ ] No compile errors with Reduce in graph

---

### P3: Unit Tests

**Location**: `src/blocks/__tests__/adapter-blocks.test.ts` (new or extend existing)

**Test Cases**:
1. **Type tests**:
   - Field<float> → Reduce(mean) → outputs Scalar<float>
   - Field<int> → Reduce(sum) → outputs Scalar<int>
   - Field<bool> → Reduce(any) → outputs Scalar<bool>
   - Field<vec2> → Reduce(mean) → outputs Scalar<vec2> (per-component)

2. **Runtime tests** (compile and execute):
   - mean([1, 2, 3]) = 2
   - sum([1, 2, 3]) = 6
   - min([3, 1, 2]) = 1
   - max([3, 1, 2]) = 3
   - rms([0, 1, 2]) ≈ 1.225
   - any([false, true, false]) = true
   - all([true, true, false]) = false

3. **Edge cases**:
   - Empty field (0 lanes) → output 0
   - Single lane → output that value
   - All zeros → outputs 0
   - Negative numbers → min/max handle correctly

**Acceptance Criteria**:
- [ ] All type tests pass
- [ ] All runtime tests pass (within tolerance for float)
- [ ] Edge cases handled
- [ ] >90% code coverage for Reduce implementation

---

### P4: Integration Test

**Test**: Graph-level flow with Reduce

**Scenario**:
1. Create Field<float> of 10 positions (from Broadcast)
2. Apply per-lane operations (scale, offset)
3. Reduce(mean) to get average position
4. Use as camera target
5. Verify camera updates correctly

**Acceptance Criteria**:
- [ ] Full graph compiles without errors
- [ ] Reduce output drives downstream block
- [ ] Value changes propagate correctly
- [ ] No performance regression

## Dependencies

- Broadcast block (must exist) - ✓ Already implemented
- Field infrastructure (slots, buffers) - ✓ Already in place
- Type system (payload resolution) - ✓ Already implemented

## Risks

- **Per-component reduce for structured types** (vec2, color): Should mean operate per-component or on whole value? Decision: Per-component (treat as independent floats)
- **Empty field default**: What should it be? Decision: 0 for numeric, false for bool, default constructor for complex

## Related Work

- ScatterToField (P3 in next sprint) needs Reduce to close loops
- Broadcast already does one→many; Reduce does many→one
