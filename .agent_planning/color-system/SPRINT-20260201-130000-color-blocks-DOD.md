# Definition of Done: color-blocks

## Verification Criteria

### All Blocks
- Each block compiles without errors
- Each block has unit tests covering:
  - Normal case
  - Edge cases (boundary values)
  - Cardinality polymorphism (signal input → signal output, field input → field output)
- `npm run typecheck` passes
- `npm run test` passes

### ColorPicker
- Outputs constant color with unit hsl
- h=0 s=1 l=0.5 a=1 → color value [0, 1, 0.5, 1]
- h=1.5 → wraps to 0.5, s=-0.1 → clamps to 0

### MakeColorHSL
- Input (0.25, 0.8, 0.6, 1.0) → color+hsl [0.25, 0.8, 0.6, 1.0]
- h wrapping: input h=1.3 → stored as 0.3
- s/l/a clamping: input s=1.5 → stored as 1.0

### SplitColorHSL
- Round-trip: MakeColorHSL(h,s,l,a) → SplitColorHSL → (h,s,l,a) unchanged

### HueShift
- color(0.1,1,0.5,1) + shift 0.2 → color(0.3,1,0.5,1)
- Wrap: color(0.9,1,0.5,1) + shift 0.3 → color(0.2,1,0.5,1)

### MixColor
- Same color → same color regardless of t
- t=0 → color a, t=1 → color b
- Shortest-arc: mix(hsl(0.1,...), hsl(0.9,...), 0.5) → hsl(0.0,...) not hsl(0.5,...)

### AlphaMultiply
- color(h,s,l,0.8) × alpha(0.5) → color(h,s,l,0.4)
- Clamp: color(h,s,l,1.0) × alpha(2.0) → color(h,s,l,1.0)

### HslToRgba
- All test vectors from Sprint 1 DOD pass through this block
- Adapter auto-insertion works when wiring hsl output to rgba01 input

### Integration
- Can wire: ColorPicker → HueShift → MixColor → HslToRgba → (render sink)
- Full pipeline compiles and executes
