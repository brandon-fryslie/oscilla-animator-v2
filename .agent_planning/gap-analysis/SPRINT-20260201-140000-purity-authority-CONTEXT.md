# Implementation Context: Purity & Authority Hardening

Generated: 2026-02-01T14:00:00Z
Source: EVALUATION-20260201-120000.md, ChatGPT review feedback

## 1. isTypeCompatible — Current Code

**File:** `src/compiler/frontend/analyze-type-graph.ts:55-100`

```typescript
function isTypeCompatible(
  from: CanonicalType,
  to: CanonicalType,
  sourceBlockType?: string,   // ← DELETE
  targetBlockType?: string    // ← DELETE
): boolean {
  // ... pure type checks ...

  // ❌ Lines 79-86: Block-name exception for cardinality-generic blocks
  if (targetBlockType) {
    const meta = getBlockCardinalityMetadata(targetBlockType);
    if (meta && isCardinalityGeneric(targetBlockType)) {
      if (meta.broadcastPolicy === 'allowZipSig' || ...) {
        return true; // DELETE THIS
      }
    }
  }

  // ❌ Lines 88-97: Block-name exception for cardinality-preserving blocks
  if (fromCard.kind === 'one' && toCard.kind === 'many' && sourceBlockType) {
    const sourceMeta = getBlockCardinalityMetadata(sourceBlockType);
    if (sourceMeta?.cardinalityMode === 'preserve') {
      return true; // DELETE THIS
    }
  }
}
```

### Callers to update
Search for `isTypeCompatible(` in `src/compiler/frontend/` to find all call sites. Each must drop the 3rd and 4th arguments.

### Imports to remove
After deleting block-name logic, remove imports of:
- `getBlockCardinalityMetadata`
- `isCardinalityGeneric`
- Any block registry imports

## 2. Backend Type Rewriting — Current Code

**File:** `src/compiler/backend/lower-blocks.ts:411-428`

```typescript
// ❌ DELETE THIS ENTIRE BLOCK
if (inferredInstance) {
  const instanceDecl = builder.getInstances().get(inferredInstance);
  if (instanceDecl) {
    const ref = makeInstanceRef(instanceDecl.domainType as string, inferredInstance as string);
    outTypes = outTypes.map(t => {
      const card = t.extent.cardinality;
      if (card.kind === 'inst' && card.value.kind === 'many') {
        return withInstance(t, ref);
      }
      return t;
    });
  }
}
```

### What to keep
The `outTypes` variable declaration and its initial assignment from `portTypes` is correct -- keep that. Only delete the mutation block.

### Import cleanup
After deletion, check if `withInstance`, `makeInstanceRef` are still needed in this file. Remove unused imports.

## 3. Enforcement Test Locations

**Existing enforcement tests:**
- `src/__tests__/forbidden-patterns.test.ts` — add new boundary tests here
- `src/compiler/__tests__/no-legacy-types.test.ts` — existing legacy checks
- `src/compiler/__tests__/no-legacy-kind-dispatch.test.ts` — existing dispatch checks

**Recommended: add to `forbidden-patterns.test.ts`** since it already does grep-based enforcement.

## 4. Backup Files to Delete

```
src/compiler/ir/types.ts.bak
src/compiler/ir/types.ts.backup2
src/ui/components/BlockInspector.tsx.patch
src/runtime/__tests__/FieldKernels-placement.test.ts.bak
src/runtime/__tests__/PlacementBasis.test.ts.bak
src/compiler/ir/__tests__/bridges.test.ts.bak
```

## 5. instanceId Threshold

**File:** `src/__tests__/forbidden-patterns.test.ts` (around line 89)

Current threshold: `<= 12`
Actual count: 6 (all on Step types, not expressions)

Option A: Lower threshold to 6
Option B: Rewrite test to check only expression types and assert zero instanceId there

Option B is preferable (tests behavior not count).

## 6. Expected Regressions

After removing impurities, these scenarios may break:

| Scenario | Why | Sprint 2 Fix |
|----------|-----|-------------|
| Signal feeding into cardinality-generic block (Mul, Add) alongside field input | `isTypeCompatible` no longer special-cases cardinality-generic blocks | Frontend solver introduces cardinality constraint variables |
| Block with inferred instance producing output used downstream | Backend no longer rewrites output types with instance ref | Frontend solver resolves instance refs during Pass 1/2 |

These are correct rejections -- the old code was hiding real type mismatches behind block-name exceptions.
