# Gap Analysis: Naming Conventions & Legacy Type Cleanup - TRIVIAL

## Summary
Items that require minimal effort to fix - mostly cleanup of backup files and minor naming inconsistencies.

---

## T1: Backup Files Should Be Deleted

**Location**: `src/compiler/ir/` and other directories

**Issue**: Multiple `.bak`, `.backup2`, and `.patch` files exist in the codebase:
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/types.ts.bak` (604 lines)
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/types.ts.backup2` (604 lines)
- `/Users/bmf/code/oscilla-animator-v2/src/ui/components/BlockInspector.tsx.patch`
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/__tests__/FieldKernels-placement.test.ts.bak`
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/__tests__/PlacementBasis.test.ts.bak`
- `/Users/bmf/code/oscilla-analyzer-v2/src/compiler/ir/__tests__/bridges.test.ts.bak`

**Why It Matters**: Per spec 07-DefinitionOfDone-100%.md, migration shims should be quarantined or deleted. These backup files:
1. Inflate repository size
2. Create confusion about which files are canonical
3. May contain outdated legacy code patterns

**Fix**: Delete all backup files. If they contain anything valuable, it's already in git history.

**Effort**: 5 minutes
**Risk**: None (git history preserves everything)

---

## T2: Expression DSL Has Minor "Expression" vs "Expr" Inconsistency

**Location**: `src/expr/index.ts`

**Issue**: The expr DSL uses `ExpressionCompileError` (with "Expression" prefix) while the rest of the codebase standardized on "Expr":
```typescript
export interface ExpressionCompileError {  // ← Uses "Expression"
  readonly code: 'ExprSyntaxError' | 'ExprTypeError' | 'ExprCompileError';
  readonly message: string;
  readonly position?: { start: number; end: number };
  readonly suggestion?: string;
}
```

Meanwhile:
- AST types use `ExprNode` (good)
- The interface is called `ExpressionEditor` in UI (inconsistent)

**Why It Matters**: Per spec 09-NamingConvention.md point 3: "No 'Expr' and 'Expression' both existing - pick one (use Expr)". This is a minor violation in the DSL API.

**Current State**: Only 1 usage of `ExpressionCompileError` and `ExpressionEditor` component name. Everything else uses "Expr".

**Fix**: Rename to `ExprCompileError` and update `ExpressionEditor` to `ExprEditor` for consistency.

**Effort**: 10 minutes (straightforward rename)
**Risk**: Low (API change but internal to project)

---

## Context File
See: topic-naming-legacy-context.md for full search results and evidence.
