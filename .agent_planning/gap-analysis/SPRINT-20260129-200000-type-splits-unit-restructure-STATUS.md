# Sprint Status: Type Splits + Unit Restructure
**Date**: 2026-01-30
**Status**: CORE COMPLETE, consumer updates remaining (~45 errors)

## Summary

**Items**: 3 total
- ✓ Item #16: InferencePayloadType split (COMPLETE - from prior work)
- ✓ Item #18: UnitType restructured (CORE DONE - adapter rules + kernel sigs working, ~45 consumer errors remain)
- ✓ Item #19: deg/degrees collapsed (COMPLETE)

**Completion**: Core type system 100% done, ~45 consumer file errors remain (UI code + type exports + Sprint 1 legacy)

## Completed Items

### ✓ Item #16: Split InferencePayloadType from PayloadType
**Status**: COMPLETE

All acceptance criteria met:
- `InferencePayloadType` defined in `src/core/inference-types.ts`
- `PayloadType` is concrete-only (no var)
- `InferenceCanonicalType` defined
- Frontend uses inference forms
- Backend uses `CanonicalType` only
- Compile-time enforced via TypeScript

### ✓ Item #18: Restructure UnitType to 8 structured kinds
**Status**: CORE COMPLETE

**What's done**:
- UnitType restructured: 15 flat → 8 structured kinds
- Simple: `none`, `scalar`, `norm01`, `count`
- Structured: `angle{radians|degrees|phase01}`, `time{ms|seconds}`, `space{ndc|world|view,dims:2|3}`, `color{rgba01}`
- `unitsEqual()` deep structural comparison (checks nested `unit` and `dims`)
- `ALLOWED_UNITS` updated for top-level kinds
- All 10 adapter rules updated for structured units
- Kernel signatures updated to use full UnitType
- Core type system compiles cleanly
- Fixed Branch type bug (was Axis<BranchVarId,BranchVarId>)

**What remains** (~45 errors):
- UI code using flat unit checks (BlockInspector.tsx, Sparkline.tsx)
- Type alias exports (types/index.ts trying to export *Axis instead of new names)
- Sprint 1 legacy (OUT OF SCOPE - zero/unbound/weak/strong values)

### ✓ Item #19: Collapse deg/degrees
**Status**: COMPLETE

- No `'deg'` variant exists
- Only `{ kind: 'angle', unit: 'degrees' }`
- `unitDeg()` removed
- All usages migrated to `unitDegrees()`

## Sprint Gates

### Per-Item Gates
- [x] #16: CanonicalType cannot contain payload var
- [x] #16: Inference forms exist
- [x] #18: UnitType has 8 structured kinds
- [x] #18: unitsEqual() handles nested comparison
- [ ] #18: All consumers updated (45 errors remain)
- [x] #19: No 'deg' unit kind

### Sprint-Level Gates
- [ ] TypeScript compiles (BLOCKED - 45 errors)
- [ ] Tests pass (BLOCKED - can't run)
- [x] Adapter rules work
- [ ] No regressions (BLOCKED)
- [x] grep 'deg' returns 0
- [x] grep 'var' in canonical-types returns 0 (outside Axis)

## Commits

1. `9520ff0` - Core UnitType restructure + adapter rules
2. `d6cca2e` - Kernel signatures for structured units

## Files Modified

**Core type system** (COMPLETE):
- src/core/canonical-types.ts
- src/core/inference-types.ts
- src/graph/adapters.ts
- src/runtime/kernel-signatures.ts
- src/blocks/adapter-blocks.ts
- src/blocks/camera-block.ts

**Remaining** (~10 files, 45 errors):
- src/ui/components/BlockInspector.tsx
- src/ui/debug-viz/charts/Sparkline.tsx
- src/types/index.ts
- Plus Sprint 1 legacy (OUT OF SCOPE)

## Remaining Work

### Fix UI unit checks (~10 errors)
BlockInspector.tsx and Sparkline.tsx check `unit.kind === 'phase01'`

Need: `unit.kind === 'angle' && unit.unit === 'phase01'`

### Fix type exports (~15 errors)
types/index.ts exports old *Axis names

Should export: Cardinality, Temporality, Binding, Perspective, Branch

### OUT OF SCOPE (~20 errors)
Sprint 1 legacy: zero, unbound, weak, strong, identity axis values
Fix in separate cleanup pass

## Verification

```bash
# No 'deg' kind
grep -r "kind: 'deg'" src/ | grep -v test | wc -l  # 0

# No payload var in canonical
grep "kind: 'var'" src/core/canonical-types.ts | grep -v Axis | wc -l  # 0

# Consumer errors
npx tsc --noEmit 2>&1 | grep error | grep -v domainTypeId | grep -v zero | wc -l  # ~45
```

## Ready for Next Session

**Approach**: Fix remaining ~45 consumer errors
1. Update UI unit checks
2. Fix type exports
3. Run tests
4. Commit final work

**Success**: TypeScript compiles + tests pass
