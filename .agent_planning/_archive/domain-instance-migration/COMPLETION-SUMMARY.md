# Domain→Instance Migration - COMPLETED

**Completed:** 2026-01-19
**Status:** CLOSED

## Summary

The domain→instance migration is now fully complete. The vestigial `DomainId` type and all its associated infrastructure have been removed from the codebase.

## What Was Done

### Phase 1: Instance Threading (Previously Completed)
- Replaced `domain?: DomainId` with `instanceId?: InstanceId` on `FieldExprMap`, `FieldExprZip`, `FieldExprZipSig`
- Implemented `inferFieldInstance()` replacing `inferFieldDomain()`
- Implemented `inferZipInstance()` for instance unification with mismatch detection
- Updated all field builder methods to propagate instanceId
- Updated tests with correct assertions (intrinsics return instanceId, broadcast/const return undefined)

### Phase 2: Cleanup (Completed 2026-01-19)
- **Removed** `DomainId` type from `src/compiler/ir/Indices.ts`
- **Removed** `domainId()` factory function from `src/compiler/ir/Indices.ts`
- **Removed** `DomainId` exports from `src/compiler/ir/types.ts`
- **Removed** `DomainId` export from `src/compiler/index.ts`
- **Updated** stale comment in `src/runtime/RuntimeState.ts` (DomainId → InstanceId)

## Verification

- TypeScript compiles without domain-related errors
- 346 tests pass
- `grep -r "DomainId" src/compiler/` returns no matches in IR files
- `grep -r "inferFieldDomain" src/` returns no matches

## What Remains (Intentionally)

These are **NOT** part of the migration - they are different concepts:

1. **`DomainIdentity.ts`** - This is for element identity within domain instances for continuity (stable IDs across hot swap). Completely different concept from IR-level DomainId tracking.

2. **`FieldFromDomainId` block name** - Legacy naming but implementation is correct (uses `fieldIntrinsic(instance, 'normalizedIndex', ...)`). Renaming is optional and low priority.

## Impact

This migration unblocks future refactoring work by:
- Eliminating confusion between DomainId (IR tracking) and InstanceId (runtime identity)
- Providing richer context through instanceId (domain type, count, layout available)
- Removing dead code that was never actually used

## Files Modified

- `src/compiler/ir/Indices.ts` - Removed DomainId, domainId()
- `src/compiler/ir/types.ts` - Removed DomainId exports
- `src/compiler/index.ts` - Removed DomainId export
- `src/runtime/RuntimeState.ts` - Fixed comment
