/**
 * OKLCH → RGB color space conversion (sRGB-encoded).
 *
 * Single enforcer for OKLCH→RGB math. Used by both
 * ValueExprMaterializer (many extent) and ValueExprScalarEvaluator (one extent).
 *
 * Input: h ∈ [0,1), s ∈ [0,1], l ∈ [0,1] (all normalized floats)
 * Output: [r, g, b] each ∈ [0,1] (sRGB-encoded)
 *
 * Algorithm: Standard OKLCH→RGB per CSS Color Level 3 spec.
 */

import { wrapToPhase01 } from '../utilities/phase';

function hue2rgb(p: number, q: number, t: number): number {
  // [LAW:one-source-of-truth] Phase wrapping for hue interpolation is shared
  // through utilities/phase, not reimplemented here.
  t = wrapToPhase01(t);
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/**
 * Convert OKLCH to RGB.
 *
 * @param h - Hue in [0,1) (wrapped)
 * @param s - Saturation in [0,1]
 * @param l - Lightness in [0,1]
 * @returns [r, g, b] each in [0,1]
 */
export function hslToRgbScalar(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    return [l, l, l]; // Achromatic
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);
  return [r, g, b];
}
