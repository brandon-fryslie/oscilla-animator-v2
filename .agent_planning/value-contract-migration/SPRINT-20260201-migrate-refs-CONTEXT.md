# Implementation Context: Migrate References Sprint
Generated: 2026-02-01

## Migration Strategy

### Two approaches for the block file migration:

**Approach A: Convenience function facade**
Keep `unitNorm01()` and `unitPhase01()` names but change their return type to produce a `{ unit, contract }` pair. Then introduce a new `canonicalType` overload or helper that accepts this pair.

Pros: Minimal call-site changes in ~30 block files.
Cons: Hides the architectural change behind old names. Creates a weird intermediate type.

**Approach B: Explicit migration (RECOMMENDED)**
Remove `unitNorm01()` and `unitPhase01()` entirely. All call sites change explicitly.
Provide new convenience constructors:
- `scalarClamp01()` → returns a { unit: scalar, contract: clamp01 } config
- `angleTurns()` → returns a { unit: angle/turns, contract: wrap01 } config
Or just use `canonicalType(FLOAT, unitScalar(), undefined, contractClamp01())` everywhere.

Pros: No hidden magic. Every call site says what it means.
Cons: ~80 call sites need updating.

### Recommended: Hybrid approach

1. Create new helper functions that produce full CanonicalType:
```typescript
// Sugar for common patterns:
function scalarNorm01Signal(): CanonicalType  // float, scalar, clamp01, signal
function phase01Signal(): CanonicalType       // float, angle/turns, wrap01, signal
```

2. Remove `unitNorm01()` and `unitPhase01()` from UnitType constructors.

3. For block definitions, update the `canonicalType()` constructor signature to accept contract:
```typescript
canonicalType(payload, unit?, extentOverrides?, contract?)
```
Then block files become:
```typescript
// Before:
type: canonicalType(FLOAT, unitNorm01())
// After:
type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01())
```

## Files by Category

### Core (6 files)
- `src/core/canonical-types/units.ts` — Remove norm01, rename phase01→turns
- `src/core/canonical-types/payloads.ts` — Update ALLOWED_UNITS
- `src/core/canonical-types/canonical-type.ts` — Already modified in Sprint 1
- `src/core/canonical-types/equality.ts` — Already modified in Sprint 1
- `src/core/canonical-types/index.ts` — Update exports
- `src/core/inference-types.ts` — Already modified in Sprint 1

### Adapter Blocks (6 files)
- `src/blocks/adapter/scalar-to-norm01-clamp.ts`
- `src/blocks/adapter/norm01-to-scalar.ts`
- `src/blocks/adapter/scalar-to-phase.ts`
- `src/blocks/adapter/phase-to-scalar.ts`
- `src/blocks/adapter/radians-to-phase.ts`
- `src/blocks/adapter/phase-to-radians.ts`

### Block Definitions (~30 files)
See exploration report for full list. Key files:
- `src/blocks/signal/oscillator.ts` (7 refs)
- `src/blocks/signal/phasor.ts` (4 refs)
- `src/blocks/signal/lag.ts` (3 refs)
- `src/blocks/color/make-color-hsl.ts` (4 refs)
- `src/blocks/color/split-color-hsl.ts` (5 refs)
- `src/blocks/color/color-picker.ts` (4 refs)
- `src/blocks/color/mix-color.ts` (2 refs)
- `src/blocks/color/alpha-multiply.ts` (3 refs)
- `src/blocks/field/field-const-color.ts` (8 refs)
- `src/blocks/instance/array.ts` (2 refs)
- `src/blocks/time/infinite-time-root.ts` (4 refs)
- `src/blocks/layout/circle-layout-uv.ts` (3 refs)
- `src/blocks/render/camera.ts` (2 refs)
- `src/blocks/lens/slew.ts` (3 refs)

### UI Components (~6 files)
- `src/ui/components/BlockInspector.tsx`
- `src/ui/reactFlowEditor/typeValidation.ts`
- `src/ui/reactFlowEditor/lensUtils.ts`
- `src/ui/debug-viz/renderers/FloatValueRenderer.tsx`
- `src/ui/debug-viz/charts/Sparkline.tsx`
- `src/ui/debug-viz/renderers/register.ts`

### Tests (~12 files)
- `src/blocks/__tests__/adapter-spec.test.ts`
- `src/blocks/__tests__/varargs.test.ts`
- `src/blocks/color/__tests__/color-blocks.test.ts`
- `src/ui/reactFlowEditor/__tests__/connection-validation.test.ts`
- `src/ui/reactFlowEditor/__tests__/lensUtils.test.ts`
- `src/compiler/passes-v2/__tests__/unit-validation.test.ts`
- `src/ui/debug-viz/ValueRenderer.test.ts`
- `src/ui/debug-viz/renderers/FloatValueRenderer.test.tsx`
- `src/ui/debug-viz/charts/Sparkline.test.tsx`
- `src/graph/__tests__/Patch-varargs.test.ts`
- `src/graph/__tests__/pass2-adapters.test.ts`
- `src/graph/passes/__tests__/pass4-varargs.test.ts`
- `src/__tests__/type-test-helpers.ts`
- `src/compiler/backend/derive-time-model.ts`

## Verification

After all changes:
1. `npx tsc --noEmit` — zero errors from modified files
2. `npm run test` — all 2091+ tests pass
3. `grep -r "norm01\|phase01" src/ --include="*.ts" | grep -v node_modules` — zero hits (except possibly comments)
