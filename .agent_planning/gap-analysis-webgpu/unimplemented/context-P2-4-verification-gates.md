# Context: P2-4 - Verification Gate Test Suite

## Target State
Spec section 7 requires five verification gate tests:
1. Typecheck is clean for emitter modules
2. Emitter tests verify:
   a. Recursive block emission
   b. Lexical scope isolation failures are caught
   c. Dynamic-read clamp injection is present
   d. Atomic non-integer payload rejection
   e. String interpolation exclusion in emitter lowering files
3. Validator reports expression vs statement failures with source mapping to visualBlockId
4. Draw-prep metadata stays structured; compile.ts must not assemble draw-prep WGSL source text

## Current State
### What exists
- `src/compiler/__tests__/naga-lowering.test.ts` — tests for the lowering pipeline (ScheduleNagaLowering)
- `src/compiler/__tests__/naga-compile.test.ts` — tests for the naga-compile bridge
- `NagaValidator.ts` has test-only seams (`unsafeAppendExpressionForTesting`, `unsafeAppendStatementForTesting`) suggesting validator tests exist
- `src/__tests__/forbidden-patterns.test.ts` enforces some architectural constraints via grep

### What's missing
- Gate 2b: No test verifies scope isolation enforcement (ScopeEnvironment is dead code)
- Gate 2c: No test verifies dynamic-read clamp injection (not implemented)
- Gate 2e: No test verifies string interpolation exclusion in lowering files
- Gate 4: No draw-prep concept exists in TS compiler

## Files Involved
- `src/compiler/__tests__/naga-lowering.test.ts`
- `src/compiler/__tests__/naga-compile.test.ts`
- `src/__tests__/forbidden-patterns.test.ts` (could be extended for gate 2e)

## Suggested Approach
1. Add a forbidden-patterns test that greps `ScheduleNagaLowering.ts` for template literals containing WGSL keywords (gate 2e)
2. Add a naga-lowering test that verifies `buffer_load` expressions always have preceding bounds checks (gate 2c, after implementing the clamping)
3. Gate 2b depends on ScopeEnvironment integration (see context-P2-4-scope-isolation.md)
4. Gate 2d is already covered by NagaValidator tests

## Risks
- Adding verification gate tests without implementing the underlying features (bounds clamping, scope isolation) would create immediately failing tests
- Should implement features first, then add gate tests
