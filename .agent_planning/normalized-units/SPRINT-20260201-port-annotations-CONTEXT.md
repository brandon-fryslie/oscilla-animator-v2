# Implementation Context: Port Annotations Sprint
Generated: 2026-02-01

## Files to Modify

| File | Ports | Change |
|------|-------|--------|
| `src/blocks/color/make-color-hsl.ts` | h, s, l, a | h→unitPhase01(), s/l/a→unitNorm01() |
| `src/blocks/color/split-color-hsl.ts` | h, s, l, a | h→unitPhase01(), s/l/a→unitNorm01() |
| `src/blocks/color/color-picker.ts` | h, s, l, a | h→unitPhase01(), s/l/a→unitNorm01() |
| `src/blocks/color/hue-shift.ts` | shift | NO CHANGE — stays scalar (signed offset) |
| `src/blocks/color/alpha-multiply.ts` | alpha | →unitNorm01() |
| `src/blocks/field/field-const-color.ts` | r, g, b, a | →unitNorm01() |
| `src/blocks/signal/lag.ts` | smoothing | →unitNorm01() |
| `src/blocks/instance/array.ts` | t | →unitNorm01() in canonicalField |
| `src/blocks/layout/circle-layout-uv.ts` | phase | Use unitPhase01() helper |

## Import Changes
Most files will need to add imports for `unitPhase01` and/or `unitNorm01` from `@/core/canonical-types/units`.

## Pattern
Each change follows the same pattern:
```typescript
// Before
type: canonicalType(FLOAT, unitScalar())
// or
type: canonicalType(FLOAT)

// After (for norm01)
type: canonicalType(FLOAT, unitNorm01())
// After (for phase01)
type: canonicalType(FLOAT, unitPhase01())
```
