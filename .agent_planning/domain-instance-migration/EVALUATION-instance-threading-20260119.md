# Evaluation: Instance-Based Domain Threading

**Date**: 2026-01-19
**Topic**: Replace legacy DomainId with InstanceId for domain tracking
**Verdict**: CONTINUE

## Executive Summary

The current system has **two parallel paths** for tracking domain information:
1. **Legacy**: `domain?: DomainId` on map/zip/zipSig expressions, using opaque string IDs
2. **New**: `instanceId: InstanceId` on intrinsic/array/layout expressions, with full instance context

The legacy path is vestigial - `inferFieldDomain()` always returns `undefined` because all field expressions ultimately derive from intrinsics (which are instance-based). The migration is to **replace the legacy domain tracking with instance tracking**, giving us richer information (domain type, count, layout) rather than just an opaque ID.

## Current Architecture

### What Instances Already Provide

Every `InstanceId` points to an `InstanceDecl` containing:
```typescript
interface InstanceDecl {
  id: string;                    // InstanceId
  domainType: string;            // DomainTypeId - THE DOMAIN TYPE
  count: number | 'dynamic';     // Element count
  layout: LayoutSpec;            // Spatial arrangement
  lifecycle: 'static' | 'dynamic' | 'pooled';
  identityMode: 'stable' | 'none';
}
```

**Key insight**: `InstanceDecl.domainType` IS the domain information you want. An instance is always an instance OF a domain type.

### Current Field Expression Types

| Expression | Has InstanceId? | Has DomainId? | Status |
|------------|-----------------|---------------|--------|
| `FieldExprIntrinsic` | ✅ Yes | No | New system |
| `FieldExprArray` | ✅ Yes | No | New system |
| `FieldExprLayout` | ✅ Yes | No | New system |
| `FieldExprMap` | No | ❌ Legacy | Migrate |
| `FieldExprZip` | No | ❌ Legacy | Migrate |
| `FieldExprZipSig` | No | ❌ Legacy | Migrate |
| `FieldExprConst` | No | No | Domain-agnostic |
| `FieldExprBroadcast` | No | No | Domain-agnostic |

### Why Legacy DomainId Is Problematic

1. **Opaque**: Just a string like `"domain_0"` - no domain TYPE information
2. **Unused**: `inferFieldDomain()` always returns `undefined` in practice
3. **Vestigial**: The runtime (Materializer) never reads it - uses instanceId instead
4. **Confusing**: Different concept from graph-layer `Block.domainId`

## Design: Instance-Based Domain Threading

### Core Change

Replace `domain?: DomainId` with `instanceId?: InstanceId` on map/zip/zipSig:

```typescript
// BEFORE (legacy)
export interface FieldExprMap {
  readonly kind: 'map';
  readonly input: FieldExprId;
  readonly fn: PureFn;
  readonly type: CanonicalType;
  readonly domain?: DomainId; // Opaque, unused
}

// AFTER (new)
export interface FieldExprMap {
  readonly kind: 'map';
  readonly input: FieldExprId;
  readonly fn: PureFn;
  readonly type: CanonicalType;
  readonly instanceId?: InstanceId; // Rich context available
}
```

### New API: `inferFieldInstance()`

Replace `inferFieldDomain()` with `inferFieldInstance()`:

```typescript
// Returns the instance a field expression operates over
inferFieldInstance(fieldId: FieldExprId): InstanceId | undefined {
  const expr = this.fieldExprs[fieldId as number];
  if (!expr) return undefined;

  switch (expr.kind) {
    case 'intrinsic':
    case 'array':
    case 'layout':
      return expr.instanceId;
    case 'map':
      return expr.instanceId ?? this.inferFieldInstance(expr.input);
    case 'zip':
      return expr.instanceId ?? this.inferZipInstance(expr.inputs);
    case 'zipSig':
      return expr.instanceId ?? this.inferFieldInstance(expr.field);
    case 'broadcast':
    case 'const':
      return undefined; // Domain-agnostic
  }
}
```

### Benefits

1. **Domain type available**: `instances.get(instanceId)?.domainType`
2. **Count available**: `instances.get(instanceId)?.count`
3. **Layout available**: `instances.get(instanceId)?.layout`
4. **One source of truth**: Instance is THE place for domain context
5. **Runtime compatible**: Materializer already uses instanceId

### Instance Unification

When zipping fields from different instances:

```typescript
private inferZipInstance(inputs: readonly FieldExprId[]): InstanceId | undefined {
  const instanceIds: InstanceId[] = [];
  for (const id of inputs) {
    const inst = this.inferFieldInstance(id);
    if (inst !== undefined) {
      instanceIds.push(inst);
    }
  }

  if (instanceIds.length === 0) return undefined;

  // All fields must be from the same instance
  const first = instanceIds[0];
  for (let i = 1; i < instanceIds.length; i++) {
    if (instanceIds[i] !== first) {
      throw new Error(
        `Instance mismatch in fieldZip: fields must share the same instance`
      );
    }
  }
  return first;
}
```

## What Can Be Removed

### IR Layer (Indices.ts)
- `DomainId` type - keep temporarily for lowerTypes compatibility, then remove
- `domainId()` factory - remove after migration

### IR Layer (types.ts)
- `domain?: DomainId` on FieldExprMap, FieldExprZip, FieldExprZipSig - replace with instanceId

### Compiler Layer (lowerTypes.ts)
- `LoweredDomain` - never actually used (no code reads `.domainId`)
- `LoweredDomainInput` - never actually used
- `ValueRefPacked` domain variant - review if needed
- `LoweredIR.domains` - never populated with useful data

### Public Exports
- `DomainId` from compiler/index.ts - remove after deprecation period

## What To Keep

### Graph Layer
- `Block.domainId: string | null` - This is a **different concept**: user-facing semantic grouping
- Graph passes that propagate domainId - These are for user-facing features

### Domain Registry
- `DomainTypeId` - The canonical domain type identifier
- `DomainType` registry - Domain type definitions with intrinsics

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Breaking type exports | Low | Deprecation warnings first, remove in next major |
| LowerTypes usage | Low | Audit shows no runtime usage of domain fields |
| Instance mismatch errors | Low | Same semantic as domain mismatch, just clearer |

## Recommendation

**Single Sprint - HIGH Confidence**

The migration is mechanical and well-contained:

1. Replace `domain?: DomainId` with `instanceId?: InstanceId` on map/zip/zipSig
2. Rename `inferFieldDomain` to `inferFieldInstance`, change return type
3. Update tests to use `inferFieldInstance`
4. Remove unused lowerTypes domain types
5. Deprecate and eventually remove DomainId exports

## Dependencies

- No external dependencies
- No runtime behavior changes (Materializer already uses instanceId)
- Test updates are mechanical

## Unknowns

One question to clarify:

**Should `const` and `broadcast` be allowed to specify an instance?**

Currently they're domain-agnostic. If a broadcast is used in a zip with instance-bound fields, it just works (the instance comes from the other fields). This seems correct - a broadcast/const doesn't "belong" to an instance, it just produces a value that can be used with any instance.

