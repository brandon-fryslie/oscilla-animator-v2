# Definition of Done - Remove v1 RenderPassIR Code Path

**Task ID**: oscilla-animator-v2-ry2
**Date Created**: 2026-01-25
**Status**: Ready for Implementation

---

## Acceptance Criteria (MUST ALL PASS)

### Code Deletion Criteria

- [ ] **No `ShapeDescriptor` interface exists** in codebase
  - Verification: `grep -r "interface ShapeDescriptor" src/` returns no results

- [ ] **No `ResolvedShape` interface exists** in codebase
  - Verification: `grep -r "interface ResolvedShape" src/` returns no results

- [ ] **No `isShapeDescriptor()` function exists** in codebase
  - Verification: `grep -r "function isShapeDescriptor" src/` returns no results

- [ ] **No `resolveShapeFully()` function exists** in codebase
  - Verification: `grep -r "function resolveShapeFully" src/` returns no results

- [ ] **No references to removed code remain** (except in git history)
  - Verification: `grep -r "ShapeDescriptor\|ResolvedShape\|resolveShapeFully\|isShapeDescriptor" src/` returns no results in functional code

### Build & Type Safety Criteria

- [ ] **Type check passes without errors**
  ```bash
  npm run typecheck
  # Expected: No errors
  ```

- [ ] **Build succeeds without errors or warnings**
  ```bash
  npm run build
  # Expected: Build completes successfully
  ```

- [ ] **All tests pass**
  ```bash
  npm run test
  # Expected: All tests pass (no failures, no skips related to this change)
  ```

- [ ] **No new TypeScript errors introduced**
  - Verification: Run typecheck before/after and diff results

### Runtime Verification Criteria

- [ ] **Dev environment loads without errors**
  ```bash
  npm run dev
  # Expected: Server starts on port 5174, no console errors
  ```

- [ ] **Graph editor renders correctly**
  - Load a test graph in the UI
  - Verify shapes render correctly (circles, paths, etc.)
  - Verify animations play without visual glitches

- [ ] **No console errors or warnings**
  - Open Chrome DevTools console
  - Verify no errors related to rendering, shape resolution, or RenderPassIR
  - Verify no warnings about deprecated code paths

- [ ] **Render output is identical to before changes**
  - Load same graph before and after changes
  - Verify visual output is pixel-perfect identical
  - Verify no rendering artifacts or glitches

### Code Quality Criteria

- [ ] **Commit message is clear and descriptive**
  ```
  Example: "chore: Remove v1 RenderPassIR helper code

  - Remove ShapeDescriptor interface (internal helper)
  - Remove ResolvedShape interface (internal helper)
  - Remove resolveShapeFully() function (replaced by v2)
  - Remove isShapeDescriptor() type guard (replaced by v2)

  These were internal implementation details that have been fully replaced by the v2 rendering pipeline. No functional code depends on these helpers.

  Closes oscilla-animator-v2-ry2"
  ```

- [ ] **Only one commit created** (no merge commits, no fixup commits)
  - Verification: `git log --oneline -5` shows clean history

- [ ] **No unrelated changes in commit**
  - Verification: Review full diff to ensure only v1 code removal

- [ ] **Git diff is clean and focused**
  - Only deletions (no additions to work around removed code)
  - No formatting changes unrelated to deletion
  - No changes to unrelated files

### Documentation Criteria

- [ ] **Planning documents are complete**
  - [ ] PLAN.md exists and is comprehensive
  - [ ] CONTEXT.md explains architectural rationale
  - [ ] DOD.md (this file) is complete

- [ ] **No orphaned test comments remain**
  - Verification: `grep -r "v1 render\|RenderPassIR\|ShapeDescriptor" src/**/*.test.ts` returns no v1 references

- [ ] **Code comments are updated** (if any referenced v1)
  - Remove: "// TODO: remove v1 render code"
  - Remove: "// v1 compatibility helper"
  - Update: Comments about shape resolution to reference v2 only

### Task Management Criteria

- [ ] **Task is marked complete in beads**
  ```bash
  bd close oscilla-animator-v2-ry2 --reason "Completed: Removed v1 RenderPassIR helper code"
  ```

- [ ] **Related planning documents are cleaned up**
  - Archive or delete: `.agent_planning/v1-render-removal/` (if it exists)
  - Keep: `.agent_planning/remove-v1-renderpassir/` (completion documentation)

---

## Verification Checklist

### Before You Start

- [ ] Read PLAN.md completely
- [ ] Read CONTEXT.md completely
- [ ] Understand what code will be deleted and why
- [ ] Verify current system is working (run `npm run test && npm run build`)

### During Implementation

- [ ] Create new branch or checkout existing task branch
- [ ] Identify exact lines to delete in RenderAssembler.ts
- [ ] Verify each helper is NOT exported in index.ts files
- [ ] Delete each helper one at a time, running type check after each
- [ ] Test after each deletion to catch any breakage immediately

### After Implementation

- [ ] Run full type check: `npm run typecheck`
- [ ] Run full test suite: `npm run test`
- [ ] Run build: `npm run build`
- [ ] Start dev server: `npm run dev`
- [ ] Manually test rendering (load a graph, verify it renders)
- [ ] Verify console has no errors
- [ ] Review git diff before committing
- [ ] Create one clean commit with descriptive message
- [ ] Push to branch
- [ ] Mark task complete in beads

---

## Sign-Off Criteria

Task is DONE when:

✅ All acceptance criteria checked
✅ All verification steps completed
✅ All tests passing
✅ Build succeeding
✅ No new warnings or errors
✅ Commit pushed
✅ Task marked complete in beads

---

## If You Get Stuck

### Problem: "Cannot find name 'ShapeDescriptor'"

**Cause**: Some code was still using the deleted type
**Solution**:
1. Run typecheck to see which file references it
2. Determine if it's legitimate usage (unlikely) or if you deleted too much
3. Check git diff to see what was deleted
4. The solution is usually to refactor that code to use v2 types instead

### Problem: "Test failures after deletion"

**Cause**: A test was implicitly depending on the deleted code
**Solution**:
1. Run `npm run test` to see which test failed
2. Read the test to understand what it's checking
3. Determine if test should:
   - Be updated to use v2 types instead
   - Be deleted (if it was testing v1 code path only)
   - Be refactored (if legitimate test with wrong assumptions)

### Problem: "Build fails after deletion"

**Cause**: Same as test failures, but during build
**Solution**:
1. Check error message for what failed to resolve
2. Find the file importing the deleted code
3. Refactor to use v2 types
4. Re-run build

### Problem: "Rendering broken after changes"

**Cause**: Unlikely, but possible if v2 code depends on deleted helpers
**Solution**:
1. Verify v2 code doesn't call deleted helpers (check RenderAssembler.ts)
2. If you accidentally deleted v2 code, restore it from git
3. More likely: You deleted the wrong code. Check line numbers carefully.

---

## Success Indicators

✅ You know you're done when:

1. **Type check is clean**: `npm run typecheck` produces no errors
2. **Tests pass**: `npm run test` shows all tests passing
3. **Build succeeds**: `npm run build` completes with no warnings
4. **Dev environment loads**: `npm run dev` starts cleanly, no errors
5. **Rendering works**: Load a graph and verify it displays correctly
6. **Console is clean**: Open DevTools, no render-related errors
7. **Git is clean**: One commit with clear message, ready to push
8. **Task is closed**: `bd close oscilla-animator-v2-ry2`

---

## Time Box

**Expected duration**: ~30 minutes
- Verification: 5-10 min
- Deletion: 5-10 min
- Testing: 10-15 min

**If taking longer than 1 hour**: Stop and ask for help. Something unexpected is happening.

