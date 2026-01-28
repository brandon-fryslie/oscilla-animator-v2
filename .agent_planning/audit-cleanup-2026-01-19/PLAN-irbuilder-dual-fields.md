# Plan: IRBuilder Dual Field System Cleanup

**Date**: 2026-01-19
**Priority**: P1
**Status**: PLANNED

## Summary

Complete migration from domain-based fields (`domain`, `sourceId`) to instance-based fields (`instanceId`, `intrinsic`) in the field expression system.

## Current State

**Problem Location:** `src/compiler/ir/IRBuilderImpl.ts:203-210`

```typescript
this.fieldExprs.push({
  kind: 'source',
  domain: domainId('deprecated'), // OLD - placeholder
  sourceId: 'index',              // OLD - placeholder
  instanceId: instanceId as any,  // NEW field
  intrinsic: intrinsic as any,    // NEW field
  type,
} as any);
```

Both old and new fields coexist with `as any` casts to bypass type checking.

## Implementation Steps

### Step 1: Audit All Usages

Grep for consumers of `domain` and `sourceId`:
- `Materializer.ts:143` - Has graceful fallback
- `IRBuilderImpl.inferFieldDomain()` - Reads `expr.domain`

### Step 2: Update FieldExprSource Type
**File:** `src/compiler/ir/types.ts`

```typescript
export interface FieldExprSource {
  readonly kind: 'source';
  // @deprecated - use instanceId
  readonly domain?: DomainId;
  // @deprecated - use intrinsic
  readonly sourceId?: 'pos0' | 'idRand' | 'index' | 'normalizedIndex';
  // NEW: Required
  readonly instanceId: InstanceId;
  readonly intrinsic: string;
  readonly type: CanonicalType;
}
```

### Step 3: Update IRBuilder.fieldIntrinsic()
**File:** `src/compiler/ir/IRBuilderImpl.ts`

Remove placeholder values:
```typescript
fieldIntrinsic(instanceId: InstanceId, intrinsic: string, type: CanonicalType): FieldExprId {
  const id = fieldExprId(this.fieldExprs.length);
  this.fieldExprs.push({
    kind: 'source',
    instanceId,
    intrinsic,
    type,
  });
  return id;
}
```

### Step 4: Update Consumers
**File:** `src/runtime/Materializer.ts`

Remove fallback, use `expr.intrinsic` directly at line 143.

### Step 5: Update inferFieldDomain()
Change from domain-based to instance-based lookup.

### Step 6: Deprecate fieldSource()
Mark `fieldSource()` method as deprecated.

### Step 7: Remove Old Fields
After all callers updated, remove `domain` and `sourceId` from FieldExprSource type.

## Files to Modify

| File | Changes |
|------|---------|
| `src/compiler/ir/types.ts` | Update FieldExprSource type |
| `src/compiler/ir/IRBuilderImpl.ts` | Update fieldIntrinsic, deprecate fieldSource |
| `src/compiler/ir/IRBuilder.ts` | Update interface |
| `src/runtime/Materializer.ts` | Remove fallback |

## Sequencing

```
1. Update type (make old optional)
   ↓
2. Update IRBuilder.fieldIntrinsic()
   ↓
3. Update Materializer.ts
   ↓
4. Update inferFieldDomain()
   ↓
5. Find and update fieldSource() callers
   ↓
6. Remove old fields from type
```

## Verification

- [ ] TypeScript compiles without `as any` casts
- [ ] All tests pass
- [ ] Animation demos work
- [ ] No `domain: domainId('deprecated')` in codebase

## Risks

| Risk | Mitigation |
|------|------------|
| Runtime breakage if field missing | Keep optional with fallback during transition |
| Type errors during migration | Use `as any` temporarily, then clean up |
| Missed consumers | Grep for `\.domain` and `\.sourceId` patterns |
