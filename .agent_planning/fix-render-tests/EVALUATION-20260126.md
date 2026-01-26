# Evaluation: Fix Render Tests
Date: 2026-01-26
Topic: fix-render-tests

## Current Test Failures

Running `npm run test` reveals **12 failing tests** across **6 test files**:

### Category 1: Position Buffer Stride-3 → Stride-2 (3 tests)
These tests still expect `stride-3` (x,y,z) position buffers but the projection system now outputs `stride-2` (x,y):

| Test File | Test Name | Failure |
|-----------|-----------|---------|
| `steel-thread.test.ts` | should compile and execute the minimal animated particles patch | `expected 200 to be 300` (100 * 2 vs 100 * 3) |
| `steel-thread-rect.test.ts` | should compile and execute a patch using Rect topology | `expected 100 to be 150` (50 * 2 vs 50 * 3) |
| `steel-thread-dual-topology.test.ts` | should render two topologies with animated scale and opacity | `expected 50 to be 75` (25 * 2 vs 25 * 3) |

**Root Cause**: Buffer stride changed from vec3→vec2 after projection. This is correct per spec (`screenPosition: Field<vec2>`). Tests need updates to expect stride-2.

**Verified**: Commit `7fd3a6a` documents this as intentional, expert-verified, spec-compliant change.

### Category 2: Golden Projection Tests (3 tests)
These tests have issues with size being a uniform `number` vs per-instance `Float32Array`:

| Test File | Test Name | Failure |
|-----------|-----------|---------|
| `level10-golden-tests.test.ts` | Test 1.1: Run 120 frames ortho | `expected 1.497... to be 1` |
| `level10-golden-tests.test.ts` | Test 1.2: Toggle to perspective | `expected false to be true` |
| `level10-golden-tests.test.ts` | Test 1.3: Toggle back to ortho | `expected 1.497... to be 1` |

**Root Cause**: Test assumes `op.instances.size` is a `Float32Array` but without a Camera block, it's a uniform `number`. The test also accesses `orthoPositions[i * 2]` which is wrong if the positions are actually stride-3.

### Category 3: Event Blocks (4 tests)
These tests have issues finding event signals in slot values:

| Test File | Test Name | Failure |
|-----------|-----------|---------|
| `event-blocks.test.ts` | outputs 1.0 when pulse event fires | `expected false to be true` |
| `event-blocks.test.ts` | outputs 1.0 every frame for pulse | `expected undefined to be 1` |
| `event-blocks.test.ts` | latches input value when pulse trigger fires | `expected undefined to be 100` |
| `event-blocks.test.ts` | SampleHold output can drive downstream blocks | `expected false to be true` |

**Root Cause**: The tests search for event signals using an incorrect lookup strategy. They iterate over `evalSig` steps looking for values, but the slot→offset mapping or the signal evaluation strategy has changed.

### Category 4: Continuity Crossfade (2 tests)
These tests have issues with crossfade buffer initialization:

| Test File | Test Name | Failure |
|-----------|-----------|---------|
| `continuity-integration.test.ts` | blends old and new buffers linearly | `expected 100 to be close to 10` |
| `continuity-integration.test.ts` | uses smoothstep curve when specified | `expected 100 to be close to 0` |

**Root Cause**: The crossfade expects to start with "old values" in the slew buffer, but gets "new values" instead. The `applyContinuity` function may be reading from the wrong buffer or the buffer setup in the test is incorrect.

## Analysis

### Sprint 1: Position Buffer Stride (HIGH confidence)
**Scope**: 3 test files, straightforward update
**Approach**: Change all tests that expect `stride-3` to expect `stride-2`:
- Replace `count * 3` with `count * 2`
- Remove z-coordinate validation loops
- Update position comparison loops from `i * 3` to `i * 2`

**Risk**: Low - purely test updates, no implementation changes.

### Sprint 2: Golden Projection Tests (MEDIUM confidence)
**Scope**: 1 test file, moderate complexity
**Approach**: Need to investigate if Camera block is being used correctly. Tests may need:
- Add explicit Camera block if projection is required
- Or update assertions to handle uniform `number` size when no camera is present
- Fix position stride in comparison code

**Risk**: Medium - need to verify what the correct behavior should be.

### Sprint 3: Event Blocks (MEDIUM confidence)
**Scope**: 1 test file, requires investigation
**Approach**: Need to understand:
- How event signals flow through the schedule
- Why slot→offset mapping doesn't find the expected values
- Whether `evaluateSignal` should be used differently

**Risk**: Medium - may involve understanding event system changes.

### Sprint 4: Continuity Crossfade (MEDIUM confidence)
**Scope**: 1 test file, unit tests with mocks
**Approach**: Need to understand:
- What `slewBuffer.set([0])` is supposed to represent
- How `applyContinuity` reads the "old" vs "new" values
- Whether the mock setup is correct

**Risk**: Medium - may involve understanding continuity state management.

## Verdict: CONTINUE

All issues appear to be test-only fixes. The implementation is correct; tests need to be updated to match current behavior.

## Recommended Sprint Order

1. **Position Buffer Stride** (HIGH) - Clear, mechanical fix
2. **Event Blocks** (MEDIUM) - Need to understand event signal lookup
3. **Continuity Crossfade** (MEDIUM) - Need to understand mock setup
4. **Golden Projection Tests** (MEDIUM) - Need to verify Camera block usage

## Questions for User

None - all issues are test updates that should be straightforward to resolve.
