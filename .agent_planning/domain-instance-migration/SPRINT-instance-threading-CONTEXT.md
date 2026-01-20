# Context: Instance-Threading Sprint

## Problem Statement

The current codebase has two parallel systems for tracking domain information on field expressions:

1. **Legacy**: `domain?: DomainId` on map/zip/zipSig - opaque string IDs that are never populated
2. **New**: `instanceId: InstanceId` on intrinsic/array/layout - full instance context

The legacy system is vestigial: `inferFieldDomain()` always returns `undefined` because all fields derive from intrinsics (which use instance-based model). This creates confusion and prevents accessing useful domain information.

## Solution

Replace legacy domain tracking with instance tracking. Every instance already carries domain information via `InstanceDecl.domainType`, plus count and layout.

## Key Files

### Primary Changes
- `src/compiler/ir/types.ts` - FieldExpr type definitions
- `src/compiler/ir/IRBuilderImpl.ts` - Implementation of field operations
- `src/compiler/ir/IRBuilder.ts` - Interface definition
- `src/compiler/__tests__/instance-unification.test.ts` - Tests

### Secondary Changes
- `src/compiler/ir/lowerTypes.ts` - Compiler infrastructure types
- `src/compiler/ir/index.ts` - Re-exports
- `src/compiler/index.ts` - Public exports

## Architecture Context

### Instance System
```
InstanceId → InstanceDecl
                ├── domainType: DomainTypeId  ← THE DOMAIN
                ├── count: number
                ├── layout: LayoutSpec
                └── lifecycle, identityMode...
```

### Field Expression Hierarchy
```
FieldExpr
├── FieldExprIntrinsic  → has instanceId ✓
├── FieldExprArray      → has instanceId ✓
├── FieldExprLayout     → has instanceId ✓
├── FieldExprMap        → needs instanceId (currently has domain)
├── FieldExprZip        → needs instanceId (currently has domain)
├── FieldExprZipSig     → needs instanceId (currently has domain)
├── FieldExprConst      → domain-agnostic (no change)
└── FieldExprBroadcast  → domain-agnostic (no change)
```

## Constraints

1. **No runtime behavior change** - Materializer already uses instanceId
2. **Type safety** - No `as any` casts
3. **Backward compat** - Deprecate DomainId, don't remove immediately
4. **Graph layer untouched** - Block.domainId is a different concept

## Testing Strategy

Existing instance-unification tests validate the behavior. Update them to use `inferFieldInstance()` instead of `inferFieldDomain()`. All should still return `undefined` for intrinsic-based fields.

## Related Work

This completes the domain→instance migration started in the previous sprint which:
- Migrated tests from fieldSource() to fieldIntrinsic()
- Removed fieldSource(), fieldIndex() from IRBuilder
- Removed fillBufferSource() from Materializer

