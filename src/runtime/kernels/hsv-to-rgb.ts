/**
 * ══════════════════════════════════════════════════════════════════════
 * HSV_TO_RGB - HSV to RGB Color Conversion Kernel
 * ══════════════════════════════════════════════════════════════════════
 *
 * Convert HSV (Hue, Saturation, Value) to RGBA color.
 *
 * Properties:
 * - Deterministic: same (h, s, v) → same (r, g, b, a), always
 * - Pure: no internal state, no side effects
 * - Range: outputs r,g,b,a all in [0, 1]
 * - Alpha: always writes 1.0 (full opacity)
 *
 * Signature: hsvToRgb(h, s, v) → writes 4 components (r, g, b, a) to output buffer
 * - h: hue in [0, 1] (wraps outside this range)
 * - s: saturation in [0, 1] (clamped)
 * - v: value/brightness in [0, 1] (clamped)
 *
 * Output format (Float32Array, stride 4):
 * - out[outBase + 0] = r (red, 0-1)
 * - out[outBase + 1] = g (green, 0-1)
 * - out[outBase + 2] = b (blue, 0-1)
 * - out[outBase + 3] = a (alpha, always 1.0)
 *
 * ══════════════════════════════════════════════════════════════════════
 */

import type { LaneKernel } from '../KernelRegistry';

/**
 * HSV to RGBA conversion kernel (lane kernel with stride 4)
 */
export const hsvToRgb: LaneKernel = (
  out: Float32Array,
  outBase: number,
  args: number[]
): void => {
  const [h, s, v] = args;

  // Wrap hue to [0, 1]
  const hNorm = ((h % 1) + 1) % 1;

  // Clamp saturation and value to [0, 1]
  const sClamp = Math.max(0, Math.min(1, s));
  const vClamp = Math.max(0, Math.min(1, v));

  // HSV to RGB conversion
  const c = vClamp * sClamp; // Chroma
  const x = c * (1 - Math.abs(((hNorm * 6) % 2) - 1));
  const m = vClamp - c;

  let r1, g1, b1;
  const h6 = hNorm * 6;

  if (h6 < 1) {
    [r1, g1, b1] = [c, x, 0];
  } else if (h6 < 2) {
    [r1, g1, b1] = [x, c, 0];
  } else if (h6 < 3) {
    [r1, g1, b1] = [0, c, x];
  } else if (h6 < 4) {
    [r1, g1, b1] = [0, x, c];
  } else if (h6 < 5) {
    [r1, g1, b1] = [x, 0, c];
  } else {
    [r1, g1, b1] = [c, 0, x];
  }

  // Write to output buffer (normalized to [0, 1])
  out[outBase + 0] = r1 + m; // Red
  out[outBase + 1] = g1 + m; // Green
  out[outBase + 2] = b1 + m; // Blue
  out[outBase + 3] = 1.0;     // Alpha (full opacity)
};
