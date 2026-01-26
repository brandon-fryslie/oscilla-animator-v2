# Remove v1 RenderPassIR Code Path - Implementation Plan

**Task ID**: oscilla-animator-v2-ry2
**Priority**: 4 (Low/Backlog)
**Type**: Chore (cleanup)
**Status**: Ready for Implementation
**Created**: 2026-01-25

---

## Objective

Remove remaining v1 RenderPassIR-related code and internal helper types from the codebase. The v2 rendering pipeline is complete and active; this task completes the migration by deleting dead code and internal helpers that are no longer needed.

---

## Current State

**Migration Status**: ~95% complete

**What's already done**:
- ✅ V2 types fully defined (DrawPathInstancesOp, RenderFrameIR v2)
- ✅ V2 assembly functions implemented and working
- ✅ V2 renderer implemented (Canvas2DRenderer)
- ✅ All render steps use v2 path
- ✅ Tests updated to use v2 types
- ✅ No v1 RenderPassIR references in production code paths

**What remains**:
- ❌ Internal helper types still present but unused: `ShapeDescriptor`, `ResolvedShape`
- ❌ Internal helper functions: `resolveShapeFully()`, `isShapeDescriptor()`
- ❌ Comments/documentation referencing v1 render system
- ❌ Any lingering references in test comments

---

## Files to Modify

### 1. `src/runtime/RenderAssembler.ts` (PRIMARY)

**Location of v1 helper code**:
- Lines ~95-98: `interface ShapeDescriptor` - Type guard for shape resolution
- Lines ~104-111: `interface ResolvedShape` - Internal shape resolution helper
- Lines ~464: `function isShapeDescriptor()` - Type guard (used internally)
- Lines ~482-528: `function resolveShapeFully()` - Shape resolution (used internally)

**Status**: These are **internal implementation details only**, not exported or used externally.

**Action**:
1. ✅ **Verify** these helpers are NOT exported in `src/runtime/index.ts`
2. ✅ **Search** codebase for any external usage (should find none)
3. ❌ **Delete** `ShapeDescriptor` interface (lines ~95-98)
4. ❌ **Delete** `ResolvedShape` interface (lines ~104-111)
5. ❌ **Delete** `isShapeDescriptor()` function (lines ~464)
6. ❌ **Delete** `resolveShapeFully()` function (lines ~482-528)
7. ⚠️ **Check**: If any of these were used internally by v2 assembly code, inline or create v2-specific helpers instead

---

### 2. `src/render/types.ts`

**Status**: Already v2-only, no changes needed

**Verification**:
- ✅ Confirm no `RenderPassIR` type exists
- ✅ Confirm `RenderFrameIR` is version 2
- ✅ DrawPathInstancesOp is the primary draw op

---

### 3. `src/runtime/ScheduleExecutor.ts`

**Status**: Already v2-only, no changes needed

**Verification**:
- ✅ Confirm `executeFrame()` returns RenderFrameIR version 2
- ✅ Confirm no v1 render assembly code exists

---

### 4. `src/render/canvas/Canvas2DRenderer.ts`

**Status**: Already v2-only, no changes needed

**Verification**:
- ✅ Confirm `renderFrame()` accepts only v2 RenderFrameIR
- ✅ Confirm only v2 draw op types are supported

---

### 5. Tests and Documentation

**Search for remaining references**:
- `src/projection/__tests__/level8-backend-contract.test.ts` - May have v1 test comments
- Any `.md` files in `.agent_planning/` with v1 references
- Any `// TODO: remove v1` or similar comments

**Action**:
1. ✅ **Search** codebase for "RenderPassIR", "v1 render", "assembleRenderPass"
2. ❌ **Remove** any test scaffolding or placeholder tests that reference v1
3. ❌ **Update** comments to reference v2 system only
4. ❌ **Delete** any planning documents marked as "v1-removal" or "for cleanup"

---

## Implementation Steps

### Phase 1: Safety Verification (Pre-Deletion)

1. **Search for all references**:
   ```bash
   # Find any remaining v1 render code
   grep -r "RenderPassIR" src/
   grep -r "resolveShapeFully" src/
   grep -r "isShapeDescriptor" src/
   grep -r "ShapeDescriptor" src/
   grep -r "ResolvedShape" src/
   ```

2. **Verify exports**:
   - Check `src/runtime/index.ts` - confirm these helpers are NOT exported
   - Check `src/index.ts` - confirm no v1 render types are exported

3. **Run type check**:
   ```bash
   npm run typecheck
   ```

4. **Run tests**:
   ```bash
   npm run test
   ```

### Phase 2: Code Deletion

1. **Delete from RenderAssembler.ts**:
   - Remove `ShapeDescriptor` interface
   - Remove `ResolvedShape` interface
   - Remove `isShapeDescriptor()` function
   - Remove `resolveShapeFully()` function

2. **Update RenderAssembler.ts**:
   - Check if shape resolution is still needed for v2 assembly
   - If helpers were used, refactor to use v2 types directly
   - Add TypeScript comment: `// v1 helper code removed per oscilla-animator-v2-ry2`

3. **Clean up any lingering v1 references**:
   - Remove test comments referencing v1
   - Remove planning documents from `.agent_planning/v1-render-removal/`

### Phase 3: Verification

1. **Type check**:
   ```bash
   npm run typecheck
   ```
   - Should pass with no errors

2. **Run tests**:
   ```bash
   npm run test
   ```
   - All tests should pass
   - No test failures related to shape resolution

3. **Build**:
   ```bash
   npm run build
   ```
   - Should complete successfully

4. **Manual verification**:
   - Open dev environment: `npm run dev`
   - Load a graph
   - Verify rendering works (shapes display correctly)
   - Check console for any errors

---

## Acceptance Criteria

✅ **Definition of Done**:

1. No `ShapeDescriptor` type exists in codebase
2. No `ResolvedShape` type exists in codebase
3. No `isShapeDescriptor()` function exists
4. No `resolveShapeFully()` function exists
5. No "v1 render" or "RenderPassIR" references in functional code
6. Type check passes: `npm run typecheck`
7. All tests pass: `npm run test`
8. Build succeeds: `npm run build`
9. Dev environment loads and renders correctly: `npm run dev`
10. No console errors or warnings related to render system
11. Git history is clean (one commit with clear message)

---

## Risk Assessment

**Risk Level**: Low

**Rationale**:
- Code being deleted is internal helper code only
- Not exported or used externally
- Already replaced by v2 implementation
- Comprehensive test suite will catch any issues
- No architectural impact

**Mitigations**:
1. Run full type check before deletion
2. Run full test suite before deletion
3. Manual rendering verification after deletion
4. One-command rollback available if needed

---

## Time Estimate

- Phase 1 (verification): 5-10 minutes
- Phase 2 (deletion): 5-10 minutes
- Phase 3 (verification): 10-15 minutes

**Total**: ~30 minutes

---

## Dependencies

**Blocked by**: None (unblocked as of 2026-01-25)

**Blocks**: None

**Related tasks**:
- oscilla-animator-v2-8m2: Domain Transformation System (Adapters) - Independent
- oscilla-animator-v2-3zd: Track unit for floats in Expression DSL - Independent

---

## Notes

- This is a pure cleanup task with no new functionality
- Safe to delete as long as v2 is fully functional (verified)
- No performance impact
- Improves codebase clarity by removing dead code
- Good opportunity to verify render system is working correctly

---

## Sign-Off

**Task**: Remove v1 RenderPassIR code path
**Prepared by**: Claude Code
**Date**: 2026-01-25
**Status**: Ready for implementation

