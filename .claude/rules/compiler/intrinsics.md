---
paths: src/compiler/**/*.ts, src/runtime/Materializer.ts
---

# Field Intrinsics

Field intrinsics are per-element properties automatically available for any instance (array of elements). They provide element identity and layout information without explicit computation.

## What Are Intrinsics?

Intrinsics solve a common problem: how do you access per-element properties like "index" or "position" without explicitly computing them? Rather than forcing blocks to manually create these common fields, intrinsics make them automatically available for any instance.

### Type Safety

Intrinsics use a closed union type `IntrinsicPropertyName` defined in `src/compiler/ir/types.ts`:

```typescript
export type IntrinsicPropertyName =
  | 'index'
  | 'normalizedIndex'
  | 'randomId';
```

This closed union enables:
- **Compile-time validation**: Invalid intrinsic names cause TypeScript errors
- **Exhaustive checking**: The Materializer switch must handle all cases
- **No 'as any' casts**: Type safety throughout the pipeline

## Valid Intrinsic Names

| Name | Type | Description | Use Case |
|------|------|-------------|----------|
| `index` | int | Element index (0, 1, 2, ..., N-1) | Sequential numbering, array lookups |
| `normalizedIndex` | float | Normalized index (0.0 to 1.0) | Gradients, lerping across array |
| `randomId` | float | Deterministic per-element random (0.0 to 1.0) | Stable per-element randomness |

### Implementation Details

**index**: Simply `i` for the i-th element.

**normalizedIndex**: `i / (N - 1)` where N is element count. Special case: returns 0 for single-element arrays.

**randomId**: Uses sine-based pseudo-random generator: `sin(seed * 12.9898) * 43758.5453 % 1.0`. Deterministic and smooth.

### Note on Position and Radius

Position and radius are **not intrinsics**. They are computed by layout field kernels (e.g., `circleLayout`, `gridLayout`) which take intrinsics like `normalizedIndex` as input and produce position/radius fields. See `src/runtime/FieldKernels.ts` for layout computations.

## Usage in Blocks

Blocks access intrinsics via `IRBuilder.fieldIntrinsic()`:

```typescript
// Example from array-blocks.ts
const idxField = builder.fieldIntrinsic(instanceId, 'index', { payload: 'int', unit: '#' });
const id01Field = builder.fieldIntrinsic(instanceId, 'normalizedIndex', { payload: 'float', unit: '01' });
```

The type system ensures:
1. Only valid intrinsic names are accepted
2. The intrinsic type is properly recorded
3. No casts or workarounds needed

## Adding a New Intrinsic

To add a new intrinsic property:

### 1. Update the Type Definition

In `src/compiler/ir/types.ts`, add to the `IntrinsicPropertyName` union:

```typescript
export type IntrinsicPropertyName =
  | 'index'
  | 'normalizedIndex'
  | 'randomId'
  | 'yourNewIntrinsic'; // Add here
```

### 2. Update the Materializer

In `src/runtime/Materializer.ts`, add a case to `fillBufferIntrinsic()`:

```typescript
function fillBufferIntrinsic(
  intrinsic: IntrinsicPropertyName,
  buffer: ArrayBufferView,
  instance: InstanceDecl
): void {
  const N = typeof instance.count === 'number' ? instance.count : 0;
  const arr = buffer as Float32Array; // or appropriate type

  switch (intrinsic) {
    // ... existing cases ...

    case 'yourNewIntrinsic': {
      // Implement your intrinsic logic here
      for (let i = 0; i < N; i++) {
        arr[i] = computeValue(i, instance);
      }
      break;
    }

    default: {
      const _exhaustive: never = intrinsic;
      throw new Error(`Unknown intrinsic: ${_exhaustive}`);
    }
  }
}
```

### 3. TypeScript Will Enforce Completeness

If you add to the type but forget the materializer case, TypeScript will error:

```
Type 'yourNewIntrinsic' is not assignable to type 'never'.
```

This exhaustive check ensures all intrinsics are implemented at compile time.

## Bounds Checking: The Never Pattern

The materializer uses the "never pattern" for exhaustive checks:

```typescript
default: {
  const _exhaustive: never = intrinsic;
  throw new Error(`Unknown intrinsic: ${_exhaustive}`);
}
```

How it works:
1. TypeScript knows `intrinsic: IntrinsicPropertyName`
2. After handling all union members, only `never` remains
3. If a case is missing, TypeScript errors because the type isn't `never`
4. The runtime error is defensive (should never execute)

This pattern mechanically enforces that all intrinsics are handled.

## Architecture Notes

### Why a Separate FieldExprIntrinsic Type?

Before this system, intrinsics were hacked into `FieldExprSource` using `as any` casts:

```typescript
// OLD (bad)
this.fieldExprs.push({
  kind: 'source',
  domain: domainId('deprecated'),
  sourceId: 'index', // wrong!
  instanceId: instanceId as any, // hack!
  intrinsic: intrinsic as any, // hack!
  type,
} as any);
```

This caused bugs where the materializer read `sourceId` instead of `intrinsic`, returning wrong values.

The new `FieldExprIntrinsic` type is clean:

```typescript
// NEW (good)
this.fieldExprs.push({
  kind: 'intrinsic',
  instanceId,
  intrinsic,
  type,
});
```

No casts, proper types, clear semantics.

## Instance Inference

**Key insight: Intrinsics ARE bound to an instance.**

The `FieldExprIntrinsic` has `instanceId: InstanceId` because intrinsics provide per-element properties FOR that specific instance. Therefore `inferFieldInstance()` returns the instanceId for intrinsics, NOT undefined.

Instance binding rules:
- **intrinsic, array, layout** → return their `instanceId` (they ARE bound to an instance)
- **map, zipSig** → propagate instanceId from input
- **zip** → unify instanceId from inputs (must all be same instance, throws on mismatch)
- **const, broadcast** → `undefined` (truly instance-agnostic)

```typescript
// Example: instance inference
const b = new IRBuilderImpl();
const instance = b.createInstance(DOMAIN_CIRCLE, 10, { kind: 'unordered' });
const indexField = b.fieldIntrinsic(instance, 'index', type);
const mapped = b.fieldMap(indexField, fn, type);

// Both return the same instance
b.inferFieldInstance(indexField) // → instance
b.inferFieldInstance(mapped)     // → instance (propagated from input)
```

This enables the compiler to track which instance a field expression operates over, providing access to:
- `InstanceDecl.domainType` - what kind of elements (circle, shape, etc.)
- `InstanceDecl.count` - how many elements
- `InstanceDecl.layout` - spatial arrangement

## Testing

To verify intrinsics work correctly:

1. **Compile-time**: Try using an invalid intrinsic name - should get TypeScript error
2. **Runtime**: Load a patch that uses intrinsics - verify correct values
3. **Exhaustiveness**: Comment out a case in fillBufferIntrinsic() - should get TypeScript error

## Related Files

- `src/compiler/ir/types.ts` - Type definitions
- `src/compiler/ir/IRBuilder.ts` - Interface declaration
- `src/compiler/ir/IRBuilderImpl.ts` - Implementation
- `src/runtime/Materializer.ts` - Runtime evaluation
- `src/blocks/array-blocks.ts` - Example usage
- `src/blocks/instance-blocks.ts` - Example usage
