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

import { add, cos, konst, mul, sin, type ColorBinding, type PlanExpr } from '../../render/scene-plan';

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
