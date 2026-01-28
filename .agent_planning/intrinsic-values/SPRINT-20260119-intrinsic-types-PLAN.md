# Sprint: intrinsic-types - Proper Type System for Intrinsic Values

**Generated**: 2026-01-19
**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION

## Sprint Goal

Eliminate unsafe `as any` casts by creating a proper `FieldExprIntrinsic` type, implement exhaustive bounds checking, and document the intrinsic system.

## Scope

**Deliverables:**
1. New `FieldExprIntrinsic` type with closed intrinsic name enum
2. Updated IRBuilder implementation without unsafe casts
3. Materializer with exhaustive intrinsic handling
4. Missing intrinsic implementations (randomId, position, radius)
5. Documentation in `.claude/rules/`

## Work Items

### P0: Define FieldExprIntrinsic Type

**File**: `src/compiler/ir/types.ts`

**Acceptance Criteria:**
- [ ] `IntrinsicPropertyName` type defined as closed union: `'index' | 'normalizedIndex' | 'randomId' | 'position' | 'radius'`
- [ ] `FieldExprIntrinsic` interface defined with `kind: 'intrinsic'`, `instanceId: InstanceId`, `intrinsic: IntrinsicPropertyName`, `type: CanonicalType`
- [ ] `FieldExpr` union updated to include `FieldExprIntrinsic`
- [ ] Existing `FieldExprSource` kept unchanged for backward compatibility

**Technical Notes:**
```typescript
export type IntrinsicPropertyName =
  | 'index'
  | 'normalizedIndex'
  | 'randomId'
  | 'position'
  | 'radius';

export interface FieldExprIntrinsic {
  readonly kind: 'intrinsic';
  readonly instanceId: InstanceId;
  readonly intrinsic: IntrinsicPropertyName;
  readonly type: CanonicalType;
}
```

### P1: Update IRBuilder Implementation

**File**: `src/compiler/ir/IRBuilderImpl.ts`

**Acceptance Criteria:**
- [ ] `fieldIntrinsic()` creates `FieldExprIntrinsic` with `kind: 'intrinsic'`
- [ ] No `as any` casts in the implementation
- [ ] No placeholder values (`domain: 'deprecated'`, `sourceId: 'index'`)
- [ ] `inferFieldDomain()` handles `'intrinsic'` case (returns undefined)

**Technical Notes:**
```typescript
fieldIntrinsic(instanceId: InstanceId, intrinsic: IntrinsicPropertyName, type: CanonicalType): FieldExprId {
  const id = fieldExprId(this.fieldExprs.length);
  this.fieldExprs.push({
    kind: 'intrinsic',
    instanceId,
    intrinsic,
    type,
  });
  return id;
}
```

### P2: Update IRBuilder Interface

**File**: `src/compiler/ir/IRBuilder.ts`

**Acceptance Criteria:**
- [ ] `fieldIntrinsic()` signature updated to use `IntrinsicPropertyName` instead of `string`
- [ ] Documentation updated to list valid intrinsic names

### P3: Update Materializer with Exhaustive Handling

**File**: `src/runtime/Materializer.ts`

**Acceptance Criteria:**
- [ ] New `case 'intrinsic':` added to main switch
- [ ] `fillBufferIntrinsic()` function created with exhaustive switch on intrinsic names
- [ ] Remove `as any` cast from existing source case
- [ ] TypeScript exhaustiveness check ensures all intrinsics are handled
- [ ] Runtime error thrown for unknown intrinsic (defensive, should never hit due to types)

**Technical Notes:**
```typescript
case 'intrinsic': {
  fillBufferIntrinsic(expr.intrinsic, buffer, instance);
  break;
}

function fillBufferIntrinsic(
  intrinsic: IntrinsicPropertyName,
  buffer: ArrayBufferView,
  instance: InstanceDecl
): void {
  const N = typeof instance.count === 'number' ? instance.count : 0;
  const arr = buffer as Float32Array;

  switch (intrinsic) {
    case 'index':
      for (let i = 0; i < N; i++) arr[i] = i;
      break;
    case 'normalizedIndex':
      for (let i = 0; i < N; i++) arr[i] = N > 1 ? i / (N - 1) : 0;
      break;
    case 'randomId':
      // Deterministic per-element random
      for (let i = 0; i < N; i++) arr[i] = pseudoRandom(i);
      break;
    case 'position':
      // Layout-based position (vec2)
      fillLayoutPosition(buffer, instance);
      break;
    case 'radius':
      // Layout-based radius
      fillLayoutRadius(buffer, instance);
      break;
    default:
      const _exhaustive: never = intrinsic;
      throw new Error(`Unknown intrinsic: ${_exhaustive}`);
  }
}
```

### P4: Implement Missing Intrinsics

**File**: `src/runtime/Materializer.ts`

**Acceptance Criteria:**
- [ ] `randomId` implemented with deterministic per-element random (seeded by index)
- [ ] `position` implemented using instance layout (similar to existing fillBufferSource pos0)
- [ ] `radius` implemented (constant or layout-derived)

### P5: Update Block Files

**Files**: All files using `fieldIntrinsic()`

**Acceptance Criteria:**
- [ ] `array-blocks.ts` compiles without type errors
- [ ] `instance-blocks.ts` compiles without type errors
- [ ] `identity-blocks.ts` compiles without type errors
- [ ] `geometry-blocks.ts` compiles without type errors
- [ ] `field-operations-blocks.ts` compiles without type errors
- [ ] All intrinsic strings are valid `IntrinsicPropertyName` values

### P6: Documentation

**File**: `.claude/rules/compiler/intrinsics.md`

**Acceptance Criteria:**
- [ ] Document what intrinsics are and their purpose
- [ ] List all valid intrinsic names with descriptions
- [ ] Explain how to add a new intrinsic (type, IRBuilder, Materializer)
- [ ] Document the exhaustive switch pattern for bounds checking
- [ ] Reference spec document if applicable

**Template:**
```markdown
---
paths: src/compiler/**/*.ts, src/runtime/Materializer.ts
---

# Field Intrinsics

**Spec Reference**: `design-docs/spec/XX-intrinsics.md` (if exists)

## What Are Intrinsics?

Intrinsics are per-element properties that are automatically available
for any instance (array of elements). They provide element identity and
layout information without explicit computation.

## Valid Intrinsic Names

| Name | Type | Description |
|------|------|-------------|
| `index` | int | Element index (0, 1, 2, ..., N-1) |
| `normalizedIndex` | float | Normalized index (0.0 to 1.0) |
| `randomId` | float | Deterministic per-element random (0.0 to 1.0) |
| `position` | vec2 | Layout-derived position |
| `radius` | float | Layout-derived radius |

## Adding a New Intrinsic

1. Add to `IntrinsicPropertyName` union in `types.ts`
2. Add case to `fillBufferIntrinsic()` in `Materializer.ts`
3. TypeScript will error until all switches are exhaustive

## Bounds Checking

The `IntrinsicPropertyName` type is a closed union. Invalid intrinsic
names cause compile-time errors. The Materializer uses an exhaustive
switch with a `never` check to ensure all cases are handled.
```

### P7: Verification

**Acceptance Criteria:**
- [ ] `npm run typecheck` passes with no errors
- [ ] `npm run build` succeeds
- [ ] Demo patch renders correctly (particles in [0, 1] range)
- [ ] No `as any` casts remain in intrinsic-related code

## Dependencies

- None - this is self-contained refactoring

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking existing IR programs | Keep FieldExprSource unchanged; intrinsic is new kind |
| Missing intrinsic usage | TypeScript will catch invalid intrinsic names |
| Runtime errors for unhandled intrinsics | Exhaustive switch + never check |
