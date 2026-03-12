---
parent: ../INDEX.md
topic: color-system
order: 23
---

# Color System

> Color as a structured payload with explicit color space units.

**Related Topics**: [01-type-system](./01-type-system.md), [02-block-system](./02-block-system.md), [21-adapter-system](./21-adapter-system.md)
**Key Terms**: [ColorPicker](../GLOSSARY.md#colorpicker), [MakeColorOKLCH](../GLOSSARY.md#makecoloroklch), [OklchToRgba](../GLOSSARY.md#oklchtorgba)

---

## Color Space as UnitType Extension (T2)

Color spaces are encoded via `UnitType`:
- `{ kind: 'color', unit: 'rgba01' }` — RGB+A, components are normalized floats 0..1
- `{ kind: 'color', unit: 'oklch' }` — OKLCH+A, hue wraps 0..1, s/l/a clamp 0..1

**Compatibility rule**: OKLCH and RGBA01 require explicit adapter conversion (OklchToRgba block). No implicit color space conversion.

**Color validity enforcement**: MakeColorOKLCH wraps hue (modulo 1.0) and clamps s/l/a to 0..1.

## Extract/Construct for Color (T2)

Extract and Construct are **structural intrinsics** (ValueExpr kinds), not registry kernels:
- `extract(input, componentIndex)`: Extract scalar h/s/l/a from color payload
- `construct([h, s, l, a], colorType)`: Pack scalars into color payload
- `oklchToRgb(input)`: OKLCH→RGB conversion (structural intrinsic, not component-wise)

These are the same Extract/Construct operations used for vec2/vec3.

## Lane-Local Color Execution

All color blocks are lane-local via the existing cardinality axis. The same Naga lowering works for both scalar and array execution paths.

## Color Block Catalog (T3)

| Block | Role | Description |
|-------|------|-------------|
| ColorPicker | Source | Constant OKLCH+A color from UI parameters (not graph inputs) |
| MakeColorOKLCH | Transform | Pack h,s,l,a scalars → color+oklch with validity enforcement |
| SplitColorOKLCH | Transform | Unpack color+oklch → h,s,l,a scalars |
| HueShift | Transform | Rotate hue by offset (wrap modulo 1.0) |
| MixColor | Transform | Interpolate two colors (shortest-arc hue for OKLCH) |
| AlphaMultiply | Transform | Premultiply alpha |
| OklchToRgba | Adapter | Convert color+oklch → color+rgba01 (explicit, single conversion point) |

---

## Cross-References

- UnitType color kinds: [01-type-system](./01-type-system.md)
- Adapter matching for color conversion: [21-adapter-system](./21-adapter-system.md)
- Block definitions: [02-block-system](./02-block-system.md)
