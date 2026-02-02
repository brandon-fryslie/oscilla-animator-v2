# Definition of Done: Pure Scalar Lenses
Generated: 2026-02-01
Status: COMPLETE

## Completion Criteria

### All Lens Blocks
- [x] Each lens block registers with `category: 'lens'`
- [x] Each lens block has NO `adapterSpec` (never auto-inserted)
- [x] Each lens block has `capability: 'pure'`, `cardinalityMode: 'preserve'`
- [x] Each lens block has a working `lower` function
- [x] Each lens block preserves input type (output type == input type for value shapers)

### Infrastructure
- [x] `lensUtils.ts` discovers both `'adapter'` and `'lens'` categories
- [x] `src/blocks/lens/index.ts` exists and is imported from `src/blocks/all.ts`
- [x] Lens blocks appear in PortContextMenu lens picker (via getAvailableLensTypes)

### Tests
- [x] Unit tests verify each lens's mathematical behavior
- [x] Tests verify lens blocks are discoverable via `getAvailableLensTypes()`
- [x] Existing adapter tests still pass unchanged

### Type Safety
- [x] `npm run typecheck` passes (no lens-related errors)
- [x] No `any` casts in lens code
- [x] All tests pass: `npm run test` (2122 passed)

### Verification
- [x] Lens blocks are registered and discoverable
- [x] Lens expansion infrastructure already in place from Sprint 2
- [x] Lower functions produce valid IR (verified by tests)

## Implementation Summary

Implemented six pure scalar lens blocks:
1. **ScaleBias**: `y = x * scale + bias` - fundamental value transformation
2. **Clamp**: `y = clamp(x, min, max)` - bounds enforcement
3. **Wrap01**: `y = fract(x)` - phase wrapping without type change
4. **StepQuantize**: `y = round(x/step)*step` - discretize to step grid
5. **Smoothstep**: `y = smoothstep(edge0, edge1, x)` - S-curve remap
6. **PowerGamma**: `y = pow(clamp01(x), gamma)` - gamma curve control

All blocks follow the lens architecture established in Sprint 2:
- Category 'lens' (distinct from 'adapter')
- No adapterSpec (user-controlled only)
- Preserve cardinality and type
- Pure functions with config parameters

Files created:
- `src/blocks/lens/scale-bias.ts`
- `src/blocks/lens/clamp.ts`
- `src/blocks/lens/wrap01.ts`
- `src/blocks/lens/step-quantize.ts`
- `src/blocks/lens/smoothstep.ts`
- `src/blocks/lens/power-gamma.ts`
- `src/blocks/lens/index.ts`
- `src/blocks/lens/__tests__/pure-lenses.test.ts`

Files modified:
- `src/blocks/all.ts` (added lens import)
- `src/ui/reactFlowEditor/lensUtils.ts` (discovers both categories)

Commit: bc2adb2 "feat(lens): implement pure scalar lens blocks"
