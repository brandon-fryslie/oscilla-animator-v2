/**
 * Shared OKLCH conversion helpers.
 *
 * // [LAW:one-source-of-truth] All OKLCH conversion constants and scalar math
 * live in one module so runtime, compiler, and UI stay numerically aligned.
 */

import { wrapToPhase01 } from '../../utilities/phase';

export const OKLCH_HUE_TAU = Math.PI * 2;

export const OKLAB_L_FROM_OKLAB = {
  l: { l: 1, a: 0.3963377774, b: 0.2158037573 },
  m: { l: 1, a: -0.1055613458, b: -0.0638541728 },
  s: { l: 1, a: -0.0894841775, b: -1.2914855480 },
} as const;

export const XYZ_FROM_LMS_CUBED = {
  x: { l: 1.2270138511035211, m: -0.5577999806518222, s: 0.2812561489664678 },
  y: { l: -0.0405801784232806, m: 1.11225686961683, s: -0.0716766786656012 },
  z: { l: -0.0763812845057069, m: -0.4214819784180127, s: 1.5861632204407947 },
} as const;

export const LINEAR_SRGB_FROM_XYZ = {
  r: { x: 3.240969941904521, y: -1.537383177570093, z: -0.498610760293 },
  g: { x: -0.96924363628087, y: 1.87596750150772, z: 0.041555057407175 },
  b: { x: 0.055630079696993, y: -0.20397695888897, z: 1.056971514242878 },
} as const;

export function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Convert normalized OKLCH channels to Oklab channels.
 *
 * @param hTurns - Hue in turns [0,1)
 * @param chroma - Chroma (typically 0..1 in this app's contracts)
 * @param lightness - Lightness [0,1]
 */
export function oklchToOklab(
  hTurns: number,
  chroma: number,
  lightness: number,
): readonly [l: number, a: number, b: number] {
  const wrappedHue = wrapToPhase01(hTurns) * OKLCH_HUE_TAU;
  return [
    lightness,
    chroma * Math.cos(wrappedHue),
    chroma * Math.sin(wrappedHue),
  ] as const;
}

/**
 * Convert Oklab channels to linear-light sRGB.
 */
export function oklabToLinearSrgb(
  l: number,
  a: number,
  b: number,
): readonly [r: number, g: number, b: number] {
  const lPrime = OKLAB_L_FROM_OKLAB.l.l * l + OKLAB_L_FROM_OKLAB.l.a * a + OKLAB_L_FROM_OKLAB.l.b * b;
  const mPrime = OKLAB_L_FROM_OKLAB.m.l * l + OKLAB_L_FROM_OKLAB.m.a * a + OKLAB_L_FROM_OKLAB.m.b * b;
  const sPrime = OKLAB_L_FROM_OKLAB.s.l * l + OKLAB_L_FROM_OKLAB.s.a * a + OKLAB_L_FROM_OKLAB.s.b * b;

  const lCube = lPrime * lPrime * lPrime;
  const mCube = mPrime * mPrime * mPrime;
  const sCube = sPrime * sPrime * sPrime;

  const x = XYZ_FROM_LMS_CUBED.x.l * lCube + XYZ_FROM_LMS_CUBED.x.m * mCube + XYZ_FROM_LMS_CUBED.x.s * sCube;
  const y = XYZ_FROM_LMS_CUBED.y.l * lCube + XYZ_FROM_LMS_CUBED.y.m * mCube + XYZ_FROM_LMS_CUBED.y.s * sCube;
  const z = XYZ_FROM_LMS_CUBED.z.l * lCube + XYZ_FROM_LMS_CUBED.z.m * mCube + XYZ_FROM_LMS_CUBED.z.s * sCube;

  return [
    LINEAR_SRGB_FROM_XYZ.r.x * x + LINEAR_SRGB_FROM_XYZ.r.y * y + LINEAR_SRGB_FROM_XYZ.r.z * z,
    LINEAR_SRGB_FROM_XYZ.g.x * x + LINEAR_SRGB_FROM_XYZ.g.y * y + LINEAR_SRGB_FROM_XYZ.g.z * z,
    LINEAR_SRGB_FROM_XYZ.b.x * x + LINEAR_SRGB_FROM_XYZ.b.y * y + LINEAR_SRGB_FROM_XYZ.b.z * z,
  ] as const;
}

/**
 * Convert linear-light sRGB channel to encoded sRGB channel.
 */
export function linearSrgbToEncoded(channel: number): number {
  if (channel <= 0.0031308) {
    return 12.92 * channel;
  }
  return 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

/**
 * Convert normalized OKLCH channels directly to encoded sRGB channels.
 */
export function oklchToEncodedSrgb(
  hTurns: number,
  chroma: number,
  lightness: number,
): readonly [r: number, g: number, b: number] {
  const [l, a, b] = oklchToOklab(hTurns, chroma, lightness);
  const [linearR, linearG, linearB] = oklabToLinearSrgb(l, a, b);
  return [
    clamp01(linearSrgbToEncoded(linearR)),
    clamp01(linearSrgbToEncoded(linearG)),
    clamp01(linearSrgbToEncoded(linearB)),
  ] as const;
}

/**
 * Format normalized channels as CSS `oklch(...)`.
 */
export function toCssOklch(hTurns: number, chroma: number, lightness: number, alpha: number): string {
  const wrappedHueDegrees = wrapToPhase01(hTurns) * 360;
  return `oklch(${(clamp01(lightness) * 100).toFixed(3)}% ${Math.max(0, chroma).toFixed(6)} ${wrappedHueDegrees.toFixed(3)} / ${clamp01(alpha).toFixed(6)})`;
}
