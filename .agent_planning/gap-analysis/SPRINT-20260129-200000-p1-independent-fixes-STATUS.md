# Sprint 1 Status: P1 Independent Fixes

**Status**: COMPLETE (13/13 items done)
**Date**: 2026-01-30
**Validation Mode**: Manual + automated tests (canonical-types, forbidden-patterns)

## Completed Items

### ✓ #1: Fix canonical-types.test.ts discriminants
- Fixed all test assertions to use 'inst' instead of 'instantiated'/'default'
- Tests now pass with new Axis<T,V> system
- Verified: `npx vitest run src/core/__tests__/canonical-types.test.ts` passes

### ✓ #2: Fix DEFAULTS_V0 perspective/branch
- Changed from strings to PerspectiveValue/BranchValue objects
- `perspective: { kind: 'default' }`
- `branch: { kind: 'default' }`
- Location: `src/core/canonical-types.ts:882-888`

### ✓ #3: Wire constValueMatchesPayload()
- Added validation in `sigConst()` and `fieldConst()`
- Throws error when ConstValue.kind doesn't match payload.kind
- Location: `src/compiler/ir/IRBuilderImpl.ts:118-122, 286-290`

### ✓ #4: Fix payloadStride()
- Return type changed from `1|2|3|4` to `number`
- Exhaustive switch with explicit case for every PayloadType
- No default fall-through, includes never check
- Location: `src/core/canonical-types.ts:342-358`

### ✓ #5: Delete AxisTag
- Removed `type AxisTag<T> = Axis<T, never>` from bridges.ts
- `grep -r 'type AxisTag' src/ | grep -v test` returns 0 results
- Only appears in comments

### ✓ #6: Remove stride field from ConcretePayloadType
- All payload variants no longer have `.stride` field
- `payloadStride()` is now the single authority
- Updated all `.stride` accesses to use `payloadStride()` function
- Verified: `grep "readonly stride:" src/core/canonical-types.ts` returns nothing

### ✓ #7: Remove shape from PayloadType
- Removed `{ kind: 'shape' }` variant from ConcretePayloadType
- Added `SHAPE = FLOAT` placeholder for migration (line 1123)
- Shape data will be modeled as resources (Q6)
- Verified: `grep "kind: 'shape'" src/core/canonical-types.ts` returns nothing

### ✓ #8: CameraProjection closed enum
- Added `type CameraProjection = 'orthographic' | 'perspective'`
- ConstValue uses `value: CameraProjection`
- `cameraProjectionConst()` accepts closed enum
- Location: `src/core/canonical-types.ts:97`

### ✓ #9: Add tryDeriveKind()
- Returns `DerivedKind | null`
- Returns null when any axis is var
- Same logic as deriveKind when all axes are inst
- Location: `src/core/canonical-types.ts:718-731`
- Exported from types/index.ts

### ✓ #10: Lock eventRead output type
- `sigEventRead(eventSlot)` no longer accepts type parameter
- Internally sets type to `canonicalType(FLOAT, unitScalar())`
- Location: `src/compiler/ir/IRBuilderImpl.ts:871-884`
- All callers updated

### ✓ #11: Rename AxisViolation fields
- Changed from `typeIndex: number` to `nodeKind: string; nodeIndex: number`
- Violations now use descriptive node kind (e.g., 'CanonicalType', 'ValueExpr')
- Location: `src/compiler/frontend/axis-validate.ts:29-34`

### ✓ #12: Add deriveKind agreement asserts
- Created `assertKindAgreement()` function in lowerTypes.ts
- Asserts ValueRefPacked discriminant agrees with deriveKind(type)
- Called at lowering boundary in lower-blocks.ts
- Location: `src/compiler/ir/lowerTypes.ts:77-86`
- Usage: `src/compiler/backend/lower-blocks.ts:475`

### ✓ #13: CI forbidden-pattern test
- Created `src/__tests__/forbidden-patterns.test.ts`
- Tests for: AxisTag, payload var outside inference, legacy type names, instanceId on expressions
- All patterns tested with grep-based enforcement
- Verified: `npx vitest run src/__tests__/forbidden-patterns.test.ts` passes

## Validation

### TypeScript Compilation
```bash
npx tsc --noEmit
# Exits 0 - all type errors resolved
```

### Gap Analysis Tests
```bash
npx vitest run src/core/__tests__/canonical-types.test.ts
# ✓ 20 tests pass

npx vitest run src/__tests__/forbidden-patterns.test.ts
# ✓ 4 tests pass
```

### Verification Commands
```bash
# AxisTag removed (should be 0)
grep -r "type AxisTag" src/ | grep -v test | wc -l
# Output: 0

# stride field removed (should be 0)
grep "readonly stride:" src/core/canonical-types.ts | wc -l
# Output: 0

# shape removed from PayloadType (should be 0)
grep "kind: 'shape'" src/core/canonical-types.ts | wc -l
# Output: 0
```

## Known Issues

### Out-of-Scope Test Failures
Several tests in `src/compiler/ir/__tests__/bridges.test.ts` fail because:
1. They test old bridge code expecting shape to exist as a PayloadType
2. They expect perspective/branch to be strings instead of objects

These failures are **out of scope** for gap analysis Sprint 1. The bridges are legacy code that need separate updating. Per DOD instructions, out-of-scope failures should be left as-is.

## Commits

Sprint 1 work was completed in prior commits on `bmf_type_system_refactor` branch:
1. `93f402f` - gap-analysis Sprint 1: Complete all 13 P1 items
2. `d8e187f` - Items #14 & #22 (validation gate + canonicalConst)
3. `22c1a9a` - Item #17 (BindingMismatchError)
4. `6c99c0a` - Item #20 (AxisInvalid diagnostic)
5. `078bb96` - Additional work (zero-cardinality fixes)

## Files Modified

- `src/core/canonical-types.ts` - Core type system changes (#2, #4, #6, #7, #8, #9)
- `src/compiler/ir/IRBuilderImpl.ts` - Validation and eventRead fixes (#3, #10)
- `src/compiler/frontend/axis-validate.ts` - AxisViolation rename (#11)
- `src/compiler/ir/lowerTypes.ts` - deriveKind agreement assert (#12)
- `src/compiler/backend/lower-blocks.ts` - Call assertKindAgreement (#12)
- `src/__tests__/forbidden-patterns.test.ts` - CI enforcement test (#13)
- `src/core/__tests__/canonical-types.test.ts` - Test fixes (#1)
- `src/types/index.ts` - Export tryDeriveKind (#9)

## Summary

✓ **All 13 P1 Items Complete**
- Core type system refactor successful
- All gap analysis resolutions implemented
- TypeScript compilation passes
- Gap analysis tests pass
- Forbidden patterns mechanically enforced

**Ready for Sprint 2**: Proceed with deferred items (valueExpr adapter, validation gate).

## Next Steps

1. **Sprint 2**: Implement deferred items from SPRINT-20260129-200000-valueexpr-adapter-deferred-*
2. **Sprint 3-4**: Additional gap analysis items (if any)
3. **Integration Testing**: Verify all changes work in full compilation pipeline
4. **Resource Graph (Q6)**: Complete shape removal by implementing proper resource system
