# Implementation Context: Missing Lenses Sprint
Generated: 2026-02-01

## Reference: Existing Adapter Block Pattern

All adapter blocks follow the same pattern (see `src/blocks/adapter/scalar-to-phase.ts`):

1. Define block with `defineBlock()` in `src/blocks/adapter/`
2. Single input port and single output port
3. `adapterSpec` property declaring from→to type conversion
4. Kernel uses existing opcodes (Scale, Bias, Wrap01, Clamp, etc.)
5. Export from `src/blocks/adapter/index.ts`

## Files to Create

| File | Block | Type |
|------|-------|------|
| `src/blocks/adapter/scalar-to-norm01-wrap.ts` | Adapter_Wrap01 | Auto-insert adapter |
| `src/blocks/adapter/bipolar-to-unipolar.ts` | Adapter_BipolarToUnipolar | Auto-insert adapter |
| `src/blocks/adapter/unipolar-to-bipolar.ts` | Adapter_UnipolarToBipolar | Auto-insert adapter |
| `src/blocks/signal/normalize-range.ts` | Lens_NormalizeRange | Parameterized lens |
| `src/blocks/signal/denormalize-range.ts` | Lens_DenormalizeRange | Parameterized lens |

## Files to Modify

| File | Change |
|------|--------|
| `src/blocks/adapter/index.ts` | Export new adapter blocks |
| `src/core/canonical-types/units.ts` | Possibly add bipolar unit kind |
| `src/core/canonical-types/payloads.ts` | Update ALLOWED_UNITS if new unit kind added |

## Open Question: Bipolar Unit
Options:
1. Add `{ kind: 'bipolarNorm' }` to UnitType — explicit, type-safe, enables auto-insertion
2. Use `unitScalar()` for bipolar — simpler, but loses auto-insertion capability
3. Add `{ kind: 'norm'; range: '01' | '11' }` — generalizes norm01 and bipolar

Recommendation: Option 1 is cleanest and stays consistent with the existing design philosophy of encoding semantics in types.
