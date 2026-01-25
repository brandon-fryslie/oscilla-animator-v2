# Sprint: Branded Type Literals

**Generated:** 2026-01-25T13:20:00Z
**Confidence:** HIGH: 3, MEDIUM: 0, LOW: 0
**Status:** READY FOR IMPLEMENTATION
**Estimated effort:** 15 minutes

## Sprint Goal

Replace ~35 'as any' casts for branded type literals (BlockId, SigExprId, ValueSlot) with proper factory function calls.

## Scope

**Deliverables:**
- Remove all `'b0' as any` casts for BlockId values
- Remove all `0 as any` casts for SigExprId/ValueSlot values
- Use existing factory functions: `blockId()`, `sigExprId()`, `valueSlot()`

**Files affected:**
- `src/__tests__/PatchStore.test.ts`
- `src/__tests__/SelectionStore.test.ts`
- `src/__tests__/expression-blocks.test.ts`

## Work Items

### P0: Replace BlockId 'as any' casts
**Confidence:** HIGH
**Acceptance Criteria:**
- [ ] All `'b0' as any` replaced with `blockId('b0')`
- [ ] All `'b1' as any` replaced with `blockId('b1')`
- [ ] Pattern applied consistently across all three files
- [ ] Tests pass without regressions

**Technical Notes:**
- `blockId()` is already exported from `src/types/index.ts`
- Simple mechanical find-and-replace pattern
- No logic changes required

### P1: Replace SigExprId/ValueSlot 'as any' casts
**Confidence:** HIGH
**Acceptance Criteria:**
- [ ] All `0 as any` casts for SigExprId replaced with `sigExprId(0)`
- [ ] All numeric casts for ValueSlot replaced with `valueSlot(n)`
- [ ] Verify correct factory function is imported in each file
- [ ] Tests pass without regressions

**Technical Notes:**
- `sigExprId()` and `valueSlot()` are exported from `src/compiler/ir/Indices.ts`
- Identify context to determine which factory to use (check variable type hints)
- Each file may need imports added

## Dependencies

- None - these are mechanical replacements using existing functions

## Risks

- **Low:** All factory functions already exist and are tested in production code
- **Mitigation:** Run tests after each file to catch any missed patterns

## Implementation Sequence

1. Update PatchStore.test.ts
2. Update SelectionStore.test.ts
3. Update expression-blocks.test.ts
4. Run test suite to verify no regressions
