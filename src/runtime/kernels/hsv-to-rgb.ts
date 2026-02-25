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
import { hsvToRgba01 } from '../../utilities/color';

/**
 * HSV to RGBA conversion kernel (lane kernel with stride 4)
 */
export const hsvToRgb: LaneKernel = (
  out: Float32Array,
  outBase: number,
  args: number[]
): void => {
  const [h, s, v] = args;
  // [LAW:one-source-of-truth] HSV conversion math lives in utilities/color.
  const [r, g, b, a] = hsvToRgba01(h, s, v);
  out[outBase + 0] = r;
  out[outBase + 1] = g;
  out[outBase + 2] = b;
  out[outBase + 3] = a;
};
