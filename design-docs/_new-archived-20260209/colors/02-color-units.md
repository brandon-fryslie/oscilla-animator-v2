Using UnitType to distinguish color spaces (HSL vs RGB) is appropriate — it treats the unit axis as a semantic/representation tag (i.e., "how to interpret these numbers"), not as a physical dimension like meters/seconds.

The key is to be consistent about what "unit" means in our CanonicalType system.

When it's a good fit

It's a good fit when:
•	HSL and RGB share the same payload kind (`color`, stride 4) and you need the type system to prevent wiring them together accidentally.
•	You want conversions (HSL↔RGB) to be explicit adapters/blocks.
•	You want the compiler/type checker to reject "wrong color space" connections early.

This is exactly what our unit axis does: it's a tag that constrains compatibility.

What it should look like

This project's UnitType is a discriminated union with `kind` as the top-level discriminant. The existing `{ kind: 'color', unit: 'rgba01' }` pattern extends naturally:

•	`{ kind: 'color', unit: 'hsl' }` — HSL+A color space, components are normalized floats
•	`{ kind: 'color', unit: 'rgba01' }` — RGB+A color space, components are floats in [0,1] (already exists)

Then:
•	ColorPicker outputs `color` payload with unit `{ kind: 'color', unit: 'hsl' }`
•	MakeColorHSL outputs `color` payload with unit `{ kind: 'color', unit: 'hsl' }`
•	HueShift, MixColor, AlphaMultiply require and return `{ kind: 'color', unit: 'hsl' }`
•	HslToRgba is an adapter block: input `{ kind: 'color', unit: 'hsl' }` → output `{ kind: 'color', unit: 'rgba01' }`

Compatibility rules

This is the important part: how the type checker treats units.

Recommended rules:
•	Units must match exactly for compatibility unless there is an explicit adapter block in between.
•	Do not allow implicit "unit unification" between hsl and rgba01 just because payloads match.

So:
•	`color` + unit(hsl) is not compatible with `color` + unit(rgba01).
•	But they become compatible via HslToRgba / RgbToHsl adapter blocks.

Two traps to avoid

1) Don't overload "unit" with both "colorspace" and "physical dimension" semantics unless your design already supports that

Our existing UnitType already has `{ kind: 'color', unit: 'rgba01' }` as a category alongside `{ kind: 'angle', unit: 'phase01' }` and `{ kind: 'space', unit: 'world', dims: 2 }`. Adding `'hsl'` as another color unit sub-kind is a natural extension of this pattern — no overloading needed.

2) Don't use UnitType to encode range/clamping rules

HSL validity constraints (wrap hue, clamp others) should remain a value invariant, not a type invariant. Keep unit = "interpretation", not "value range."

Practical recommendation

Do it, and keep it minimal:
•	Add `'hsl'` as a new sub-kind to the existing `{ kind: 'color' }` unit category.
•	`isTypeCompatible` already requires exact unit match — no changes needed there.
•	Conversions are explicit via adapter blocks (HslToRgba, and optionally RgbToHsl).
•	Quantization to 8-bit integers is a render concern handled at the renderer boundary, not in the type system.

This cleanly prevents accidental HSL/RGB wiring while keeping the unit axis meaningful and predictable.
