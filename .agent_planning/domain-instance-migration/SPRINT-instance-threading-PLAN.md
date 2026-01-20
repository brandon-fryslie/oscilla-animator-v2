# Sprint: Instance-Threading - Complete Domain→Instance Migration

**Generated**: 2026-01-19
**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION

## Sprint Goal

Replace legacy `DomainId` tracking with `InstanceId` on field expressions, providing richer domain context (type, count, layout) through the established instance system.

## Key Insight

**Intrinsics ARE bound to an instance.** The `FieldExprIntrinsic` has `instanceId: InstanceId` because intrinsics provide per-element properties FOR that specific instance. Therefore `inferFieldInstance()` should return the instanceId for intrinsics, not `undefined`.

Instance binding:
- **Intrinsic, Array, Layout** → return their `instanceId` (they ARE bound to an instance)
- **Map, ZipSig** → propagate from input
- **Zip** → unify from inputs (must all be same instance)
- **Const, Broadcast** → `undefined` (truly instance-agnostic, can be used with any instance)

## Scope

**Deliverables:**
1. Field expressions use `instanceId?: InstanceId` instead of `domain?: DomainId`
2. `inferFieldInstance()` replaces `inferFieldDomain()`
3. Tests updated to validate instance inference (intrinsics return their instanceId!)
4. Unused lowerTypes domain types removed
5. DomainId deprecated with clear removal path

## Work Items

### P0: Update FieldExpr Types

**File:** `src/compiler/ir/types.ts`

**Changes:**
```typescript
// FieldExprMap: line 175-181
- readonly domain?: DomainId; // Propagated from input
+ readonly instanceId?: InstanceId; // Propagated from input

// FieldExprZip: line 183-189
- readonly domain?: DomainId; // Unified from inputs
+ readonly instanceId?: InstanceId; // Unified from inputs

// FieldExprZipSig: line 191-198
- readonly domain?: DomainId; // From field input (legacy, kept for domain inference)
+ readonly instanceId?: InstanceId; // From field input
```

**Acceptance Criteria:**
- [ ] FieldExprMap uses `instanceId?: InstanceId`
- [ ] FieldExprZip uses `instanceId?: InstanceId`
- [ ] FieldExprZipSig uses `instanceId?: InstanceId`
- [ ] No more DomainId imports needed in types.ts for FieldExpr definitions
- [ ] TypeScript compiles

### P1: Update IRBuilderImpl

**File:** `src/compiler/ir/IRBuilderImpl.ts`

**Changes:**

1. Rename `inferFieldDomain` → `inferFieldInstance`
2. Change return type from `DomainId | undefined` to `InstanceId | undefined`
3. Update implementation to return instanceId from expressions
4. Rename `inferZipDomain` → `inferZipInstance`
5. Update `fieldMap`, `fieldZip`, `fieldZipSig` to store instanceId

**New Implementation:**
```typescript
inferFieldInstance(fieldId: FieldExprId): InstanceId | undefined {
  const expr = this.fieldExprs[fieldId as number];
  if (!expr) return undefined;

  switch (expr.kind) {
    case 'intrinsic':
    case 'array':
    case 'layout':
      return expr.instanceId;  // These ARE bound to an instance
    case 'map':
      return expr.instanceId ?? this.inferFieldInstance(expr.input);
    case 'zip':
      return expr.instanceId ?? this.inferZipInstance(expr.inputs);
    case 'zipSig':
      return expr.instanceId ?? this.inferFieldInstance(expr.field);
    case 'broadcast':
    case 'const':
      return undefined;  // Truly instance-agnostic
  }
}

private inferZipInstance(inputs: readonly FieldExprId[]): InstanceId | undefined {
  const instances: InstanceId[] = [];
  for (const id of inputs) {
    const inst = this.inferFieldInstance(id);
    if (inst !== undefined) {
      instances.push(inst);
    }
  }

  if (instances.length === 0) return undefined;

  const first = instances[0];
  for (let i = 1; i < instances.length; i++) {
    if (instances[i] !== first) {
      throw new Error(
        `Instance mismatch in fieldZip: fields must share the same instance`
      );
    }
  }
  return first;
}
```

**Acceptance Criteria:**
- [ ] `inferFieldInstance()` method replaces `inferFieldDomain()`
- [ ] `inferZipInstance()` method replaces `inferZipDomain()`
- [ ] `fieldMap()` stores inferred instanceId
- [ ] `fieldZip()` stores unified instanceId
- [ ] `fieldZipSig()` stores inferred instanceId
- [ ] DomainId import removed from IRBuilderImpl
- [ ] TypeScript compiles

### P2: Update IRBuilder Interface

**File:** `src/compiler/ir/IRBuilder.ts`

**Changes:**
```typescript
// Replace:
- inferFieldDomain(fieldId: FieldExprId): DomainId | undefined;
+ inferFieldInstance(fieldId: FieldExprId): InstanceId | undefined;
```

**Acceptance Criteria:**
- [ ] Interface updated
- [ ] DomainId import removed
- [ ] TypeScript compiles

### P3: Update Tests

**File:** `src/compiler/__tests__/instance-unification.test.ts`

**Changes:**
- Rename all `inferFieldDomain` calls to `inferFieldInstance`
- **CRITICAL**: Update assertions - intrinsics should return their instanceId, NOT undefined
- Update test descriptions to reflect correct behavior

**Corrected Test Expectations:**
```typescript
// OLD (wrong):
expect(b.inferFieldDomain(field)).toBeUndefined();

// NEW (correct):
expect(b.inferFieldInstance(field)).toBe(instance);  // For intrinsics
expect(b.inferFieldInstance(broadcast)).toBeUndefined();  // Only for broadcast/const
```

**Test Categories:**
1. **Intrinsic fields** → should return their instanceId
2. **Array/Layout fields** → should return their instanceId
3. **Broadcast/Const fields** → should return undefined (instance-agnostic)
4. **Map/Zip/ZipSig** → should propagate instanceId from inputs
5. **Zip with same instance** → should return the shared instanceId
6. **Zip with different instances** → should throw error

**Acceptance Criteria:**
- [ ] All `inferFieldDomain` → `inferFieldInstance`
- [ ] Intrinsic tests assert `toBe(instance)` not `toBeUndefined()`
- [ ] Array/Layout tests assert `toBe(instance)`
- [ ] Broadcast/Const tests assert `toBeUndefined()`
- [ ] Map/Zip propagation tests assert correct instanceId
- [ ] All tests pass
- [ ] Test names accurately describe instance-based behavior

### P4: Clean Up lowerTypes.ts

**File:** `src/compiler/ir/lowerTypes.ts`

**Analysis:** These types are defined but never used at runtime:
- `LoweredDomain` - has `domainId: DomainId` but no code reads it
- `LoweredDomainInput` - has `domainId: DomainId` but no code reads it
- `ValueRefPacked` domain variant - may be used for type discrimination

**Changes:**

Option A (Conservative): Keep types but update to use InstanceId
```typescript
export interface LoweredDomain {
  readonly kind: 'domain';
  readonly instanceId: InstanceId;  // Changed from domainId: DomainId
  readonly count: number;
}
```

Option B (Aggressive): Remove unused types entirely
- Remove LoweredDomain from LoweredOutput union
- Remove LoweredDomainInput from LoweredInput union
- Remove ValueRefPacked domain variant

**Recommendation:** Option A first, Option B in follow-up sprint after confirming no usage.

**Acceptance Criteria:**
- [ ] Domain types updated to use InstanceId OR removed
- [ ] Exports updated in ir/index.ts
- [ ] TypeScript compiles

### P5: Deprecate DomainId Exports

**Files:**
- `src/compiler/ir/Indices.ts`
- `src/compiler/ir/types.ts` (re-exports)
- `src/compiler/index.ts` (public exports)

**Changes:**

1. Add deprecation notice to DomainId in Indices.ts (already done)
2. Add `@deprecated` to re-exports
3. Plan removal for next major version

```typescript
// In compiler/index.ts:
/**
 * @deprecated DomainId is no longer used. Use InstanceId instead.
 * Will be removed in next major version.
 */
export type { DomainId } from './ir';
```

**Acceptance Criteria:**
- [ ] All DomainId exports marked deprecated
- [ ] Documentation explains migration to InstanceId
- [ ] No compile errors

## Execution Order

```
P0: Update FieldExpr types (instanceId replaces domain)
    ↓
P1: Update IRBuilderImpl (inferFieldInstance)
    ↓
P2: Update IRBuilder interface
    ↓
P3: Update tests (with CORRECT assertions)
    ↓
P4: Clean up lowerTypes
    ↓
P5: Deprecate DomainId exports
```

## Verification

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] grep for `inferFieldDomain` shows no hits (except maybe deprecated alias)
- [ ] grep for `domain\?: DomainId` in types.ts shows no hits
- [ ] Animation demos run correctly

## Behavioral Changes (Expected)

**Before:** `inferFieldDomain()` always returned `undefined` for all field expressions
**After:** `inferFieldInstance()` returns:
- The `instanceId` for intrinsic/array/layout expressions
- Propagated `instanceId` for map/zip/zipSig
- `undefined` only for truly instance-agnostic expressions (const, broadcast)

This is the **correct** behavior - the old behavior was wrong because it failed to track that intrinsics are bound to specific instances.

## Future Work (Out of Scope)

1. **Remove DomainId entirely** - After deprecation period
2. **Instance type validation** - Validate domain types match when zipping
3. **Expose domain type info** - Could add `getInstanceDomainType(id)` helper

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking public API | Medium | Deprecation warnings, not immediate removal |
| Hidden DomainId usages | Low | Comprehensive grep before changes |
| lowerTypes actually used | Low | Audit shows no runtime access to domain fields |
| Test expectation changes | Low | Changes are to FIX incorrect tests |

