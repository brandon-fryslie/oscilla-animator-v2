# Definition of Done: color-foundation

## Verification Criteria

### Type System
- `unitHsl()` returns `{ kind: 'color', unit: 'hsl' }`
- `unitsEqual(unitHsl(), unitHsl())` returns true
- `unitsEqual(unitHsl(), unitRgba01())` returns false
- TypeScript compiles with no errors (exhaustive switches handle new variant)

### HSL→RGB Conversion
- Test vectors (at minimum):
  - HSL(0, 1, 0.5, 1) → RGB(1, 0, 0, 1) — pure red
  - HSL(1/3, 1, 0.5, 1) → RGB(0, 1, 0, 1) — pure green (h=0.333...)
  - HSL(2/3, 1, 0.5, 1) → RGB(0, 0, 1, 1) — pure blue
  - HSL(0, 0, 0.5, 1) → RGB(0.5, 0.5, 0.5, 1) — achromatic gray
  - HSL(0, 0, 0, 1) → RGB(0, 0, 0, 1) — black
  - HSL(0, 0, 1, 1) → RGB(1, 1, 1, 1) — white
  - Alpha passthrough: HSL(0, 1, 0.5, 0.5) → RGB(1, 0, 0, 0.5)

### FieldConstColor Fix
- `FieldConstColor` block compiles without error
- Output is a color field with correct stride (4)
- Round-trip: FieldConstColor → construct → runtime produces expected RGBA values

### Build
- `npm run typecheck` passes
- `npm run test` passes (all existing tests + new tests)
