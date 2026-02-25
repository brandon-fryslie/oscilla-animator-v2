import { wrapToPhase01 } from './phase';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Convert HSV to RGBA in normalized [0,1] space.
 */
export function hsvToRgba01(h: number, s: number, v: number): [number, number, number, number] {
  const hNorm = wrapToPhase01(h);
  const sClamp = clamp01(s);
  const vClamp = clamp01(v);

  const c = vClamp * sClamp;
  const x = c * (1 - Math.abs(((hNorm * 6) % 2) - 1));
  const m = vClamp - c;
  const h6 = hNorm * 6;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h6 < 1) {
    r1 = c; g1 = x; b1 = 0;
  } else if (h6 < 2) {
    r1 = x; g1 = c; b1 = 0;
  } else if (h6 < 3) {
    r1 = 0; g1 = c; b1 = x;
  } else if (h6 < 4) {
    r1 = 0; g1 = x; b1 = c;
  } else if (h6 < 5) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }

  return [r1 + m, g1 + m, b1 + m, 1.0];
}
