# Definition of Done: color-foundation

## Verification Criteria

### Type System
- `unitHsl()` returns `{ kind: 'color', unit: 'oklch' }`
- `unitsEqual(unitHsl(), unitHsl())` returns true
- `unitsEqual(unitHsl(), unitRgba01())` returns false
- TypeScript compiles with no errors (exhaustive switches handle new variant)

### OKLCH→RGB Conversion
- Test vectors (at minimum):
  - OKLCH(0, 1, 0.5, 1) → RGB(1, 0, 0, 1) — pure red
  - OKLCH(1/3, 1, 0.5, 1) → RGB(0, 1, 0, 1) — pure green (h=0.333...)
  - OKLCH(2/3, 1, 0.5, 1) → RGB(0, 0, 1, 1) — pure blue
  - OKLCH(0, 0, 0.5, 1) → RGB(0.5, 0.5, 0.5, 1) — achromatic gray
  - OKLCH(0, 0, 0, 1) → RGB(0, 0, 0, 1) — black
  - OKLCH(0, 0, 1, 1) → RGB(1, 1, 1, 1) — white
  - Alpha passthrough: OKLCH(0, 1, 0.5, 0.5) → RGB(1, 0, 0, 0.5)

### FieldConstColor Fix
- `FieldConstColor` block compiles without error
- Output is a color field with correct stride (4)
- Round-trip: FieldConstColor → construct → runtime produces expected RGBA values

### Build
- `npm run typecheck` passes
- `npm run test` passes (all existing tests + new tests)
