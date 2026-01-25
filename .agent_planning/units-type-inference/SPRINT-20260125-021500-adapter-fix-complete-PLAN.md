# Sprint: adapter-fix-complete - Unit Variable Adapter Matching

Generated: 2026-01-25T02:15:00Z
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: COMPLETED

## Sprint Goal

Fix the adapter insertion bug where Broadcast adapters were not being inserted for Signal→Field connections when the source had a unit variable.

## Scope

**Deliverables:**
- Unit variables handled correctly in adapter matching
- UI connection validation supports unit variables
- Tests updated to reflect new error behavior
- Test suite reduced from 14 failures to 8 failures

## Work Items (All Completed)

### P0: Fix findAdapter unit variable handling ✅

**Acceptance Criteria:**
- [x] Unit variables match any concrete unit in adapter rules
- [x] Broadcast inserted for Const→Field connections
- [x] Steel thread tests compile successfully (not failing on type mismatch)

**Implementation:**
- Added `isUnitVar` check in `findAdapter()`
- When both rule patterns have `unit: 'any'`, skip equality check if either is a unitVar

### P1: Fix UI connection validation ✅

**Acceptance Criteria:**
- [x] `validateConnection()` allows Const→Add connections
- [x] Unit variables treated as polymorphic in UI

**Implementation:**
- Added unit variable check in `isTypeCompatible()` in typeValidation.ts

### P2: Update tests for new error behavior ✅

**Acceptance Criteria:**
- [x] Tests accept UnresolvedUnit for no-TimeRoot patches
- [x] cardinality-specialization test runs pass1 first

**Implementation:**
- Updated test expectations to accept multiple valid error types
- Added pass1TypeConstraints call before pass2TypeGraph

### P3: Verify adapter insertion ✅

**Acceptance Criteria:**
- [x] Debug test shows Broadcast in normalized patch
- [x] Edge routing correct: Const→Broadcast→FieldRadiusSqrt

**Implementation:**
- Updated debug test to test Signal→Field scenario
- Verified Broadcast appears in normalized blocks

## Results

| Metric | Before | After |
|--------|--------|-------|
| Failing tests | 14 | 8 |
| Adapter insertion | Broken | Working |
| Unit variable support | Missing | Complete |

## Dependencies

None - self-contained fix

## Remaining Work (Separate Sprint)

The 8 remaining test failures are related to RenderAssembler buffer types (Float32Array vs Uint8ClampedArray), which is a pre-existing issue unrelated to unit inference.
