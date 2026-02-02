/**
 * HSL → RGB color space conversion (sRGB-encoded).
 *
 * Single enforcer for HSL→RGB math. Used by both
 * ValueExprMaterializer (field-extent) and ValueExprSignalEvaluator (signal-extent).
 *
 * Input: h ∈ [0,1), s ∈ [0,1], l ∈ [0,1] (all normalized floats)
 * Output: [r, g, b] each ∈ [0,1] (sRGB-encoded)
 *
 * Algorithm: Standard HSL→RGB per CSS Color Level 3 spec.
 */

function hue2rgb(p: number, q: number, t: number): number {
  // Wrap t to [0,1)
  t = ((t % 1) + 1) % 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/**
 * Convert HSL to RGB.
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
