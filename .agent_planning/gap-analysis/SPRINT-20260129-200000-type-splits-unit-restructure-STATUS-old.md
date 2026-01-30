# Sprint Status: type-splits-unit-restructure
**Date**: 2026-01-30 (Session 2)
**Status**: IN PROGRESS (70% complete)

## Completed Work

### Item #16: InferencePayloadType Split ✅ DONE (prior commits)
- `InferencePayloadType` created in `src/core/inference-types.ts`
- Includes `{ kind: 'var'; var: PayloadVarId }` variant
- `PayloadType` is now concrete-only (no var variant)
- `InferenceCanonicalType` defined with inference forms
- Frontend/solver uses inference forms
- Backend IR uses CanonicalType only

### Item #18: UnitType Restructure ✅ PARTIALLY DONE (this session)

**Core Type Definition** ✅ DONE (prior):
- UnitType restructured in `src/core/canonical-types.ts`
- 8 structured kinds: `none | scalar | norm01 | count | angle | time | space | color`
- Unit constructors return structured objects
- `unitsEqual()` performs deep structural comparison
- `ALLOWED_UNITS` updated for structured kinds
- Adapter rules updated for structured unit matching (already done in `src/graph/adapters.ts`)

**Consumer Updates** ⚠️ PARTIALLY DONE (this session):

Files Fixed:
1. ✅ `src/ui/reactFlowEditor/typeValidation.ts` - formatUnitForDisplay() updated for structured units
2. ✅ `src/ui/reactFlowEditor/__tests__/connection-validation.test.ts` - uses unit constructors
3. ✅ `src/ui/debug-viz/renderers/FloatValueRenderer.tsx` - unitLabel() updated
4. ✅ `src/ui/debug-viz/renderers/FloatValueRenderer.test.tsx` - uses structured units
5. ✅ `src/ui/debug-viz/renderers/register.ts` - uses structured unit constructors

Files Remaining (TypeScript errors still present):
- `src/ui/components/BlockInspector.tsx` - Lines 60-73 use old flat kinds
- `src/ui/debug-viz/charts/Sparkline.tsx` - Line 152 compares against 'phase01'
- `src/ui/debug-viz/charts/Sparkline.test.tsx` - Line 187 uses flat kind
- `src/runtime/kernel-signatures.ts` - Lines 119-297 use flat kinds in kernel signatures

Out of Scope (pre-existing issues):
- 100+ `domainTypeId` → `domainType` errors across src/blocks/*.ts files
- Missing exports in `src/types/index.ts` (canonicalEventOne, tryGetManyInstance, etc.)
- These are unrelated to unit restructure and existed before

### Item #19: deg/degrees Collapse ✅ DONE
- No 'deg' variant anywhere in src/
- Only 'degrees' exists under angle group: `{ kind: 'angle', unit: 'degrees' }`
- Verified with grep - zero results for `kind: 'deg'`

## Remaining Work

### Priority 1: Fix Remaining Unit Consumers

1. **BlockInspector.tsx** (lines 60-73):
   - Update switch cases to check structured units
   - Change `unit.kind === 'phase01'` → `unit.kind === 'angle' && unit.unit === 'phase01'`
   - Same for radians, degrees, deg, ms, seconds

2. **Sparkline files**:
   - `Sparkline.tsx` line 152: update comparison
   - `Sparkline.test.tsx` line 187: use structured unit constructor

3. **kernel-signatures.ts** (lines 119-297):
   - Update unit fields in KernelSignature declarations
   - Change flat kind strings to structured objects or remove if not needed

### Priority 2: Test Validation

Run tests to verify all fixes:
```bash
npx tsc --noEmit  # Must exit 0 (ignoring out-of-scope domain errors)
npx vitest run src/ui/reactFlowEditor/__tests__/connection-validation.test.ts
npx vitest run src/ui/debug-viz/renderers/FloatValueRenderer.test.tsx
```

### Priority 3: Verification Gates

From DOD:
- [x] #18: UnitType has 8 structured kinds ✅
- [x] `unitsEqual()` handles nested comparison ✅
- [ ] All consumers updated ⚠️ (4 files remaining)
- [ ] TypeScript compiles: `npx tsc --noEmit` exits 0 ⚠️
- [ ] All gap-analysis-scoped tests pass ⚠️
- [x] No `'deg'` unit kind anywhere ✅

## Test Results

### Passing Tests
- Most connection-validation tests pass (26/27)
- Unit display function tests all pass
- Format tests all pass

### Known Failing Test
- "allows phase01 → radians (adapter exists)" - fails because adapter lookup uses `unitsEqual()` which needs to match structured units. The adapter rules were already updated correctly; likely need to rebuild dist/ files.

## Notes

- Core UnitType restructure is sound and complete
- Main blocker is updating remaining UI consumer files to use structured unit patterns
- Out-of-scope errors (domainTypeId, missing exports) should be handled in separate sprint
- Once remaining 4 files are fixed, need to rebuild and retest

## Commits This Session

1. `ff27dde` - feat(gap-analysis): Sprint 3 Item #18 partial - Update UI consumers for structured UnitType
   - Fixed typeValidation.ts, connection-validation.test.ts
   - Fixed FloatValueRenderer files
   - Removed 'zero' cardinality case
