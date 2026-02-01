# SUPERSEDED — See SPRINT-20260201-140000-purity-authority-CONTEXT.md
# Implementation Context: Housekeeping

Generated: 2026-02-01T12:00:00Z
Source: EVALUATION-20260201-120000.md
Confidence: HIGH

## 1. Delete Backup Files

### Files to delete (absolute paths)
```
/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/types.ts.bak
/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/types.ts.backup2
/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/__tests__/bridges.test.ts.bak
/Users/bmf/code/oscilla-animator-v2/src/runtime/__tests__/FieldKernels-placement.test.ts.bak
/Users/bmf/code/oscilla-animator-v2/src/runtime/__tests__/PlacementBasis.test.ts.bak
/Users/bmf/code/oscilla-animator-v2/src/runtime/__tests__/PlacementBasis.test.ts.bak2
/Users/bmf/code/oscilla-animator-v2/src/ui/components/BlockInspector.tsx.patch
```

### Verification command
```bash
find src/ -name '*.bak' -o -name '*.bak2' -o -name '*.backup*' -o -name '*.patch' | wc -l
# Should return 0
```

---

## 2. Enforcement Tests

### Target file
Create new test file: `src/compiler/__tests__/type-system-enforcement.test.ts`

Alternatively, add to existing: `src/compiler/__tests__/no-legacy-types.test.ts`

### Pattern to follow
Existing enforcement test in `src/compiler/__tests__/no-legacy-types.test.ts` uses this pattern:
```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('legacy type enforcement', () => {
  it('no production code references SigExpr/FieldExpr/EventExpr types', () => {
    const srcDir = path.resolve(__dirname, '../..');
    // execSync grep, filter comments, assert zero matches
  });
});
```

### isTypeCompatible Purity Test

**File to grep**: `src/compiler/frontend/analyze-type-graph.ts`
**Current violating line (line 55)**:
```typescript
function isTypeCompatible(from: CanonicalType, to: CanonicalType, sourceBlockType?: string, targetBlockType?: string): boolean {
```

**Test logic**:
```typescript
it.skip('isTypeCompatible signature must be pure (2 params only)', () => {
  // SKIP: Will pass after Sprint B removes block-name params (SUMMARY.md P1 #1)
  const file = path.resolve(__dirname, '../frontend/analyze-type-graph.ts');
  const content = fs.readFileSync(file, 'utf-8');
  // Check that isTypeCompatible does NOT have sourceBlockType or targetBlockType params
  const matches = content.match(/isTypeCompatible\([^)]*(?:sourceBlockType|targetBlockType)[^)]*\)/g);
  expect(matches).toBeNull();
});
```

### Backend Read-Only Contract Test

**File to grep**: `src/compiler/backend/lower-blocks.ts`
**Current violating lines (411-428)**: Calls `withInstance()` to rewrite types
**Current violating import (line 15)**: `import { ..., withInstance, instanceRef as makeInstanceRef, ... } from "../../core/canonical-types";`

**Test logic**:
```typescript
it.skip('backend must not call withInstance to rewrite types', () => {
  // SKIP: Will pass after Sprint C moves instance resolution to frontend (SUMMARY.md P1 #2)
  const file = path.resolve(__dirname, '../backend/lower-blocks.ts');
  const content = fs.readFileSync(file, 'utf-8');
  // Filter out comments
  const codeLines = content.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
  const code = codeLines.join('\n');
  const matches = code.match(/withInstance\(/g);
  expect(matches).toBeNull();
});
```

---

## 3. instanceId Enforcement Threshold

### File to review
`/Users/bmf/code/oscilla-animator-v2/src/compiler/__tests__/instance-unification.test.ts`

Current test structure (first 50 lines read): Tests use `requireManyInstance(expr.type)` to extract instance IDs. No explicit numeric threshold found in the visible portion.

**Action**: Read the full file. If there are any count/threshold assertions, tighten them. If not, consider adding one that counts the number of places `instanceId` appears as a standalone field (not derived from type) in production code.

---

## 4. ExpressionCompileError Rename

### File to modify
`/Users/bmf/code/oscilla-animator-v2/src/expr/index.ts`

### Lines to change
- **Line 35**: `export interface ExpressionCompileError {` -> `export interface ExprCompileError {`
- **Line 47**: `| { ok: false; error: ExpressionCompileError };` -> `| { ok: false; error: ExprCompileError };`
- **Line 102**: Comment references `ExpressionCompileError` -> update comment

### Verification
```bash
grep -r "ExpressionCompileError" src/ --include="*.ts" --include="*.tsx"
# Should return 0 matches after rename
```

No external consumers of this type outside `src/expr/index.ts` (only 3 occurrences, all in that file).
