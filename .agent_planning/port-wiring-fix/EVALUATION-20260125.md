# Evaluation: Port Wiring Error Bug

**Date**: 2026-01-25
**Bug ID**: oscilla-animator-v2-aql
**Status**: CONTINUE (High confidence fix identified)

## Root Cause

Commit `4243c1d` renamed/refactored field operation blocks (FieldSin → Sin, FieldCos → Cos, FieldAdd/FieldMultiply/FieldScale removed) but **did NOT bump the localStorage storage key version**.

Old patches stored with key `oscilla-v2-patch-v9` contain references to stale block types that no longer exist in the registry. When patches are loaded and compiled, the compiler cannot find these blocks and generates `UnknownPort` errors.

## Evidence

1. **Storage Key Not Bumped**: `src/main.ts:558` still has `STORAGE_KEY = 'oscilla-v2-patch-v9'`
   - Last bumped for "Z wave animation" feature
   - No bump for block refactoring in `4243c1d`

2. **Block Renames Confirmed**: `src/blocks/field-operations-blocks.ts`
   - FieldFromDomainId → FromDomainId
   - FieldSin → Sin
   - FieldCos → Cos
   - FieldAdd/FieldMultiply/FieldScale removed entirely

3. **Port Validation Confirms Error Path**: `src/graph/passes/pass2-adapters.ts:132-149`
   - Generates UnknownPort error when block type not in registry
   - This is correct behavior; stale patches trigger it

## Fix

Simple one-line change:
```typescript
// src/main.ts:558
const STORAGE_KEY = 'oscilla-v2-patch-v10'; // Bump from v9 to force fresh load after block refactoring
```

This forces localStorage to be cleared and resets demos to factory defaults, removing all stale block references.

## Side Finding

There are 11+ TypeScript errors in `adapter-blocks.ts` related to `ValueRefPacked` type contract changes (missing `type` and `stride` properties). This is a **separate issue** not blocking this fix.

## Confidence

**HIGH**: Root cause identified, fix validated, single file change, no dependencies.
