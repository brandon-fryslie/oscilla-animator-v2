# Implementation Context: Domain-Cleanup Sprint

**Sprint**: Domain→Instance Migration Completion
**Date**: 2026-01-19

## Background

The Oscilla codebase has been migrating from a "Domain" system to an "Instance" system for field expressions. This migration introduced:

1. **Old System (Domain-based)**:
   - `DomainId` - string ID for a domain
   - `fieldSource(domain, sourceId, type)` - creates field from domain source
   - `FieldExprSource` type with `domain` and `sourceId` fields
   - `fillBufferSource()` in Materializer

2. **New System (Instance-based)**:
   - `InstanceId` - string ID for an instance
   - `IntrinsicPropertyName` - closed union of intrinsic names
   - `fieldIntrinsic(instanceId, intrinsic, type)` - creates field from intrinsic
   - `FieldExprIntrinsic` type with `instanceId` and `intrinsic` fields
   - `fillBufferIntrinsic()` in Materializer with exhaustive handling

The new system is fully implemented and used by all production blocks. The old system remains only for backward compatibility with one test file.

## Key Files

### Source Files to Modify

| File | Lines | What to Change |
|------|-------|----------------|
| `src/compiler/__tests__/instance-unification.test.ts` | 1-177 | Migrate all tests to use `fieldIntrinsic()` |
| `src/compiler/ir/IRBuilderImpl.ts` | 188-200, 301-305 | Remove `fieldSource()`, `fieldIndex()` |
| `src/runtime/Materializer.ts` | 141-145, 425-493 | Remove `case 'source'`, `fillBufferSource()` |
| `src/compiler/ir/Indices.ts` | 57-61, 132-137 | Remove `DomainId` type, `domainId()` factory |
| `src/compiler/ir/types.ts` | 39, 57, etc. | Update exports, clean up types |

### Reference Files (Do NOT Modify)

| File | Why |
|------|-----|
| `src/graph/Patch.ts` | `domainId` field is user-facing concept, NOT deprecated |
| `src/stores/PatchStore.ts` | Same - different domain concept |
| `src/ui/components/TableView.tsx` | Same - UI for block domain selection |

## Code Patterns

### Current Test Pattern (to migrate FROM)

```typescript
// instance-unification.test.ts line 21-30
it('infers domain from FieldExprSource', () => {
  const b = new IRBuilderImpl();
  const instanceId = b.createInstance(DOMAIN_CIRCLE, 10, { kind: 'unordered' });
  const domain = domainId(`domain_0`);  // ← DEPRECATED
  const type = signalTypeField('float', domain);
  const field = b.fieldSource(domain, 'index', type);  // ← DEPRECATED

  expect(b.inferFieldDomain(field)).toBe(domain);
});
```

### Target Test Pattern (to migrate TO)

```typescript
// Proposed new pattern
it('returns undefined for intrinsic fields (instance-based)', () => {
  const b = new IRBuilderImpl();
  const instance = b.createInstance(DOMAIN_CIRCLE, 10, { kind: 'unordered' });
  const type = signalTypeField('int', '#');
  const field = b.fieldIntrinsic(instance, 'index', type);

  // Intrinsics are instance-based, not domain-based
  // inferFieldDomain returns undefined for intrinsics
  expect(b.inferFieldDomain(field)).toBeUndefined();
});
```

### Key Insight: Test Purpose

The `instance-unification.test.ts` tests validate that:
1. `inferFieldDomain()` can track domain through field composition
2. `fieldZip` throws on domain mismatch
3. Domain propagates through map/zipSig operations

With the new instance system, intrinsics don't have domains - they have instances. The unification concept may need to shift to instance-level:
- `inferFieldInstance()` instead of `inferFieldDomain()`
- Or simply: intrinsics are always domain-free, unification applies only to old-style sources

**Recommended approach for this sprint:** The tests can be simplified to verify:
1. Intrinsic fields return `undefined` for domain inference
2. Domain unification only applies to mapIndexed and similar domain-anchored operations
3. Most field ops with intrinsics are domain-free

## API Reference

### IRBuilder.fieldIntrinsic() (NEW - KEEP)

```typescript
fieldIntrinsic(instanceId: InstanceId, intrinsic: IntrinsicPropertyName, type: SignalType): FieldExprId
```

Creates a `FieldExprIntrinsic` with:
- `kind: 'intrinsic'`
- `instanceId`: The instance to query
- `intrinsic`: 'index' | 'normalizedIndex' | 'randomId' | 'position' | 'radius'
- `type`: SignalType

### IRBuilder.fieldSource() (OLD - REMOVE)

```typescript
fieldSource(domain: DomainId, sourceId: 'pos0' | 'idRand' | 'index' | 'normalizedIndex', type: SignalType): FieldExprId
```

Creates a `FieldExprSource` with:
- `kind: 'source'`
- `domain`: DomainId
- `sourceId`: Source identifier
- `type`: SignalType

### inferFieldDomain() Behavior

Current behavior:
- `FieldExprSource` → returns `expr.domain`
- `FieldExprIntrinsic` → returns `undefined` (instance-based)
- `FieldExprMap/Zip/ZipSig` → propagates from inputs
- `FieldExprBroadcast/Const` → returns `undefined`

This behavior should remain after the migration - we're just removing the ability to *create* `FieldExprSource`.

## Commit Strategy

Suggested commit sequence:

1. **Migrate tests** - "test(ir): Migrate instance-unification tests to use fieldIntrinsic"
2. **Remove IRBuilder methods** - "refactor(ir): Remove deprecated fieldSource and fieldIndex"
3. **Remove Materializer path** - "refactor(runtime): Remove legacy fillBufferSource"
4. **Remove types** - "chore(ir): Remove deprecated DomainId type"

Each commit should pass all tests.
