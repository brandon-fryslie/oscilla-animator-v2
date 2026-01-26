# Revised Findings: V1 Cleanup Work

**Original Task**: oscilla-animator-v2-ry2 - "Remove v1 RenderPassIR code path"
**Status**: REFOCUSED based on comprehensive codebase audit
**Date**: 2026-01-25

---

## What the Audit Found

### Original Assumption (INCORRECT)
"ShapeDescriptor, ResolvedShape, resolveShapeFully, isShapeDescriptor are v1 remnants that can be deleted."

### Actual Finding (CORRECT)
These are **essential v2 infrastructure** - they bridge shape resolution between compile-time and runtime:
- `resolveShapeFully()` is actively called in uniform shape rendering path (line 1179)
- `ResolvedShape` is used to pass resolved topology info to geometry builders
- These are necessary, not migration scaffolding

### Implication
**Cannot delete these functions as originally planned.**

---

## What We Should Actually Do

Based on the comprehensive audit, here's the real cleanup work:

### Priority 1: Delete Dead Code (TRIVIAL RISK)

#### 1.1 ExtrudeLite Rendering System
- **Files**:
  - `src/render/canvas/ExtrudeLite.ts`
  - `src/render/canvas/canvas2dDrawExtrudeLite.ts`
- **What**: v1-era 3D polygon extrusion effect (never called)
- **Complexity**: TRIVIAL
- **Risk**: NONE (completely unused)
- **Action**: DELETE both files

#### 1.2 Experimental UI Variants
- **Files**: `src/ui/components/BlockInspector.tsx.ui1` through `.ui6`
- **What**: UI iteration snapshots (designer exploring layout options)
- **Complexity**: TRIVIAL
- **Risk**: NONE (dead code)
- **Action**: DELETE all 6 files

#### 1.3 Backup/Snapshot Files
- **Files**:
  - `src/graph/Patch.ts.bkp4`
  - `src/graph/passes/pass2-adapters.ts.bkp`
  - `src/runtime/RenderAssembler.test.ts.bak`
- **What**: Old manual backups (should be in git, not filesystem)
- **Complexity**: TRIVIAL
- **Risk**: NONE (git has history)
- **Action**: DELETE all 3 files

**Subtotal**: 11 files, ~100KB of dead code removed

---

### Priority 2: Reduce Duplication (LOW RISK, HIGH PAYOFF)

#### 2.1 Extract Field Broadcaster Pattern
- **Current state**: Every arithmetic block (Add, Subtract, Multiply, Divide, etc.) duplicates the same signal→field broadcast logic (~40 LOC repeated)
- **Pattern**:
  ```typescript
  let aField: FieldExprId;
  if (a.k === 'field') {
    aField = a.id;
  } else if (a.k === 'sig') {
    aField = ctx.b.Broadcast(a.id, signalTypeField('float', 'default'));
  } else {
    throw new Error(...);
  }
  // ... repeat for b, c, etc.
  ```
- **Solution**: Create helper function:
  ```typescript
  function resolveFieldInputs(
    inputs: Record<string, ExprType>,
    ctx: BlockLoweringContext
  ): Record<string, FieldExprId> {
    // Centralized broadcaster logic
  }
  ```
- **Complexity**: LOW (extraction + testing)
- **Risk**: LOW (pure refactor, no behavior change)
- **Payoff**: HIGH (~40 LOC removed, blocks become cleaner)
- **Files affected**: `src/blocks/math-blocks.ts`, `src/blocks/geometry-blocks.ts`, `src/blocks/field-operations-blocks.ts`
- **Action**: Create helper, refactor 4 arithmetic blocks, test

#### 2.2 Extract Canvas Style Helpers
- **Current state**: Canvas2DRenderer repeats fill/stroke color setup code in two functions
- **Duplication**: ~8 LOC (color resolution for both uniform and per-instance paths)
- **Solution**: Extract `applyFillStyle()` and `applyStrokeStyle()` helpers
- **Complexity**: TRIVIAL
- **Risk**: VERY LOW
- **Payoff**: MEDIUM (cleaner code, better maintainability)
- **Files affected**: `src/render/canvas/Canvas2DRenderer.ts`
- **Action**: Extract 2 helper functions, apply to both ops

---

### Priority 3: Housekeeping (DOCUMENTATION)

#### 3.1 Add Expiration Dates to Deprecations
- **Current state**: `@deprecated` markers lack sunset dates
- **Code**:
  - `createRuntimeState()` - marked deprecated but no expiry
  - `getStateSlots()` - marked deprecated but no expiry
  - `NumericUnit` type - marked deprecated but no expiry
- **Action**: Add: `@deprecated as of v2.6, remove by v3.0` (or appropriate version)
- **Complexity**: TRIVIAL (comments only)
- **Files affected**: `src/runtime/RuntimeState.ts`, `src/compiler/ir/IRBuilderImpl.ts`, `src/core/canonical-types.ts`

#### 3.2 Audit Internal Call Sites
- **Current state**: Core code may still use old APIs internally
- **Action**: Search for internal usage of `createRuntimeState()`, `getStateSlots()`, migrate to new patterns
- **Complexity**: LOW (depends on usage count)
- **Payoff**: Ensure new code patterns are adopted

---

## What NOT to Change

- ✅ Signal vs. Field dual paths in blocks - Spec-driven design, not scaffolding
- ✅ RenderAssembler shape resolution helpers - Essential v2 infrastructure
- ✅ Pooled buffers - Performance optimization, not scaffolding
- ✅ normalize.ts shim - Good deprecation pattern
- ✅ Block migrations registry - Infrastructure for backward compatibility

---

## Revised Task Breakdown

### Task 1: Delete Dead Code (oscilla-animator-v2-ry2-cleanup-1)
- Delete ExtrudeLite files
- Delete UI variant files
- Delete backup files
- ~30 minutes
- Risk: NONE

### Task 2: Extract Field Broadcaster Helper (new task)
- Create helper function in `src/blocks/field-expression-helpers.ts`
- Refactor Add, Subtract, Multiply, Divide blocks
- Test each refactored block
- ~2 hours
- Risk: LOW
- Payoff: HIGH

### Task 3: Extract Canvas Style Helpers (new task)
- Create helpers in Canvas2DRenderer
- Refactor renderDrawPathInstancesOp and renderDrawPrimitiveInstancesOp
- Test rendering
- ~30 minutes
- Risk: VERY LOW
- Payoff: MEDIUM

### Task 4: Add Deprecation Expiration Dates (new task)
- Update @deprecated markers with sunset versions
- Audit internal call sites
- ~30 minutes
- Risk: NONE
- Payoff: MEDIUM (process improvement)

---

## Conclusion

The original task (oscilla-animator-v2-ry2) cannot be completed as written because its assumptions were incorrect. However, the comprehensive audit revealed **legitimate cleanup work** that should be done:

1. **Delete 11 dead/experimental files** (trivial risk, immediate payoff)
2. **Extract 2-3 helper functions** (reduce duplication, improve maintainability)
3. **Add deprecation metadata** (housekeeping, process improvement)

The codebase is architecturally sound. The migration from v1 to v2 was executed cleanly. No major refactoring is needed.

---

## Recommendation

**Resolve the original task (oscilla-animator-v2-ry2) as "Cannot Complete - Planning Based on Incorrect Assumptions"**, and create 4 new focused tasks for the actual cleanup work identified by the audit.

Or, if preferred: **Repurpose oscilla-animator-v2-ry2** to focus on the legitimate cleanup work (delete dead code, extract helpers) rather than deleting essential v2 infrastructure.

