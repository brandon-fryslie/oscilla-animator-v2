# Implementation Context: color-blocks

## File Organization

All new color blocks go in `src/blocks/color/`:
```
src/blocks/color/
├── color-picker.ts       # ColorPicker source
├── make-color-hsl.ts     # MakeColorHSL (pack)
├── split-color-hsl.ts    # SplitColorHSL (unpack)
├── hue-shift.ts          # HueShift
├── mix-color.ts          # MixColor (shortest-arc blend)
├── alpha-multiply.ts     # AlphaMultiply
├── hsl-to-rgba.ts        # HslToRgba adapter
└── __tests__/
    └── color-blocks.test.ts
```

The HslToRgba block may alternatively go in `src/blocks/adapter/hsl-to-rgba.ts` depending on convention — check where other adapter blocks live.

## Common Type Patterns

```typescript
// HSL color type (signal)
const colorHslType = canonicalType(COLOR, unitHsl());

// RGBA color type (signal)
const colorRgbaType = canonicalType(COLOR, unitRgba01());

// Float scalar type
const floatType = canonicalType(FLOAT, unitScalar());

// Float norm01 type (for t parameter)
const norm01Type = canonicalType(FLOAT, unitNorm01());
```

## Lowering Pattern Template

```typescript
lower: ({ ctx, inputsById }) => {
  const input = inputsById.color;
  if (!input) throw new Error('...');

  // Extract components
  const h = ctx.b.extract(input.id, 0, floatType);
  const s = ctx.b.extract(input.id, 1, floatType);
  const l = ctx.b.extract(input.id, 2, floatType);
  const a = ctx.b.extract(input.id, 3, floatType);

  // ... transform ...

  // Reconstruct
  const result = ctx.b.construct([h2, s2, l2, a2], outType);
  const slot = ctx.b.allocSlot();

  return {
    outputsById: {
      color: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
    },
  };
}
```

## Shortest-Arc Hue Mix (MixColor)

```
wrapSigned(x) = ((x + 0.5) - floor(x + 0.5)) - 0.5
dh = wrapSigned(bh - ah)
h_out = wrap01(ah + dh * t)
```

In opcodes:
1. `diff = Sub(bh, ah)`
2. `shifted = Add(diff, const_0_5)`
3. `floored = Floor(shifted)`
4. `wrapped = Sub(shifted, floored)` — this is fract(shifted)
5. `dh = Sub(wrapped, const_0_5)` — wrapSigned result
6. `scaled = Mul(dh, t)`
7. `sum = Add(ah, scaled)`
8. `h_out = Wrap01(sum)`

## Adapter Registration

Follow the pattern in `src/blocks/adapter/radians-to-phase.ts`:
```typescript
adapterSpec: {
  from: { payload: COLOR, unit: { kind: 'color', unit: 'hsl' }, extent: 'any' },
  to: { payload: COLOR, unit: { kind: 'color', unit: 'rgba01' }, extent: 'any' },
  inputPortId: 'in',
  outputPortId: 'out',
  description: 'HSL → RGBA color space conversion',
  purity: 'pure',
  stability: 'stable',
},
```

## Block Registration

Remember to import and register all new blocks. Check how existing block files in `src/blocks/` are imported — likely from a barrel file or directly in `src/blocks/registry.ts`.
