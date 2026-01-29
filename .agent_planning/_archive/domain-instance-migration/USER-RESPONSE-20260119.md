# User Response: Domain-Cleanup Sprint

**Date**: 2026-01-19
**Decision**: APPROVED

## Approved Sprint

**Sprint**: Domain-Cleanup - Complete Domain→Instance Migration
**Confidence**: HIGH
**File**: `SPRINT-20260119-domain-cleanup-PLAN.md`

## Scope Summary

1. Migrate `instance-unification.test.ts` to use `fieldIntrinsic()` API
2. Remove `fieldSource()` and `fieldIndex()` from IRBuilderImpl
3. Remove `fillBufferSource()` and `case 'source'` from Materializer
4. Remove `DomainId` type and `domainId()` factory from Indices.ts

## User Notes

User approved with instruction: "write to standard plan files"

## Next Steps

Proceed to implementation via `/do:it domain-instance-migration`
