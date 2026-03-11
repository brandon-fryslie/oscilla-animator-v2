/**
 * OKLCH → encoded sRGB conversion.
 *
 * // [LAW:single-enforcer] Runtime scalar OKLCH conversion delegates to one
 * shared core implementation so CPU, compiler, and UI paths stay aligned.
 */

import { oklchToEncodedSrgb } from '../core/color/oklch';

/**
 * Convert normalized OKLCH channels to encoded sRGB channels.
 *
 * @param h - Hue in turns [0,1)
 * @param c - Chroma
 * @param l - Lightness [0,1]
 * @returns [r,g,b] encoded sRGB channels clamped to [0,1]
 */
export function oklchToRgbScalar(h: number, c: number, l: number): [number, number, number] {
  const [r, g, b] = oklchToEncodedSrgb(h, c, l);
  return [r, g, b];
}
