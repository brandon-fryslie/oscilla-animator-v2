# Evaluation: Domain → Instance System Migration

**Date**: 2026-01-19
**Topic**: Completing the deprecated Domain system removal
**Verdict**: CONTINUE

## Executive Summary

The Domain→Instance migration is **95% complete**. The new instance-based intrinsics system (`fieldIntrinsic()`, `FieldExprIntrinsic`) is fully implemented and working. The remaining work is cleanup: migrating tests that still use deprecated APIs and removing the deprecated code.

## Current State Analysis

### What's Complete

1. **New Type System** ✅
   - `FieldExprIntrinsic` type properly defined (`src/compiler/ir/types.ts:174-179`)
   - `IntrinsicPropertyName` closed union for type safety (`src/compiler/ir/types.ts:135-140`)
   - Exhaustive switch handling in Materializer

2. **IRBuilder New API** ✅
   - `fieldIntrinsic()` method properly typed - no `as any` casts (`IRBuilderImpl.ts:206-215`)
   - Uses proper `FieldExprIntrinsic` type

3. **Materializer** ✅
   - `case 'intrinsic'`: Properly handles new system (`Materializer.ts:147-150`)
   - `fillBufferIntrinsic()`: Exhaustive intrinsic handling (`Materializer.ts:293-347`)

4. **Production Blocks** ✅
   - All blocks use `fieldIntrinsic()` - no production code uses `fieldSource()`

### What Remains (Deprecated Code)

1. **Deprecated Types in Indices.ts**
   - `DomainId` type (lines 57-61) - marked for Sprint 8 removal
   - `domainId()` factory (lines 132-137) - deprecated annotation exists

2. **Deprecated Methods in IRBuilderImpl**
   - `fieldSource()` (lines 192-200) - marked deprecated
   - `fieldIndex()` (lines 303-305) - marked deprecated, wraps fieldSource

3. **Legacy Materializer Path**
   - `case 'source'` (lines 141-145) - still calls `fillBufferSource()`
   - `fillBufferSource()` function (lines 425-493) - full implementation of old system

4. **Tests Using Deprecated API**
   - `instance-unification.test.ts` - 18 uses of `domainId()` and `fieldSource()`
   - These tests validate domain unification logic, which is still needed

5. **DomainId Usage in Other Layers**
   - `domainId` field in graph/Patch layer - **Different concept** (user-facing block domain selection)
   - These should NOT be removed - they are a separate concern

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Breaking unification tests | Low | Rewrite tests to use `fieldIntrinsic()` |
| Losing unification validation | Low | Tests validate inferFieldDomain() which still works |
| Confusing different DomainId uses | Medium | Clear documentation; graph-layer domainId stays |

## Recommendation

**Single Sprint - HIGH Confidence**

The work is well-defined and low-risk:
1. Migrate `instance-unification.test.ts` to use `fieldIntrinsic()` instead of `fieldSource()`
2. Remove `fieldSource()`, `fieldIndex()` methods from IRBuilderImpl
3. Remove `DomainId` type and `domainId()` factory from Indices.ts
4. Remove `fillBufferSource()` and the `case 'source'` from Materializer
5. Update `FieldExprSource` type (it can be removed entirely or kept for future use)

## Dependencies

- No external dependencies
- No user-facing changes
- Pure code cleanup

## Unknowns

None - the migration path is clear from the audit findings and existing deprecation annotations.
