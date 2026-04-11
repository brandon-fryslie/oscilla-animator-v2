# Color Pipeline: Future Direction

**Date:** 2026-04-07
**Status:** This document is the canonical statement of where the color
system is going. All future color work in `src/pillars/` MUST conform
to the principles below. Any block or helper that violates them gets
reverted.

---

## The Two Foundational Decisions

### 1. The engine works in OKLab/OKLCH end-to-end

Every color value, everywhere in the pillar pipeline, is stored as
**OKLab Cartesian** (`L`, `a`, `b`, `alpha`) in `f32` precision. OKLCH
(cylindrical: `L`, `C`, `H`) is the same data in polar form, used
internally by any block that needs hue manipulation. The conversion is
one cheap function call.

Why OKLab and not RGB / HSL / HSV / CIELab:

- **Strictly larger representable gamut.** OKLab is defined as a
  transform from XYZ. Every color in sRGB, P3, Rec.2020, and
  ProPhoto can be expressed in OKLab. The reverse is not true. Working
  in OKLab loses no color we could have rendered in any RGB space, and
  unlocks colors we couldn't.
- **Perceptually uniform.** Equal-distance OKLab steps look like equal
  perceptual changes — interpolation (mixing two colors, gradients,
  blends) produces visually smooth results without the murky midtones
  and weird hue shifts that linear RGB blending produces.
- **Hue-stable.** HSL has the famous "blue rotates toward purple as
  lightness changes" bug. OKLab was specifically designed to fix that.
  Hue stays put when you change lightness or chroma.
- **Single well-defined gamut decision.** Wide-gamut intermediate
  values get clipped/mapped exactly once, in WGSL, at the fragment
  stage of the output material. There is no implicit sRGB clamp
  scattered across the pipeline.

Practical implications we have to honor:

- Storage textures intended to hold OKLab field values use
  `rgba16float` (or `rgba32float`), never `rgba8unorm`. The 8-bit
  unorm format quantizes OKLab too aggressively. `rgba8unorm` is
  reserved for "this texture is final display output" cases.
- WGSL has no built-in OKLab. We ship the conversion functions in
  `block-dsl/color/oklab.ts` and inject them into every output
  Material. ~15 lines each direction, cheap on the GPU.
- Alpha compositing in OKLab is perceptually correct, which is what we
  want for procedural animation. (Not the same as linear-light
  premultiplied alpha that photo compositing pipelines use, but that's
  not our use case.)
- Gamut mapping at the boundary uses chroma-clipping: clamp `C` while
  preserving `L` and `H`, then convert. This is what CSS Color Level 4
  specifies and what every modern color tool does. Naive per-channel
  clipping in linear sRGB produces hue shifts and is forbidden.

### 2. Color is opaque to the user — no channel access, ever

This is the controversial half and the more important half. The user
who wires together a pillar graph **never sees** `r`, `g`, `b`, `L`,
`a`, `b`, `H`, `C`, or any other channel name. They see Color as a
single primitive. They reach for color blocks the way they reach for a
color picker in any other tool — by intent ("brighten this", "filter
out everything but red", "tint toward this orange"), not by channel
arithmetic.

The principle, stated as a hard rule:

> **Color cannot be broken down into smaller parts in the user-facing
> surface.** No "extract red channel" block. No "set L to 0.7" block.
> No expression-DSL function that takes `color.r`. If a user wants to
> do something to colors, the answer is always "compose the right
> color blocks together," never "drop into channel math."

Why this is the right call:

- **Every serious color tool already works this way.** Adobe's color
  panels, Resolve's primary color wheels, Lightroom's HSL tab, Nuke's
  Grade and ColorCorrect nodes, Material Design's tonal palettes — none
  of them expose RGB channels in the high-level surface. Channels are
  an implementation detail you only see if you go looking for them.
  Forcing channel awareness on users is a 1990s vestige nobody actually
  enjoys.
- **It removes the temptation to write wrong color code.** Every time a
  user multiplies `r` by `0.5` to "darken" a color, they get a hue
  shift and a desaturation they didn't ask for. Every time someone
  inverts a color via `1 - r, 1 - g, 1 - b`, they get the wrong
  perceptual inverse. Channel access is a footgun and we are removing
  the gun.
- **It locks the engine's freedom to evolve.** As long as no user code
  references channel field names, the bundle's internal color
  representation is purely a backend concern. We can switch from OKLab
  to OKLab+HDR, to JzAzBz, to a 16-bit storage path, to a future
  perceptual space, **without breaking a single user graph**. The
  abstraction holds.

Mechanical enforcement: a forbidden-pattern test in
`src/__tests__/forbidden-patterns.test.ts` (or its pillar-scoped
equivalent) greps every file under `src/pillars/blocks/` and
`src/pillars/fixtures/` for the literal strings `color_L`, `color_a`,
`color_b`, `color_r`, `color_g`, `color_b` (yes, `color_b` matches both
the OKLab `b` and the RGB `b` — both are forbidden outside the color
helpers). Any block file or fixture that mentions a color channel by
name fails CI. The only file allowed to know about channels is
`src/pillars/block-dsl/color/oklab.ts`.

---

## Architectural Substrate (What Has To Land Once)

### `src/pillars/block-dsl/color/oklab.ts` — the only file that knows about channels

Exports:

- **`Color`** — opaque type representing a single color in IR space.
  Internally a four-element record of `ExprIR` values for `L`, `a`,
  `b`, `alpha`, but consumers never inspect those keys; they pass
  `Color` values through the pure-function adjusters.
- **`readColorField(bundle, fieldName='color')`** — reads the four
  component fields from a SourceBundle and returns a `Color`. The
  underlying field naming scheme (`${fieldName}_L`, `${fieldName}_a`,
  etc.) is private to this module. Block files never type those names.
- **`writeColorField(color, fieldName='color')`** — returns a partial
  bundle (`Record<string, ExprIR>`) ready to spread into a result
  bundle. Mirror of read.
- **Pure adjusters operating on `Color`:**
  - `brighten(c, amount)` — shift L by `amount` (signed)
  - `tint(c, target, amount)` — interpolate toward another `Color`
  - `mix(a, b, t)` — interpolate two `Color`s by `t`
  - `huerotate(c, degrees)` — internally OKLab → OKLCH → rotate H → OKLab
  - `scaleChroma(c, factor)` — multiply chroma
  - `withLightness(c, L)` / `withChroma(c, C)` / `withHue(c, H)` —
    set one polar coordinate, used internally by selectors etc.
  - `perceptualInvert(c)` — invert L, rotate H 180°
  - `perceptualDistance(a, b)` — Euclidean OKLab distance, used by
    selection blocks
- **`oklabToDisplayWgsl()` / `displayToOklabWgsl()`** — WGSL function
  text injected into every output Material. The output material's
  fragment shader includes `oklabToDisplayWgsl()` and calls it on the
  varying color before writing to the color attachment.
- **`gamutClipChromaWgsl()`** — the chroma-clipping gamut mapper
  injected alongside the converter. Called inside `oklabToDisplayWgsl`
  before the linear-sRGB → display-sRGB encoding.

Bundle field naming convention (private to this module):
- Cartesian: `${prefix}_L`, `${prefix}_a`, `${prefix}_b`, `${prefix}_alpha`
- Default `prefix` is `color`. A bundle with multiple color slots (e.g.
  a future `palette` block emitting an array) uses `color0`, `color1`,
  etc. — but again, callers never type these names; they pass the
  prefix into `readColorField` / `writeColorField`.

### Bundle color contract: existing blocks migrate

`ParticlePool` currently emits `color_r`, `color_g`, `color_b`. After
the substrate slice, it emits `color_L`, `color_a`, `color_b_OKLAB`
(or whatever internal scheme `oklab.ts` settles on — the field names
are private). A user who looks at a block's source code sees
`writeColorField(c)` and a `Color` value, never the underlying triple.

The current rainbow palette in `ParticlePool` becomes a hardcoded
OKLab gradient that goes around the hue wheel — same visual output
(actually slightly more vivid because OKLab interpolation doesn't
muddy the midtones), but expressed in the new vocabulary.

### Material rebuild

`block-dsl/materials/dot-material.ts` becomes
`block-dsl/materials/oklab-dot-material.ts`. Its fragment shader:

```wgsl
// (injected) fn oklabToDisplay(c: vec4<f32>) -> vec4<f32> { ... }

@fragment
fn fs(in: VaryingIn) -> @location(0) vec4<f32> {
    return oklabToDisplay(in.color);
}
```

Where `in.color` is a `vec4<f32>` carrying `(L, a, b, alpha)` from the
vertex stage. The vertex stage loads the four `color_L/a/b/alpha`
fields from the SoA via `loadField`, builds the vec4, and passes it
through.

Every Material in the system uses the same `oklabToDisplay` function
text — single source of truth, single gamut decision. New Materials
(texture-sampling, gradient, masked) all import the same WGSL string.

### Forbidden-pattern test

`src/__tests__/forbidden-patterns.test.ts` (or a pillar-scoped one)
asserts that no file under `src/pillars/blocks/` or
`src/pillars/fixtures/` contains the string literal `color_r`,
`color_g`, `color_b`, `color_L`, `color_a`, `color_alpha`, `oklab`,
or `OKLab`. Only `src/pillars/block-dsl/color/oklab.ts` is exempt.
The test is the structural enforcement of the opacity rule.

---

## The Block Vocabulary

These are the user-facing color blocks. Every one of them takes
`Color` (or color fields embedded in a SourceBundle) and returns
`Color`. None of them expose channels.

### Sources — where colors enter the graph

1. **ColorPicker** — single color, picked from a UI swatch. The picker
   UI shows a perceptually-uniform OKLab gamut. User sees a color,
   never a triple.
2. **Palette** — N named colors as a single bundle-able value.
   Internally an array of `Color` values; consumed by `ColorByIndex`
   and similar.
3. **Gradient** — N-stop gradient where the stops are themselves
   `Color`s. Exposes the gradient as a function of `t ∈ [0, 1]`.

### Per-instance / per-texel color — assign different colors to different things

4. **ColorByIndex** — instance index → palette entry, modulo palette
   size. The "every dot a different color" block.
5. **ColorFromGradient** — scalar field → gradient lookup. Heatmap.
6. **ColorByPosition** — 2D position → color via a 2D gradient or
   radial pattern. "Center is hot, edges cold."

### Adjustments — color in → color out

7. **Brighten** / **Darken** — adjust perceived brightness, signed
   amount. Internally shifts L. The user-facing label avoids the word
   "lightness" because lightness is jargon.
8. **MoreVivid** / **LessVivid** — scale chroma. The word
   "saturation" is a channel-y word; "vividness" is intuitive.
9. **HueShift** — rotate hue by an angle, or by a presets choice
   (warmer / cooler / toward green / etc.).
10. **Tint** — push existing color toward a target color by an amount.
    OKLab interpolation. "Warm everything by 20% toward this orange."
11. **Contrast** — push midtones away from gray. Internally pushes L
    away from 0.5.
12. **Invert** — perceptual invert (L inverted, H rotated 180°). NOT
    naive RGB inversion.
13. **Posterize** — quantize to N visible brightness or chroma steps.

### Selection / filtering — color → mask

These blocks output a **scalar mask field** (`mask ∈ [0, 1]`), not a
color. Selection is conceptually different from coloring; the mask
feeds back into other modifiers via gating (Multiply against the mask,
ColorIf, etc.).

14. **HueFilter** — open / close angles on the color wheel define an
    arc; everything outside is rejected. Soft falloff parameter
    controls edge sharpness. The user's example.
15. **BrightnessFilter** — lower / upper brightness range with soft
    falloff. "Only highlights" / "only shadows."
16. **VividnessFilter** — lower / upper chroma range with soft falloff.
    "Only the saturated stuff."
17. **ColorMatte** — pick a target color and a tolerance; output a mask
    where the input is "close to" the target in perceptual distance.

### Combining — two colors → one color

18. **Mix** — interpolate two color streams by `t`. Linear in OKLab
    Cartesian → perceptually uniform, hue-correct. The bread-and-butter
    blender.
19. **Overlay** — overlay blend, computed perceptually.
20. **PickLighter** / **PickDarker** — per-instance, choose whichever
    is brighter or darker.

### Conditional — color × color × scalar → color

21. **ColorIf** — `if scalar > threshold then colorA else colorB`,
    with a smooth transition zone.
22. **ReplaceColor** — find one color in the input, replace with
    another. Tolerance-based, perceptual distance.

### Mood presets — combined operators sold as single blocks (LOW PRIORITY, MAYBE)

These are sugar: each block is internally a fixed pipeline of the
primitives above. The user picks one and gets a curated look. They
can swap to a manual chain when they outgrow the preset. Lightroom
presets work this way.

23. **MoodVintage** / **MoodCinematic** / **MoodSunset** /
    **MoodMonochrome** / **MoodCyberpunk** — opinionated combinations.

These are explicitly low-priority and might never get built. Listed
here only so the future implementer knows the option exists.

---

## What This Means For Existing Pillar Code

| File | Change |
|---|---|
| `src/pillars/blocks/particle-pool.ts` | Bundle output stops using `color_r/g/b`. Uses `writeColorField(c)` and a hardcoded OKLab rainbow gradient. |
| `src/pillars/block-dsl/materials/dot-material.ts` | DELETE. Replaced by `block-dsl/materials/oklab-dot-material.ts`. |
| `src/pillars/block-dsl/materials/oklab-dot-material.ts` | NEW. Loads color fields via `readColorField`-shaped pattern, vertex stage builds the vec4, fragment stage calls `oklabToDisplay`. |
| `src/pillars/block-dsl/color/oklab.ts` | NEW. The single source of truth for color channel access. |
| `src/pillars/blocks/draw-bundle.ts` | Updated to validate "this bundle has a color" instead of "this bundle has color_r/g/b". Uses the new material. |
| `src/pillars/block-dsl/materials/dot-material.ts` `validateBundleForDotMaterial` | Becomes `validateBundleHasColor` checking for the four color component fields by their canonical (private) names — only this validator is allowed to reference them. |

The Materialize block from the previous slice gets two updates in the
substrate slice:

- A `format` config option choosing between `rgba8unorm` (final
  display, gamut-clipped at write time) and `rgba16float` (intermediate
  OKLab storage). Default `rgba16float` for safety.
- The texture-store statement composes the four color components via
  `readColorField` instead of hardcoding `color_r/g/b/a` literal field
  names.

---

## What This Means For The Expression DSL

**The Expression DSL does not change.** It continues to operate on
scalar fields (`pos_x`, `mask`, etc.) using the math vocabulary it
already supports. Color is a separate vocabulary the user reaches for
via dedicated color blocks, not via writing math expressions.

Specifically: the Expression DSL does NOT learn to understand the
field names `color_L`, `color_a`, `color_b`. The forbidden-pattern
test catches any fixture or block that tries to reference them. If a
user wants to do something to colors, they reach for a color block,
not the Expression block.

This is a design decision, not a limitation. The Expression DSL is for
math; color blocks are for color. Separating the two prevents users
from writing the wrong color math by accident.

---

## Out of Scope (For This Whole Direction)

- **HDR.** OKLab's L channel assumes SDR. HDR support would mean
  scaling L beyond 1 and writing to a `rgba16float` canvas — both
  doable but not in the first round.
- **Color picking UI.** The `ColorPicker` block needs a perceptually-
  uniform UI swatch. Building that UI is a separate slice from
  building the block's compile-time behavior. The block can ship with
  a temporary "type three numbers" config until the UI is ready.
- **OKLab in the Boundary IR.** The IR continues to operate on scalar
  fields; nothing in `boundary-contract.ts` needs to change. The
  abstraction is purely on the TypeScript side.
- **Channel-aware debug tooling.** A debug-only inspector that shows
  raw OKLab values is fine to build. It doesn't violate the opacity
  rule because it's a tooling surface, not a user-facing block.

---

## Decision Log

| Date | Who | Decision |
|---|---|---|
| 2026-04-07 | bmf + Claude | Adopted OKLab end-to-end. Adopted opacity rule. Documented full vocabulary. |
