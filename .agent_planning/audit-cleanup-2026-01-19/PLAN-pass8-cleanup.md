# Plan: Pass 8/convertLinkedIRToProgram Pipeline Cleanup

**Date**: 2026-01-19
**Priority**: P1
**Status**: PLANNED

## Summary

Clean up misleading code in the compiler pipeline. Investigation reveals that `pass8LinkResolution` exists but the current pipeline works without it. The stub function `createStubProgramIR` is actually dead code.

## Current State

**Key Discovery:** The TODO comments are misleading:
- `createStubProgramIR()` is defined but NEVER called
- `convertLinkedIRToProgram()` IS being called and works
- Pass 6 already resolves inputs via `resolveInputsWithMultiInput`
- Pass 8 may only be needed for camera blocks (deferred lowering)

## Implementation Steps

### Step 1: Remove Dead Code
**File:** `src/compiler/compile.ts`

Delete `createStubProgramIR` function (lines 277-303) - it's unused.

### Step 2: Clean Up Comments
**File:** `src/compiler/compile.ts`

Remove misleading TODO comments at lines 174-180. Replace with:
```typescript
// Pass 8 (Link Resolution) is optional - only needed for camera blocks
// Pass 6 handles standard input resolution via resolveInputsWithMultiInput
```

### Step 3: Rename for Clarity (Optional)
Consider renaming `convertLinkedIRToProgram` to `createProgramIR` since it doesn't receive LinkedIR.

### Step 4: Keep Pass 8 for Future
Keep `pass8-link-resolution.ts` implementation, add conditional call when camera blocks are introduced.

## Files to Modify

| File | Changes |
|------|---------|
| `src/compiler/compile.ts` | Remove dead code, update comments |

## Verification

- [ ] All existing tests pass
- [ ] `npm run typecheck` succeeds
- [ ] Animation demos work
- [ ] No TypeScript errors

## Risks

| Risk | Mitigation |
|------|------------|
| Camera blocks may need pass8 | Keep implementation, add conditional later |
| Misleading future developers | Add clear documentation |
