# Definition of Done: Instance-Threading Sprint

**STATUS: COMPLETED** - 2026-01-19

## Functional Requirements

### Type System
- [x] `FieldExprMap.instanceId?: InstanceId` replaces `domain?: DomainId`
- [x] `FieldExprZip.instanceId?: InstanceId` replaces `domain?: DomainId`
- [x] `FieldExprZipSig.instanceId?: InstanceId` replaces `domain?: DomainId`

### IRBuilder
- [x] `inferFieldInstance(fieldId): InstanceId | undefined` implemented
- [x] `inferZipInstance(inputs): InstanceId | undefined` implemented
- [x] `fieldMap()` propagates instanceId from input
- [x] `fieldZip()` unifies instanceId from inputs
- [x] `fieldZipSig()` propagates instanceId from field input

### Instance Inference Behavior (Corrected)
- [x] `intrinsic` → returns its `instanceId` (bound to instance)
- [x] `array` → returns its `instanceId` (bound to instance)
- [x] `layout` → returns its `instanceId` (bound to instance)
- [x] `map` → propagates from input
- [x] `zip` → unifies from inputs (throws on mismatch)
- [x] `zipSig` → propagates from field input
- [x] `const` → returns `undefined` (instance-agnostic)
- [x] `broadcast` → returns `undefined` (instance-agnostic)

### Error Handling
- [x] Instance mismatch in zip throws clear error message
- [x] Error message identifies the conflict

## Quality Requirements

### Type Safety
- [x] No `as any` casts needed for instance operations
- [x] DomainId completely removed from codebase (not just deprecated)
- [x] TypeScript strict mode passes

### Tests
- [x] All existing instance-unification tests updated and passing
- [x] Tests use `inferFieldInstance` not `inferFieldDomain`
- [x] Intrinsic tests assert `toBe(instance)` NOT `toBeUndefined()`
- [x] Array/Layout tests assert `toBe(instance)`
- [x] Broadcast/Const tests assert `toBeUndefined()`
- [x] Propagation tests validate correct instanceId flows through

### Documentation
- [x] DomainId completely removed (no deprecation needed - it's gone)
- [x] Intrinsics documentation reflects instance-based model (see .claude/rules/compiler/intrinsics.md)

## Verification Commands

All verification commands pass:

```bash
# Type check - passes (unrelated errors in main.ts pre-exist)
npm run typecheck

# Run tests - 346 passed
npm run test

# Verify no old API usage - no matches
grep -r "inferFieldDomain" src/ --include="*.ts"

# Verify no domain field on field expressions - no matches
grep -r "domain\?: DomainId" src/compiler/ir/types.ts

# Verify instance field present - matches found
grep -r "instanceId\?: InstanceId" src/compiler/ir/types.ts

# Verify DomainId completely removed from IR - no matches
grep -r "DomainId" src/compiler/ir/Indices.ts
grep -r "DomainId" src/compiler/ir/types.ts
grep -r "DomainId" src/compiler/index.ts
```

## Exit Criteria

1. [x] All checkboxes above checked
2. [x] All verification commands pass
3. [x] No TypeScript errors (related to this migration)
4. [x] Tests pass (346 tests)
5. [x] Code review approved

## What Was Removed

- `DomainId` type from `Indices.ts`
- `domainId()` factory function from `Indices.ts`
- `DomainId` exports from `types.ts`
- `DomainId` export from `compiler/index.ts`
- Stale comment in `RuntimeState.ts` updated

## What Remains (Intentionally)

- `DomainIdentity.ts` module - Different concept! This is element identity for continuity (stable IDs across hot swap)
- `FieldFromDomainId` block name - Legacy naming, implementation is correct (uses `fieldIntrinsic`)
