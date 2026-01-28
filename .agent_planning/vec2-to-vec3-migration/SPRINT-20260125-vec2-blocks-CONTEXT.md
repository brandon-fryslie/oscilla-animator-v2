# Implementation Context: vec2 to vec3 Migration

## Files to Modify

### Block Definitions
- `src/blocks/geometry-blocks.ts`
  - DELETE: CircularLayout (~lines 71-131)
  - MODIFY: PolarToCartesian (lines ~15-65) → vec3 output
  - MODIFY: OffsetPosition (lines ~138-187) → rename to OffsetVec, vec3 I/O

- `src/blocks/path-operators-blocks.ts`
  - MODIFY: LayoutAlongPath (lines ~133-235) → vec3 outputs, add normals

### Kernels
- `src/runtime/FieldKernels.ts`
  - MODIFY: circleLayout kernel → stride 3

- `src/runtime/SignalKernels.ts` (if exists)
  - CHECK: polarToCartesian kernel location
  - MODIFY: offsetPosition → offsetVec

- `src/runtime/kernel-signatures.ts`
  - UPDATE: All affected kernel signatures

- `src/runtime/Materializer.ts`
  - UPDATE: Comments in header
  - CHECK: position intrinsic handling

### Infrastructure
- `src/compiler/domain-registry.ts`
  - MODIFY: position intrinsic type → vec3

### Tests
- `src/blocks/__tests__/cardinality-metadata.test.ts`
  - May need updates if block names change

## Implementation Order

1. **Delete CircularLayout** - Cleanest first, removes dead code
2. **Update kernels** - Foundation for block changes
3. **Update domain-registry intrinsic** - Infrastructure change
4. **Migrate PolarToCartesian** - Simple output change
5. **Migrate OffsetPosition → OffsetVec** - Similar to JitterVec pattern
6. **Migrate LayoutAlongPath** - Most complex (adds normals output)
7. **Verify demo patches** - Final validation

## Patterns to Follow

### Kernel Output Change (vec2 → vec3)

```typescript
// Before (stride 2)
for (let i = 0; i < N; i++) {
  outArr[i * 2 + 0] = x;
  outArr[i * 2 + 1] = y;
}

// After (stride 3)
for (let i = 0; i < N; i++) {
  outArr[i * 3 + 0] = x;
  outArr[i * 3 + 1] = y;
  outArr[i * 3 + 2] = 0; // z=0 for 2D operations
}
```

### Block Port Type Change

```typescript
// Before
outputs: {
  pos: { label: 'Position', type: canonicalType('vec2') },
}

// After
outputs: {
  pos: { label: 'Position', type: canonicalType('vec3') },
}
```

### Adding Z Parameter (OffsetVec pattern)

```typescript
inputs: {
  posIn: { label: 'Position', type: canonicalType('vec3') },
  amountX: { ... },
  amountY: { ... },
  amountZ: {
    label: 'Amount Z',
    type: canonicalType('float'),
    defaultSource: defaultSourceConst(0.0),
    uiHint: { kind: 'slider', min: -0.5, max: 0.5, step: 0.01 }
  },
  rand: { ... },
}
```

## Normal Convention for LayoutAlongPath

For a circular path in the XY plane:
- **Counter-clockwise winding**: Normal = (0, 0, 1) pointing "up" in Z
- **Clockwise winding**: Normal = (0, 0, -1) pointing "down" in Z

The current MVP circle layout is counter-clockwise (angle increases from 0 to 2π), so normals should be (0, 0, 1).

## Reference: JitterVec Implementation

The JitterVec migration (already complete) is the pattern to follow:
- Block: src/blocks/field-operations-blocks.ts
- Kernel: src/runtime/FieldKernels.ts (fieldJitterVec)
- Signature: src/runtime/kernel-signatures.ts

## Grep Commands for Verification

```bash
# Find remaining vec2 position usages (should only be control points)
grep -r "canonicalType('vec2')" src/blocks/ | grep -v control

# Verify control points still use vec2
grep -r "vec2.*control" src/blocks/

# Check kernel stride usage
grep -r "i \* 2" src/runtime/
```
