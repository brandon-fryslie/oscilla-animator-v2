# Definition of Done: intrinsic-types

**Sprint**: Proper Type System for Intrinsic Values
**Generated**: 2026-01-19

## Acceptance Criteria

### Type System (P0-P2)

- [ ] `IntrinsicPropertyName` type exists as closed union of valid intrinsic names
- [ ] `FieldExprIntrinsic` interface exists with `kind: 'intrinsic'`
- [ ] `FieldExpr` union includes `FieldExprIntrinsic`
- [ ] `IRBuilder.fieldIntrinsic()` signature uses `IntrinsicPropertyName`
- [ ] `IRBuilderImpl.fieldIntrinsic()` creates proper `FieldExprIntrinsic`
- [ ] No `as any` casts in `fieldIntrinsic()` implementation
- [ ] `inferFieldDomain()` handles `'intrinsic'` case

### Materializer (P3-P4)

- [ ] `case 'intrinsic':` exists in main materialize switch
- [ ] `fillBufferIntrinsic()` function exists with exhaustive switch
- [ ] All five intrinsics implemented: `index`, `normalizedIndex`, `randomId`, `position`, `radius`
- [ ] Exhaustive check uses `never` type for compile-time safety
- [ ] No `as any` casts in source/intrinsic handling
- [ ] Old `case 'source':` still works for backward compatibility

### Block Files (P5)

- [ ] All block files using `fieldIntrinsic()` compile without errors
- [ ] No type assertion workarounds needed

### Documentation (P6)

- [ ] `.claude/rules/compiler/intrinsics.md` exists
- [ ] Documents all valid intrinsic names
- [ ] Explains how to add new intrinsics
- [ ] Explains exhaustive switch pattern

### Verification (P7)

- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] Demo patch renders particles correctly
- [ ] Position range is [0, 1] (not [-10, 11])
- [ ] Grep for `as any` in intrinsic-related code returns no results

## How to Test

1. **Type safety**: Try adding invalid intrinsic name in a block - should get compile error
2. **Exhaustiveness**: Comment out a case in `fillBufferIntrinsic()` - should get compile error
3. **Runtime**: Load demo patch, verify particles render in correct positions
4. **Bounds check**: Search codebase for `as any` near `intrinsic` - should find none

## Not In Scope

- Adding new intrinsic types beyond the current five
- Migrating old serialized IR programs (not applicable - runtime only)
- Performance optimization of intrinsic materialization
