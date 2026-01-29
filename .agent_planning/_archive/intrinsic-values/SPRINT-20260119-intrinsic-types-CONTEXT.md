# Implementation Context: intrinsic-types

**Sprint**: Proper Type System for Intrinsic Values
**Generated**: 2026-01-19

## Background

### The Bug That Prompted This

On 2026-01-19, a bug was discovered where particle positions were rendering in the range [-10, 11] instead of [0, 1]. Root cause:

1. `fieldIntrinsic()` stored the intrinsic name in `expr.intrinsic` (e.g., 'normalizedIndex')
2. But it also set `expr.sourceId = 'index'` as a placeholder (hardcoded)
3. The Materializer read `expr.sourceId` instead of `expr.intrinsic`
4. Result: All intrinsic fields returned raw indices (0-4999) instead of normalized values (0-1)

The workaround was: `const sourceKey = (expr as any).intrinsic ?? expr.sourceId;`

This sprint eliminates the workaround with proper type safety.

### Current Architecture (Broken)

```
IRBuilder.fieldIntrinsic('normalizedIndex')
    ↓
FieldExprSource {
  kind: 'source',
  domain: 'deprecated',      ← placeholder
  sourceId: 'index',         ← placeholder (BUG SOURCE)
  instanceId: ...,           ← actual value (as any cast)
  intrinsic: 'normalizedIndex' ← actual value (as any cast)
}
    ↓
Materializer reads expr.sourceId → gets 'index' → WRONG!
```

### Target Architecture (Fixed)

```
IRBuilder.fieldIntrinsic('normalizedIndex')
    ↓
FieldExprIntrinsic {
  kind: 'intrinsic',         ← new discriminator
  instanceId: ...,           ← properly typed
  intrinsic: 'normalizedIndex' ← properly typed
}
    ↓
Materializer matches kind: 'intrinsic' → reads expr.intrinsic → CORRECT!
```

## Key Files

### Types Definition
**File**: `src/compiler/ir/types.ts`

Current FieldExpr union (around line 180):
```typescript
export type FieldExpr =
  | FieldExprConst
  | FieldExprSource
  | FieldExprBroadcast
  | FieldExprMap
  | FieldExprZip
  | FieldExprZipSig
  | FieldExprMapIndexed
  | FieldExprArray
  | FieldExprLayout;
```

Add `FieldExprIntrinsic` to this union.

### IRBuilder Implementation
**File**: `src/compiler/ir/IRBuilderImpl.ts`

Current implementation (lines 199-212):
```typescript
fieldIntrinsic(instanceId: InstanceId, intrinsic: string, type: CanonicalType): FieldExprId {
  const id = fieldExprId(this.fieldExprs.length);
  this.fieldExprs.push({
    kind: 'source',
    domain: domainId('deprecated'),
    sourceId: 'index',
    instanceId: instanceId as any,
    intrinsic: intrinsic as any,
    type,
  } as any);
  return id;
}
```

Replace with clean implementation using `kind: 'intrinsic'`.

### Materializer
**File**: `src/runtime/Materializer.ts`

Current workaround (around line 143):
```typescript
case 'source': {
  const sourceKey = (expr as any).intrinsic ?? expr.sourceId;
  fillBufferSource(sourceKey, buffer, instance);
  break;
}
```

Add new `case 'intrinsic':` and remove the workaround.

### fillBufferSource Function
**File**: `src/runtime/Materializer.ts` (around line 287)

Currently handles: `'pos0' | 'idRand' | 'index' | 'normalizedIndex'`

Create new `fillBufferIntrinsic()` for the intrinsic case with exhaustive switch.

## Intrinsic Implementations

### index
```typescript
for (let i = 0; i < N; i++) arr[i] = i;
```

### normalizedIndex
```typescript
for (let i = 0; i < N; i++) arr[i] = N > 1 ? i / (N - 1) : 0;
```

### randomId
```typescript
// Deterministic hash based on index
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
for (let i = 0; i < N; i++) arr[i] = pseudoRandom(i);
```

### position (vec2)
```typescript
// Similar to existing 'pos0' in fillBufferSource
// Uses instance.layout to compute grid/circular/linear positions
```

### radius
```typescript
// Layout-dependent or constant
// For circular layouts: instance.layout.radius
// For grid/linear: constant (e.g., 0.02)
```

## Exhaustive Switch Pattern

```typescript
function fillBufferIntrinsic(
  intrinsic: IntrinsicPropertyName,
  buffer: ArrayBufferView,
  instance: InstanceDecl
): void {
  switch (intrinsic) {
    case 'index': /* ... */ break;
    case 'normalizedIndex': /* ... */ break;
    case 'randomId': /* ... */ break;
    case 'position': /* ... */ break;
    case 'radius': /* ... */ break;
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = intrinsic;
      throw new Error(`Unknown intrinsic: ${_exhaustive}`);
  }
}
```

If a new intrinsic is added to `IntrinsicPropertyName` but not to the switch, TypeScript will error on the `never` assignment.

## Block Files Using fieldIntrinsic

1. `src/blocks/array-blocks.ts:78-79`
   - `fieldIntrinsic(instanceId, 'index', ...)`
   - `fieldIntrinsic(instanceId, 'normalizedIndex', ...)`

2. `src/blocks/instance-blocks.ts:194-197`
   - `fieldIntrinsic(instanceId, 'position', ...)`
   - `fieldIntrinsic(instanceId, 'radius', ...)`
   - `fieldIntrinsic(instanceId, 'index', ...)`
   - `fieldIntrinsic(instanceId, 'normalizedIndex', ...)`

3. `src/blocks/identity-blocks.ts:42-43, 81-82`
   - `fieldIntrinsic(instanceId, 'randomId', ...)`
   - `fieldIntrinsic(instanceId, 'normalizedIndex', ...)`
   - `fieldIntrinsic(instanceId, 'index', ...)`

4. `src/blocks/geometry-blocks.ts:99`
   - `fieldIntrinsic(instanceId, 'normalizedIndex', ...)`

5. `src/blocks/field-operations-blocks.ts:38`
   - `fieldIntrinsic(instanceId, 'normalizedIndex', ...)`

After changing the parameter type from `string` to `IntrinsicPropertyName`, all these should compile without changes (they all use valid intrinsic names).
