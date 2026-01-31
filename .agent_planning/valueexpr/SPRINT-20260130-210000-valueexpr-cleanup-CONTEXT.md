# Implementation Context: valueexpr-cleanup

Generated: 2026-01-30T21:00:00
Confidence: HIGH
Source: EVALUATION-20260130-203000.md
Plan: SPRINT-20260130-210000-valueexpr-cleanup-PLAN.md

## WI-1: ValueExprId Duplication Fix

### Files to Modify

**`src/compiler/ir/value-expr.ts` (lines 34-39)**
Remove:
```typescript
export type ValueExprId = number & { readonly __brand: 'ValueExprId' };
export function valueExprId(n: number): ValueExprId {
  return n as ValueExprId;
}
```
Replace with:
```typescript
export type { ValueExprId } from './Indices';
export { valueExprId } from './Indices';
```

**`src/compiler/ir/Indices.ts` (lines 44-46, 124-126)** -- NO CHANGES NEEDED.
Already has both the type (line 45) and factory (line 124). This is the canonical location.

### Imports to verify
- `src/compiler/ir/__tests__/value-expr-invariants.test.ts` line 20: imports from `../value-expr` -- will still work via re-export
- No production files import `ValueExprId` (confirmed by evaluation)

### Verification command
```bash
grep -rn "type ValueExprId" src/ --include="*.ts" | grep -v "node_modules" | grep -v "__tests__"
```
Expected: 1 match in `Indices.ts` plus 1 re-export in `value-expr.ts`

---

## WI-2: Dead Code Cleanup

### Files to Modify

**`src/core/canonical-types.ts` (lines 815-867)**
Delete these 6 functions entirely:
- `requireSignalType` (lines 815-820)
- `requireFieldType` (lines 826-832)
- `requireEventType` (lines 838-843)
- `isSignalType` (lines 848-851)
- `isFieldType` (lines 856-859)
- `isEventType` (lines 864-867)

Also assess `tryDeriveKind` -- if its only callers are the `is*Type` functions above, delete it too.
Also assess `deriveKind` -- if its only callers are the `require*Type` functions above plus `tryDeriveKind`, consider deleting or un-exporting.

**Check `deriveKind` callers before deletion:**
```bash
grep -rn "deriveKind\|tryDeriveKind" src/ --include="*.ts" | grep -v node_modules | grep -v ".bak"
```

**`src/compiler/__tests__/no-deriveKind-imports.test.ts`**
This test verifies no production code imports `deriveKind`. After deleting the functions:
- If the test imports `deriveKind` to check it exists, update the test
- If the test only greps import statements, it should still pass

### Adjacent code pattern
The existing `assertKindAgreement` in `src/compiler/ir/lowerTypes.ts:75` shows the correct pattern: direct axis dispatch via `requireInst()` instead of `deriveKind()`. This is the model to follow if any replacement logic is needed (none expected).

### Verification command
```bash
grep -rn "requireSignalType\|requireFieldType\|requireEventType\|isSignalType\|isFieldType\|isEventType\|tryDeriveKind" src/ --include="*.ts"
```
Expected: 0 matches after deletion.

---

## WI-3: Delete bridges.ts.bak

### File to Delete
`src/compiler/ir/bridges.ts.bak`

### Verification
```bash
ls src/compiler/ir/bridges.ts.bak  # should fail (file not found)
```

---

## WI-4: Strengthen Invariant Test Exhaustiveness

### File to Modify

**`src/compiler/ir/__tests__/value-expr-invariants.test.ts` (lines 28-52)**

Current fragile pattern (lines 45-52):
```typescript
it('exhaustive kind check: every ValueExpr kind maps to one variant', () => {
  for (const kind of EXPECTED_KINDS) {
    const mockExpr = { kind } as ValueExpr;  // <-- cast, not narrowing
    expect(mockExpr.kind).toBe(kind);
  }
});
```

Replace with compile-time exhaustiveness. Add AFTER the `EXPECTED_KINDS` declaration (around line 38):

```typescript
// Compile-time exhaustiveness: if ValueExpr gains a kind not in EXPECTED_KINDS,
// or EXPECTED_KINDS lists a kind not in ValueExpr, this produces a TS error.
type _MissingFromArray = Exclude<ValueExpr['kind'], typeof EXPECTED_KINDS[number]>;
type _ExtraInArray = Exclude<typeof EXPECTED_KINDS[number], ValueExpr['kind']>;
type _AssertNever<T extends never> = T;
type _CheckMissing = _AssertNever<_MissingFromArray>;
type _CheckExtra = _AssertNever<_ExtraInArray>;
```

Then simplify the runtime test to just verify the count (the compile-time check handles correctness):
```typescript
it('exhaustive kind check: EXPECTED_KINDS matches ValueExpr union', () => {
  // Compile-time types above enforce bidirectional coverage.
  // Runtime check verifies the count is still 9.
  expect(EXPECTED_KINDS.length).toBe(9);
});
```

### Verification
Add a temporary kind to `ValueExpr` union (e.g., `| { kind: 'test'; type: CanonicalType }`) and run `npx tsc --noEmit`. Expected: compile error on `_CheckMissing`. Remove the temporary kind afterward.
