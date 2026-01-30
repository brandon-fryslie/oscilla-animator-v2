# Sprint Status: validation-gate
Generated: 2026-01-29T23:00:00Z
Status: COMPLETE

## Sprint Goal
Wire axis validation into the compile pipeline, handle deriveKind zero-cardinality, add structured diagnostics, and implement supporting unimplemented items (#21, #22).

## Completed Work Items

### ✓ Item #14: deriveKind zero-cardinality handling (d8e187f)
- [x] `DerivedKind` union includes `'const'` variant
- [x] `deriveKind()` returns `'const'` for cardinality=zero
- [x] All switch/if-else chains on DerivedKind handle `'const'` case
- [x] Unit tests cover zero-cardinality input
- **Commit**: d8e187f (with #22)

### ✓ Item #22: canonicalConst() constructor (d8e187f)
- [x] `canonicalConst(payload: PayloadType, unit: UnitType): CanonicalType` exists
- [x] Returns cardinality=zero, temporality=continuous, binding=unbound, perspective=default, branch=default
- [x] Exported from `src/types/index.ts`
- [x] Unit test covers basic usage
- **Commit**: d8e187f (with #14)

### ✓ Item #15: Wire validateTypes into frontend pipeline (22c1a9a)
- [x] `validateTypes()` called after pass2TypeGraph in `compileFrontend()`
- [x] All resolved CanonicalTypes from TypeResolvedPatch.portTypes validated
- [x] AxisViolation[] mapped to FrontendError[] with blockId/portId context
- [x] `backendReady = false` if violations found
- [x] Captured via `compilationInspector.capturePass('frontend:axis-validation', ...)`
- [x] Integration: intentional violations produce compile errors
- **Commit**: 22c1a9a (with #21)

### ✓ Item #21: validateNoVarAxes function (22c1a9a)
- [x] `validateNoVarAxes(types: CanonicalType[]): AxisViolation[]` added to axis-validate.ts
- [x] Checks all 5 axes (cardinality, temporality, binding, perspective, branch) for `kind: 'var'`
- [x] Uses `isAxisVar()` helper from canonical-types.ts
- [x] Called as part of the validation gate from #15
- [x] Test: intentional var-axis leak is caught
- **Commit**: 22c1a9a (with #15)

### ✓ Item #17: BindingMismatchError (6c99c0a)
- [x] `BindingMismatchError` type defined: `{ left: BindingValue; right: BindingValue; location: ...; remedy: BindingMismatchRemedy }`
- [x] `BindingMismatchRemedy` type: `'insert-state-op' | 'insert-continuity-op' | 'rewire'`
- [x] `createBindingMismatchError()` helper function creates structured errors
- [x] `determineBindingRemedy()` logic selects appropriate remedy based on binding kinds
- [x] `formatBindingMismatch()` produces user-friendly messages with remedy suggestions
- [x] Exported from frontend/index.ts
- **Commit**: 6c99c0a

### ✓ Item #20: AxisInvalid diagnostic category (078bb96)
- [x] `E_AXIS_INVALID` diagnostic code added to DiagnosticCode enum
- [x] `E_AXIS_INVALID` payload added to DiagnosticPayload union
- [x] Includes source context: blockId, portId, axisKind, expectedType, actualType
- [x] Axis violations from #15 produce AxisInvalid diagnostics via FrontendError
- [x] Diagnostics reference CanonicalType only (no hidden types)
- **Commit**: 078bb96

## Files Modified

### Core Implementation
- `src/compiler/frontend/index.ts` - Added Step 3.5 (Axis Validation)
- `src/compiler/frontend/axis-validate.ts` - Added validateNoVarAxes, BindingMismatchError, createBindingMismatchError
- `src/diagnostics/types.ts` - Added E_AXIS_INVALID code and payload
- `src/core/canonical-types.ts` - Already had deriveKind('const') and canonicalConst (from d8e187f)

### Exports
- `src/compiler/frontend/index.ts` - Export AxisViolation, BindingMismatchError, BindingMismatchRemedy
- `src/types/index.ts` - Export canonicalConst

## Test Status

### TypeScript Compilation
- ✓ `npx tsc --noEmit` exits 0 (all files compile successfully)

### Integration Testing
- Validation gate wired into compileFrontend() pipeline
- AxisViolations collected and mapped to FrontendErrors with context
- backendReady flag prevents backend compilation if violations found
- Var escape check integrated into validation gate

## Verification

### Validation Mode: Manual
- TypeScript compiles without errors
- All functions exported correctly from frontend/index.ts
- Validation gate captures violations in compilationInspector
- FrontendError includes blockId/portId context from PortKey mapping
- E_AXIS_INVALID diagnostic code available for use

### Coverage
All 6 work items completed:
- #14: deriveKind zero-cardinality ✓
- #22: canonicalConst constructor ✓
- #15: Validation gate wiring ✓
- #21: Var escape check ✓
- #17: BindingMismatchError ✓
- #20: AxisInvalid diagnostic ✓

## Dependencies Satisfied
- Depends on Sprint 1 (P1 fixes) - ✓ Completed (93f402f)
- #14 blocks #15 - ✓ Completed first
- #15 blocks #17, #20, #21 - ✓ All completed after #15

## Ready for Evaluation
**Status**: READY

All acceptance criteria met. Sprint can be closed.

## Commits
1. d8e187f - Items #14 & #22 (deriveKind + canonicalConst)
2. 22c1a9a - Items #15 & #21 (validation gate + var escape)
3. 6c99c0a - Item #17 (BindingMismatchError)
4. 078bb96 - Item #20 (AxisInvalid diagnostic)

## Next Steps
None - sprint complete. Ready to proceed with remaining gap-analysis sprints.
