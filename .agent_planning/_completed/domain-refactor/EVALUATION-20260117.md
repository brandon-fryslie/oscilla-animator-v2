# Domain Refactor - Evaluation

**Topic**: Domain refactor architecture rework
**Evaluated**: 2026-01-17
**Verdict**: PAUSE - Decisions needed before proceeding

---

## Current State Summary

The domain refactor (Sprints 2-7) implemented a **partially correct** instance-based model but with architectural issues that don't match the three-stage design in CONTEXT.md.

### What Was Built (Current State)

```
[GridLayout] ──layout──▶ [CircleInstance] ──position,radius,index,t──▶ [Render]
     │                         ↑
     │                         │ count: 100
     │                         │
     └── outputs dummy int(0) signal with layoutSpec as metadata (HACK)
```

**CircleInstance** conflates three concerns:
1. Primitive creation (Circle)
2. Array instantiation (count → many elements)
3. Layout application (position computation)

### What Should Have Been Built (from CONTEXT.md)

```
[Circle] ──circle──▶ [Array] ──elements──▶ [Grid Layout] ──position──▶ [Render]
  radius: 0.02        count: 100            rows: 10
                      maxCount: 200         cols: 10
  Signal<circle>      Field<circle>         Field<vec2>
  (ONE)               (MANY)                (positions)
```

---

## Test Status

**30 tests failing / 229 passing**

### Failure Categories

| Category | Count | Cause |
|----------|-------|-------|
| `worldToAxes` not a function | 7 | Function was removed but tests still import it |
| `domainRef` not a function | 4 | Function was removed but tests still import it |
| `getBlockCategories` not a function | 12 | Function was removed but tests still import it |
| Hash Block failures | 3 | Implementation bug (unrelated) |
| Stateful primitives | 4 | Skipped (separate issue) |

### Root Cause

Functions `worldToAxes`, `domainRef`, and `getBlockCategories` were removed from the codebase during domain refactor but:
1. Tests still import and use them
2. The tests themselves weren't updated or deleted

---

## Code Analysis

### What's Correct

1. **InstanceDecl type** - Well-designed in `types.ts`:
   - `id: string`, `domainType: string`, `count: number | 'dynamic'`
   - `layout: LayoutSpec`, `lifecycle: 'static' | 'dynamic' | 'pooled'`

2. **LayoutSpec type** - Comprehensive discriminated union:
   - `unordered`, `grid`, `circular`, `linear`, `random`, `along-path`, `custom`

3. **Field operations** - Clean implementation in `field-operations-blocks.ts`:
   - 18+ blocks using proper field-to-field operations
   - Uses `ctx.inferredInstance ?? ctx.instance` for context

4. **pass7-schedule.ts** - Properly uses `InstanceDecl`

5. **Runtime Materializer** - Instance-aware

### What's Wrong

1. **Layout metadata hack** in `instance-blocks.ts`:
   ```typescript
   // Layout carried as metadata on dummy signal (WRONG)
   const layoutSignal = ctx.b.sigConst(0, canonicalType('int'));
   return { layout: { k: 'sig', id: layoutSignal, metadata: { layoutSpec: layout } } };
   ```

2. **Old DomainDef still present** in `types.ts`:
   ```typescript
   export interface DomainDef {
     readonly id: DomainId;
     readonly kind: 'grid' | 'n' | 'path';  // Layout NOT domain type
     readonly count: number;
     readonly elementIds: readonly string[];
     readonly params: Readonly<Record<string, unknown>>;
   }
   ```
   - Not deprecated, still exported

3. **Removed functions still imported by tests**:
   - `worldToAxes` - removed from `canonical-types.ts`
   - `domainRef` - removed from `canonical-types.ts`
   - `getBlockCategories` - removed from block registry

4. **Old domain methods in IRBuilderImpl**:
   - `createDomain()` still present (deprecated)
   - `getDomains()` returns old map

---

## Sprint 8 Remaining Work

From REWORK-NEEDED.md, these items are NOT done:

- [ ] Delete `DomainDef` in `src/compiler/ir/types.ts`
- [ ] Remove `DomainDef` usage in `IRBuilderImpl.ts`
- [ ] Remove `GridDomain` references in tests
- [ ] Remove `DomainN` references in `main.ts` and tests
- [ ] Remove old domain exports from `src/compiler/index.ts`

---

## Ambiguities Requiring Resolution

### Ambiguity 1: When to Rework Architecture

**Question**: Should we complete Sprint 8 cleanup first, or rework the three-stage architecture now?

**Options**:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| A (Standard) | Complete Sprint 8 cleanup, then do architecture rework in new sprint | Clean separation, tests pass, visible progress | Architecture debt remains, more total work |
| B (Creative) | Rework architecture now before Sprint 8 completion | One-time correct implementation, less total work | More work immediately, tests need major rewrite |

**Recommendation**: Option A. The current implementation is functional if architecturally impure. Complete cleanup first.

### Ambiguity 2: Test Repair Strategy

**Question**: How should we fix the 30 failing tests?

**Options**:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| A (Standard) | Delete tests for removed functions, keep behavior tests | Fast, aligns with "tests assert behavior" principle | Loses some coverage |
| B (Creative) | Implement replacement functions matching new architecture | Maintains coverage | More work, may not match new model |

**Recommendation**: Option A. Tests for `domainRef` and `worldToAxes` are testing old model - delete them.

---

## Verdict: CONTINUE

**User decisions**:
1. **Rework timing**: Rework architecture NOW (Option B) - Don't waste time cleaning up code that will be deleted anyway
2. **Test strategy**: Delete obsolete tests (Option A) - Tests for removed functions should be removed

---

## Files Modified (Git Status)

From `git status`:
- `M .agent_planning/domain-refactor/REWORK-NEEDED.md`
- `M src/blocks/field-operations-blocks.ts`
- `M src/blocks/instance-blocks.ts`
- `M src/compiler/__tests__/compile.test.ts`
- `M src/compiler/__tests__/instance-unification.test.ts`
- `M src/compiler/__tests__/steel-thread.test.ts`
- `M src/core/__tests__/canonical-types.test.ts`
- `M src/runtime/__tests__/integration.test.ts`

---

## Next Steps After Resolution

If Option A (Complete Sprint 8 first):
1. Delete tests for removed `worldToAxes`, `domainRef`, `getBlockCategories`
2. Delete `DomainDef` from types.ts
3. Remove old domain exports
4. Remove deprecated IRBuilder methods
5. Create new sprint for three-stage architecture

If Option B (Rework now):
1. Implement Circle, Array, GridLayout as separate blocks
2. Delete CircleInstance conflated block
3. Rewrite tests for new model
4. Complete cleanup simultaneously
