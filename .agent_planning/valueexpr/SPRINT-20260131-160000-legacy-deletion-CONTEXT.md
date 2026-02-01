# Implementation Context: legacy-deletion
Generated: 2026-01-31T16:00:00Z

## What Gets Deleted

### types.ts Deletions (~260 lines)
Lines to remove from `src/compiler/ir/types.ts`:
- SigExpr union and all 9 variant interfaces (~80 lines)
- FieldExpr union and all 8 variant interfaces (~80 lines)
- EventExpr union and all 5 variant interfaces (~60 lines)
- Any re-export of these types
- Related type aliases (SignalExprTable, FieldExprTable, EventExprTable)

**Keep** in types.ts:
- PureFn, IntrinsicPropertyName, PlacementFieldName, BasisKind
- Step variants (updated to ValueExprId in direct-lowering sprint)
- TimeModel, InstanceDecl, InstanceId
- ValueSlot, StateSlotId, EventSlotId
- StateMapping, ScalarSlotDecl, FieldSlotDecl
- ContinuityPolicy and other non-expression types

### Indices.ts Deletions (~20 lines)
- `SigExprId` type and `sigExprId()` factory
- `FieldExprId` type and `fieldExprId()` factory
- `EventExprId` type and `eventExprId()` factory

### File Deletions
- `src/compiler/ir/lowerToValueExprs.ts` (342 lines)
- `src/compiler/ir/__tests__/lowerToValueExprs.test.ts` (337 lines)

### IRBuilder Cleanup (~200 lines removed)
From IRBuilder.ts interface:
- All `sig*` method signatures
- All `field*` method signatures
- All `event*` method signatures
- `getSigExprs()`, `getFieldExprs()`, `getEventExprs()`

From IRBuilderImpl.ts implementation:
- `private sigExprs: SigExpr[]` and related storage
- `private fieldExprs: FieldExpr[]` and related storage
- `private eventExprs: EventExpr[]` and related storage
- All legacy method implementations

### Test Helper Updates
- `src/__tests__/ir-test-helpers.ts` — Delete `extractSigExpr`, `extractFieldExpr`, `extractEventExpr`
- Tests that use these helpers need rewriting to inspect `getValueExprs()` instead

## Tripwire Test Pattern

```typescript
describe('no-legacy-expression-types', () => {
  it('production code contains no legacy expression type references', () => {
    const bannedPatterns = [
      'SigExpr', 'FieldExpr', 'EventExpr',
      'SigExprId', 'FieldExprId', 'EventExprId',
      'lowerToValueExprs',
      'getSigExprs', 'getFieldExprs', 'getEventExprs',
      'sigToValue', 'fieldToValue', 'eventToValue',
    ];
    // Scan all .ts files under src/ excluding __tests__/
    // Fail with clear message if any pattern found
  });
});
```

## Estimated Impact
- **~680 lines deleted** from production code
- **~337 lines deleted** from bridge test
- **~200 lines removed** from IRBuilder/Impl
- Net reduction: ~1200 lines of legacy code
