# Sprint: Test Renderer Block

**Topic:** Fix Hash Block failing tests by implementing a test renderer fixture
**Created:** 2026-01-17
**Confidence:** HIGH
**Status:** ✅ COMPLETED 2026-01-18

## Problem Statement

Hash Block tests are failing because signals are lazily evaluated. Without a render sink consuming the Hash output, the signal evaluation never occurs and tests see default/uninitialized values.

Current failing tests:
- `different seeds produce different results` - expected 0 to be greater than 0
- `output is always in [0, 1) range` - expected -1 to be greater than or equal to 0

Root cause: Tests look at `state.cache.sigValues` but the Hash signal is never evaluated because nothing consumes it. The tests are essentially reading uninitialized memory.

## Solution Overview

A `TestSignal` block already exists in `src/blocks/test-blocks.ts` but is not registered. This block:
1. Acts as a sink (no outputs)
2. Forces evaluation of its input signal via `StepEvalSig`
3. Stores the result in a slot for test assertion

The block needs to be:
1. Registered in compile.ts
2. Use a new capability type (`sink`) or be treated as a sink block
3. Enhanced with test helper functions for retrieving evaluated values

## Implementation Plan

### P0: Register TestSignal Block (5 min)

Add import to `src/compiler/compile.ts`:
```typescript
import '../blocks/test-blocks'; // Test blocks for signal evaluation
```

Verification: Block registration exists - can be used in buildPatch()

### P1: Verify TestSignal Capability (5 min)

The TestSignal block uses `capability: 'pure'` which is incorrect for a sink block. However, looking at the architecture:
- The `lower` function already calls `ctx.b.addStep()` to add an `evalSig` step
- Pass7 collects steps via `unlinkedIR.builder.getSteps()` (line 203)
- So the evalSig step SHOULD be included in the schedule

**Action:** Test whether the current implementation works before changing capability.
If it doesn't work, change to `capability: 'sink'` (may need to add this capability type).

Verification: After P0 + P1, construct a test patch with TestSignal and verify the evalSig step appears in schedule.steps

### P2: Add Test Helper Functions (15 min)

Create test utilities in `src/blocks/__tests__/test-utils.ts`:

```typescript
/**
 * Execute a patch and return evaluated signal values.
 *
 * Works with TestSignal blocks that have captured values.
 */
export function executeAndCapture(
  patch: Patch,
  frameCount: number = 1
): { values: Float64Array; cache: { sigValues: Float64Array } }

/**
 * Find the slot containing a TestSignal's captured value.
 *
 * Uses debug index to map TestSignal block to its output slot.
 */
export function getTestSignalSlot(
  program: CompiledProgramIR,
  testSignalBlockId: string
): number

/**
 * Get the captured value from a TestSignal block after frame execution.
 */
export function getCapturedValue(
  state: RuntimeState,
  program: CompiledProgramIR,
  slot: number
): number
```

Verification: Helper functions compile without type errors

### P3: Update Hash Block Tests (20 min)

Rewrite failing tests to use TestSignal:

```typescript
it('different seeds produce different results', () => {
  const patch = buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot', {});
    const value = b.addBlock('Const', { value: 42 });
    const seed1 = b.addBlock('Const', { value: 0 });
    const seed2 = b.addBlock('Const', { value: 1 });
    const hash1 = b.addBlock('Hash', {});
    const hash2 = b.addBlock('Hash', {});
    const test1 = b.addBlock('TestSignal', {});
    const test2 = b.addBlock('TestSignal', {});

    b.wire(value, 'out', hash1, 'value');
    b.wire(seed1, 'out', hash1, 'seed');
    b.wire(hash1, 'out', test1, 'value');

    b.wire(value, 'out', hash2, 'value');
    b.wire(seed2, 'out', hash2, 'seed');
    b.wire(hash2, 'out', test2, 'value');
  });

  const result = compile(patch);
  expect(result.kind).toBe('ok');
  if (result.kind !== 'ok') return;

  const state = createRuntimeState(result.program.slotMeta.length);
  const pool = new BufferPool();
  executeFrame(result.program, state, pool, 0);

  // Get values from slots where TestSignal stored them
  const val1 = state.values.f64[0]; // First TestSignal's slot
  const val2 = state.values.f64[1]; // Second TestSignal's slot

  expect(val1).toBeGreaterThan(0);
  expect(val1).toBeLessThan(1);
  expect(val2).toBeGreaterThan(0);
  expect(val2).toBeLessThan(1);
  expect(val1).not.toBe(val2);
});
```

Verification: Both Hash Block tests pass

### P4: Fix Capability Type (If Needed) (10 min)

If P1 verification fails (evalSig step not in schedule), we need to:
1. Add `'sink'` as a valid capability type
2. Change TestSignal to use `capability: 'sink'`
3. Update pass7-schedule to include sink block steps (or verify they're already included via builder.getSteps())

Verification: Schedule contains evalSig step from TestSignal

### P5: Documentation (5 min)

Add JSDoc to TestSignal block and test utilities explaining:
- Purpose: Force signal evaluation for testing
- Usage pattern: Wire signal → TestSignal → check state.values.f64
- Limitations: Only works for float signals currently

Verification: Documentation complete

## Priority Order

| Priority | Task | Dependencies | Estimated |
|----------|------|--------------|-----------|
| P0 | Register TestSignal | None | 5 min |
| P1 | Verify capability | P0 | 5 min |
| P2 | Test helpers | P0 | 15 min |
| P3 | Update Hash tests | P0, P1, P2 | 20 min |
| P4 | Fix capability (conditional) | P1 fails | 10 min |
| P5 | Documentation | P3 | 5 min |

## Definition of Done

- [ ] TestSignal block is registered and usable in patches
- [ ] TestSignal's evalSig step appears in compiled schedule
- [ ] Hash Block tests pass using TestSignal pattern
- [ ] No regressions in other tests
- [ ] Pattern documented for future test authors

## Files to Modify

1. `src/compiler/compile.ts` - Add test-blocks import
2. `src/blocks/test-blocks.ts` - Potentially update capability
3. `src/blocks/__tests__/test-utils.ts` - NEW: Test helper functions
4. `src/blocks/__tests__/stateful-primitives.test.ts` - Update Hash tests

## Risk Assessment

**Low Risk:** The TestSignal block already exists with correct lowering logic. The main work is registration and test updates.

**Potential Issue:** If `ctx.b.addStep()` steps aren't being collected by pass7-schedule for non-render blocks, we may need to trace through the step collection logic.

**Mitigation:** Verify step collection before updating tests. The current implementation appears correct based on pass7 code review.
