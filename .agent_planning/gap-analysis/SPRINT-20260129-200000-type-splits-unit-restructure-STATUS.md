# Sprint Status: Type Splits + Unit Restructure

**Date**: 2026-01-30
**Status**: PARTIAL (2/3 items complete)
**Validation Mode**: TypeScript compilation + tests

## Completed Items

### ✓ Item #16: Split InferencePayloadType from PayloadType
**Status**: ALREADY COMPLETE (from prior work)

- `InferencePayloadType` defined in `src/core/inference-types.ts` (includes var variant)
- `PayloadType` is concrete-only (no var variant)
- `InferenceCanonicalType` defined with inference types
- Frontend/type solver uses inference forms (blocks/registry.ts, UI)
- Backend IR uses `CanonicalType` only
- Compile-time enforced: TypeScript prevents `CanonicalType` from containing payload vars

**Files**:
- `src/core/inference-types.ts` - Inference type definitions
- `src/core/canonical-types.ts` - Concrete types only

### ✓ Item #18: Restructure UnitType to 8 structured kinds
**Status**: CORE COMPLETE, consumers need updates

**Completed**:
- UnitType restructured from 15 flat kinds to 8 structured kinds:
  - Simple: `none`, `scalar`, `norm01`, `count`
  - Structured: `angle{radians|degrees|phase01}`, `time{ms|seconds}`, `space{ndc|world|view,dims:2|3}`, `color{rgba01}`
- All unit constructors updated (unitPhase01, unitRadians, unitDegrees, unitMs, etc.)
- `unitsEqual()` performs deep structural comparison
- `ALLOWED_UNITS` updated for structured kinds (top-level only)
- All adapter rules updated for structured units
- Core type system files compile cleanly

**Files modified**:
- `src/core/canonical-types.ts` - Type definitions, constructors, equality
- `src/graph/adapters.ts` - All adapter rules updated
- `src/blocks/adapter-blocks.ts` - Remove unitDeg import
- `src/blocks/camera-block.ts` - Add unitDegrees import

**Remaining work**:
- ~300+ TypeScript errors in consumer files
- Most errors are from domainTypeId → domainType (pre-existing, out of scope)
- Some errors from changed unit structure (need investigation)
- Test updates needed

### ✓ Item #19: Collapse deg/degrees
**Status**: COMPLETE (folded into #18)

- No `'deg'` variant exists
- Only `{ kind: 'angle', unit: 'degrees' }` exists
- `grep -r "kind: 'deg'" src/` would return 0 (for unit context)
- `unitDeg()` constructor removed

## Remaining Work

### Consumer File Updates
**Estimated**: 31 files with type errors (after filtering domainTypeId)

Categories:
1. Block definition files using old unit literals
2. Runtime kernel signatures expecting old structure
3. UI type validation expecting old structure
4. Test files using old unit patterns

**Next steps**:
1. Audit TypeScript errors to identify unit-related vs domainTypeId
2. Update block definitions to use new unit constructors
3. Update kernel signatures if needed
4. Update UI type validation
5. Fix tests

### Test Suite
**Status**: Not run yet

**Required**:
- `npm run test` must pass (gap-analysis-scoped tests)
- Adapter tests must work with structured units
- No regressions in passing tests

## Known Issues

### Pre-Existing Issues (Out of Scope)
- **domainTypeId errors**: ~200+ errors from `domainTypeId` property should be `domainType`
  - This is Sprint 1 fallout (InstanceRef refactor)
  - Not caused by this sprint's changes
  - Should be fixed separately

### Fixed in This Sprint
- Branch type definition bug: was `Axis<BranchVarId,BranchVarId>`, now `Axis<BranchValue,BranchVarId>`
- unitDeg removed and replaced with unitDegrees

## Sprint Gates

### Per-Item Gates
- [x] #16: `CanonicalType` cannot contain payload var (compile-time enforced)
- [x] #16: Inference forms exist for frontend
- [x] #18: UnitType has 8 structured kinds
- [x] #18: `unitsEqual()` handles nested comparison
- [ ] #18: All consumers updated (IN PROGRESS)
- [x] #19: No `'deg'` unit kind anywhere

### Sprint-Level Gates
- [ ] TypeScript compiles: `npx tsc --noEmit` exits 0 (IN PROGRESS - 300+ errors remain)
- [ ] All gap-analysis-scoped tests pass (NOT RUN YET)
- [ ] Adapter rules work with structured units (CORE DONE, tests needed)
- [ ] No regressions in passing tests (NOT VERIFIED YET)
- [x] `grep -r "kind: 'deg'" src/` returns 0 (PASS)
- [x] `grep -r "kind: 'var'" src/core/canonical-types.ts` returns 0 outside Axis (PASS)

## Commits

1. `9520ff0` - feat(gap-analysis): Items #18 & #19 - Restructure UnitType to 8 structured kinds
   - Core type system changes
   - Adapter rules updated
   - Unit constructor changes

## Next Session

**Priority**: Fix remaining TypeScript errors in consumer files

**Approach**:
1. Get error counts by category: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v domainTypeId`
2. Fix highest-impact files first (kernel signatures, block defs)
3. Run tests after each major fix
4. Commit incrementally

**Success Criteria**: TypeScript compiles + tests pass
