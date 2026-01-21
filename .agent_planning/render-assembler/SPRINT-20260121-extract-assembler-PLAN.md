# Sprint: extract-assembler - Extract RenderAssembler Module
Generated: 2026-01-21T21:15:00Z
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Extract render assembly logic from ScheduleExecutor into a dedicated RenderAssembler module, creating a clean separation between schedule execution and render preparation.

## Context
Currently, ScheduleExecutor.executeFrame() both executes the schedule AND assembles the RenderFrameIR. The recommendation in 8-before-render.md calls for a separate RenderAssembler stage that:
1. Resolves all IR references into concrete typed arrays
2. Makes the renderer a pure sink with no interpretation logic
3. Provides a clean architectural seam between runtime and renderer

## Deliverables

### 1. Create RenderAssembler.ts
Create `src/runtime/RenderAssembler.ts` with:
- `assembleFrame()` function that takes schedule execution results and produces RenderFrameIR
- Move render pass assembly logic from ScheduleExecutor

**Acceptance Criteria:**
- [ ] File exists at `src/runtime/RenderAssembler.ts`
- [ ] `assembleFrame()` exported and callable
- [ ] Function signature matches: `(slots, fieldBuffers, renderSteps, ...) => RenderFrameIR`
- [ ] All existing tests pass unchanged
- [ ] TypeScript compiles without errors

### 2. Update ScheduleExecutor to use RenderAssembler
Modify `src/runtime/ScheduleExecutor.ts` to call RenderAssembler:
- Import and call `assembleFrame()` instead of inline assembly
- Keep the same output format (RenderFrameIR v1)

**Acceptance Criteria:**
- [ ] ScheduleExecutor imports RenderAssembler
- [ ] `executeFrame()` delegates render assembly to `assembleFrame()`
- [ ] Output format unchanged (RenderFrameIR v1)
- [ ] No behavioral changes to existing functionality
- [ ] All 610+ tests pass

### 3. Add unit tests for RenderAssembler
Create `src/runtime/__tests__/RenderAssembler.test.ts`:
- Test basic assembly from mock inputs
- Test edge cases (empty passes, missing fields)

**Acceptance Criteria:**
- [ ] Test file exists
- [ ] At least 5 test cases covering core functionality
- [ ] Tests pass

## Technical Approach

1. Identify the render assembly code in ScheduleExecutor (lines ~200-280 in executeFrame)
2. Extract into new module with explicit input types
3. Update ScheduleExecutor to pass required data to assembler
4. Verify all tests pass
5. Add focused unit tests for the new module

## Dependencies
None - this is the first sprint in the series.

## Files to Modify
- Create: `src/runtime/RenderAssembler.ts`
- Create: `src/runtime/__tests__/RenderAssembler.test.ts`
- Modify: `src/runtime/ScheduleExecutor.ts`

## Risks
| Risk | Probability | Mitigation |
|------|-------------|------------|
| Breaking existing behavior | LOW | Keep exact same output format |
| Missing edge cases | LOW | Run full test suite after each change |
