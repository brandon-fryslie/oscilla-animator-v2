/**
 * src/pillars/scene/color.ts
 *
 * The seam where an opaque authored color (a single `#rrggbb` value a user
 * picks) becomes a ScenePlan `ColorBinding`. User-facing blocks deal only in the
 * opaque value; the color-space channel layout lives only on the far side of
 * this function, inside the plan.
 *
 * [LAW:one-source-of-truth] The one place a block-facing color crosses into the
 *   backend channel representation. No block copies channel layout into its own
 *   API; it hands an opaque value here and gets a `ColorBinding` back.
 * [LAW:effects-at-boundaries] A pure mapping value→value; it parses and packs,
 *   it does not touch three or the renderer.
 */

import {
  add,
  cos,
  input,
  intrinsic,
  konst,
  mod,
  mul,
  sin,
  step,
  type ColorBinding,
  type PlanExpr,
  type TextureFilter,
} from '../../render/scene-plan';

const TAU = 2 * Math.PI;

const CHANNEL_MAX = 255;

/** Decode one sRGB display channel (0..1) to linear light. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** The OKLab coordinates of an opaque `#rrggbb` color, as plain numbers. */
interface OklabTriple {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

/** Parse `#rrggbb` → linear sRGB → OKLab coordinates (Ottosson). */
function hexToOklab(hex: string): OklabTriple {
  const channel = (start: number): number =>
    srgbToLinear(parseInt(hex.slice(start, start + 2), 16) / CHANNEL_MAX);
  const r = channel(1);
  const g = channel(3);
  const b = channel(5);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/**
 * Parse an opaque `#rrggbb` color into a uniform (per-instance-constant) OKLab
 * `ColorBinding`. The authored color enters the perceptual space here — the one
 * seam — so every downstream color op composes in OKLab and the renderer maps
 * it back to linear sRGB for display. Each channel is a baked `const`: a solid
 * color is the zero-variation case of the same binding an animated color uses.
 *
 * [LAW:dataflow-not-control-flow] Solidness is a property of the *values* (all
 *   `const`), not a separate kind of binding.
 * [LAW:one-source-of-truth] The sRGB→OKLab transform lives only here on the
 *   authoring side and `oklabToLinearSrgb` only on the render side; no block
 *   sees either matrix.
 */
export function hexColorBinding(hex: string): ColorBinding {
  const c = hexToOklab(hex);
  return { space: 'oklab', l: konst(c.l), a: konst(c.a), b: konst(c.b) };
}

/**
 * An OKLab gradient `ColorBinding` interpolating two opaque colors by a
 * per-instance / per-frame parameter `t` (typically a normalized `rank`). The
 * lerp runs in OKLab Cartesian — `mix` per channel — so the ramp is
 * perceptually uniform and hue-correct, with no muddy midtones. Each channel is
 * `c0 + (c1 - c0) * t`; `c1 - c0` folds at authoring time into one `const`.
 *
 * [LAW:dataflow-not-control-flow] The ramp is one expression evaluated per
 *   instance; the position along it is the value `t`, not a branch.
 */
export function gradientColorBinding(hexFrom: string, hexTo: string, t: PlanExpr): ColorBinding {
  const c0 = hexToOklab(hexFrom);
  const c1 = hexToOklab(hexTo);
  const lerp = (from: number, to: number): PlanExpr => add(konst(from), mul(konst(to - from), t));
  return { space: 'oklab', l: lerp(c0.l, c1.l), a: lerp(c0.a, c1.a), b: lerp(c0.b, c1.b) };
}

/**
 * An opaque base color shown or hidden per instance by a threshold: an `rgba`
 * `ColorBinding` whose `a` channel is a boolean `step` over a per-instance
 * field. The field is a `rank`-spread, `time`-drifting sine remapped to `[0,1]`;
 * `step(threshold, field)` yields exactly `1` (shown) or `0` (hidden), so a
 * single global `threshold` scalar controls apparent density — show/hide is a
 * material decision, never a domain operation.
 *
 * The base rgb is the opaque authored color decoded to linear light (the
 * realizer hands `rgb` straight through, unlike the `oklab` ops); `rgba` carries
 * no perceptual space, so this seam is the one place that layout is minted.
 *
 * [LAW:dataflow-not-control-flow] Visibility is the *value* of `a` (0 or 1), not
 *   a branch that skips drawing an instance; every instance runs one expression.
 * [LAW:one-source-of-truth] The threshold/visibility channel layout lives here at
 *   the seam, never on the block API — the block hands an opaque color + scalars.
 */
export function thresholdVisibilityBinding(
  hex: string,
  threshold: number,
  frequency: number,
  speed: number,
): ColorBinding {
  const channel = (start: number): number =>
    srgbToLinear(parseInt(hex.slice(start, start + 2), 16) / CHANNEL_MAX);
  // A per-instance field in [0,1]: rank spreads it across the field, time drifts
  // which instances clear the threshold, so the visible set sweeps over time.
  const field = mul(
    add(
      sin(add(mul(intrinsic('rank'), konst(frequency)), mul(input('time'), konst(speed)))),
      konst(1),
    ),
    konst(0.5),
  );
  return {
    space: 'rgba',
    r: konst(channel(1)),
    g: konst(channel(3)),
    b: konst(channel(5)),
    a: step(konst(threshold), field),
  };
}

/**
 * An OKLab color from cylindrical OKLCH coordinates: fixed `lightness` and
 * `chroma`, with the hue spinning by `hueTurns` (1 turn = a full color wheel,
 * a `PlanExpr` so it can vary per instance / over time). Hue lives only in the
 * polar conversion `a = C·cos(H), b = C·sin(H)` — the block never names it.
 *
 * [LAW:one-source-of-truth] OKLCH↔OKLab is a color concern; it lives at this
 *   seam, not in the block. Blocks describe *intent* (spread, cycle), not axes.
 */
export function oklchColorBinding(
  lightness: number,
  chroma: number,
  hueTurns: PlanExpr,
): ColorBinding {
  const h = mul(konst(TAU), hueTurns);
  return { space: 'oklab', l: konst(lightness), a: mul(konst(chroma), cos(h)), b: mul(konst(chroma), sin(h)) };
}

// ---------------------------------------------------------------------------
// ColorPlan — the bundle-level color: a per-channel-math binding OR a sampled
// lookup table. A color source that needs *selection* (palette by index) or
// *piecewise* interpolation (an N-stop ramp) — the things the pure-math PlanExpr
// vocabulary cannot denote — produces a `lut`; everything else produces a
// `binding`. Assembly lowers a `lut` into a `{kind:'data'}` texture + an
// `unlitColorLut` material at its single material seam.
//
// [LAW:types-are-the-program] "math color vs sampled color" is a real domain
//   distinction, encoded as a discriminated union the assembler matches once —
//   not a flag or a nullable second color field.
// ---------------------------------------------------------------------------

/** A baked 1-D color lookup table: `width` OKLab texels, sampled with `filter`. */
export interface ColorLut {
  readonly width: number;
  /** Flat `width × 4` float RGBA, each texel an OKLab triple + 1.0 alpha. */
  readonly pixels: readonly number[];
  readonly filter: TextureFilter;
}

/**
 * The color a bundle carries: either a per-channel-math {@link ColorBinding} or a
 * sampled {@link ColorLut} indexed by a per-instance `coord`.
 */
export type ColorPlan =
  | { readonly kind: 'binding'; readonly binding: ColorBinding }
  | { readonly kind: 'lut'; readonly lut: ColorLut; readonly coord: PlanExpr };

/** Wrap a per-channel-math binding as a {@link ColorPlan}. */
export const bindingColor = (binding: ColorBinding): ColorPlan => ({ kind: 'binding', binding });

/**
 * The neutral base color an instance source emits before any color block runs:
 * opaque white, so an uncolored grid is visible. A downstream color block
 * replaces it.
 */
export const neutralColorPlan = (): ColorPlan =>
  bindingColor({ space: 'rgb', r: konst(1), g: konst(1), b: konst(1) });

/** Pack a list of OKLab triples into a flat float-RGBA LUT pixel array. */
function oklabLutPixels(colors: readonly OklabTriple[]): number[] {
  return colors.flatMap((c) => [c.l, c.a, c.b, 1]);
}

/**
 * A palette color source: each instance takes the palette entry at its integer
 * `index`, wrapping (`index mod N`) so a field larger than the palette repeats
 * it — "every dot a different color". The palette bakes to an N-texel OKLab LUT
 * sampled with `nearest` filter, so an index hits its entry exactly with no
 * blend; the coord lands on the texel centre `((index mod N) + 0.5) / N`.
 *
 * [LAW:dataflow-not-control-flow] Selection is the sample *coordinate* (a value
 *   derived from `index`), not a branch over which color to pick.
 */
export function paletteColorPlan(colors: readonly string[]): ColorPlan {
  const n = colors.length;
  const lut: ColorLut = {
    width: n,
    pixels: oklabLutPixels(colors.map(hexToOklab)),
    filter: 'nearest',
  };
  const wrapped = mod(intrinsic('index'), konst(n));
  const coord = mul(add(wrapped, konst(0.5)), konst(1 / n));
  return { kind: 'lut', lut, coord };
}

/**
 * An N-stop gradient color source: each instance's color is the ramp sampled at
 * its normalized `rank`. The stops bake to an N-texel OKLab LUT sampled with
 * `linear` filter, so the GPU interpolates *between adjacent stops in OKLab* —
 * the same perceptual lerp `gradientColorBinding` does by hand, generalized to N
 * stops for free. The coord maps `rank ∈ [0,1]` onto the texel-centre span
 * `[0.5/N, (N-0.5)/N]` so `rank=0` is exactly stop 0 and `rank=1` exactly the
 * last stop.
 *
 * [LAW:carrying-cost] One LUT mechanism subsumes the 2-stop math gradient and
 *   every N-stop ramp; the stop count is a value, not a new block per arity.
 */
export function gradientLutColorPlan(stops: readonly string[]): ColorPlan {
  const n = stops.length;
  const lut: ColorLut = {
    width: n,
    pixels: oklabLutPixels(stops.map(hexToOklab)),
    filter: 'linear',
  };
  const coord = mul(add(konst(0.5), mul(intrinsic('rank'), konst(n - 1))), konst(1 / n));
  return { kind: 'lut', lut, coord };
}

/**
 * Scale a per-channel-math color's luminance by `factor`. For HSL that is the
 * lightness channel; for RGB/RGBA it is each color channel uniformly (alpha is
 * opacity, not luminance, so it is preserved); for OKLab it is lightness *and*
 * the chroma axes together (scaling l alone over-saturates and clips hue).
 *
 * [LAW:types-are-the-program] Exhaustive over the color-space union: a new space
 *   is a compile error here until its brightening is declared.
 */
function scaleLuminance(color: ColorBinding, factor: number): ColorBinding {
  const k = konst(factor);
  switch (color.space) {
    case 'oklab':
      return { space: 'oklab', l: mul(color.l, k), a: mul(color.a, k), b: mul(color.b, k) };
    case 'hsl':
      return { ...color, l: mul(color.l, k) };
    case 'rgb':
      return { space: 'rgb', r: mul(color.r, k), g: mul(color.g, k), b: mul(color.b, k) };
    case 'rgba':
      return { space: 'rgba', r: mul(color.r, k), g: mul(color.g, k), b: mul(color.b, k), a: color.a };
    default:
      return assertNeverColor(color);
  }
}

/**
 * Scale a {@link ColorPlan}'s luminance by `factor`, total over both color
 * representations. A `binding` scales its channels (above); a `lut` re-scales the
 * OKLab lightness/chroma of every baked texel (alpha preserved), so brightening
 * composes onto a palette/gradient exactly as it does onto a solid color.
 *
 * [LAW:dataflow-not-control-flow] Both arms are handled — brightness over a LUT
 *   is a pure pixel transform, never a silent pass-through that drops the effect.
 */
export function scaleColorPlanLuminance(color: ColorPlan, factor: number): ColorPlan {
  switch (color.kind) {
    case 'binding':
      return bindingColor(scaleLuminance(color.binding, factor));
    case 'lut': {
      const pixels = color.lut.pixels.map((v, i) => (i % 4 === 3 ? v : v * factor));
      return { kind: 'lut', lut: { ...color.lut, pixels }, coord: color.coord };
    }
    default:
      return assertNeverColorPlan(color);
  }
}

function assertNeverColor(value: never): never {
  throw new Error(`[scene] unhandled color space: ${JSON.stringify(value)}`);
}

function assertNeverColorPlan(value: never): never {
  throw new Error(`[scene] unhandled color plan: ${JSON.stringify(value)}`);
}
