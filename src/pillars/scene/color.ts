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

import { konst, type ColorBinding } from '../../render/scene-plan';

const CHANNEL_MAX = 255;

/** Decode one sRGB display channel (0..1) to linear light. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
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
  const channel = (start: number): number =>
    srgbToLinear(parseInt(hex.slice(start, start + 2), 16) / CHANNEL_MAX);
  const lin = { r: channel(1), g: channel(3), b: channel(5) };

  // linear sRGB → LMS (Ottosson) → cube-root → OKLab.
  const l_ = Math.cbrt(0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b);
  const m_ = Math.cbrt(0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b);
  const s_ = Math.cbrt(0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b);

  return {
    space: 'oklab',
    l: konst(0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_),
    a: konst(1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_),
    b: konst(0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_),
  };
}
