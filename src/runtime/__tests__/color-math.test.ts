import { describe, it, expect } from 'vitest';
import { hslToRgbScalar } from '../color-math';

describe('hslToRgbScalar', () => {
  const expectRgb = (h: number, s: number, l: number, expected: [number, number, number]) => {
    const [r, g, b] = hslToRgbScalar(h, s, l);
    expect(r).toBeCloseTo(expected[0], 4);
    expect(g).toBeCloseTo(expected[1], 4);
    expect(b).toBeCloseTo(expected[2], 4);
  };

  it('converts pure red (h=0, s=1, l=0.5)', () => {
    expectRgb(0, 1, 0.5, [1, 0, 0]);
  });

  it('converts pure green (h=1/3, s=1, l=0.5)', () => {
    expectRgb(1 / 3, 1, 0.5, [0, 1, 0]);
  });

  it('converts pure blue (h=2/3, s=1, l=0.5)', () => {
    expectRgb(2 / 3, 1, 0.5, [0, 0, 1]);
  });

  it('converts achromatic gray (s=0, l=0.5)', () => {
    expectRgb(0, 0, 0.5, [0.5, 0.5, 0.5]);
  });

  it('converts black (l=0)', () => {
    expectRgb(0, 0, 0, [0, 0, 0]);
  });

  it('converts white (l=1)', () => {
    expectRgb(0, 0, 1, [1, 1, 1]);
  });

  it('converts yellow (h=1/6, s=1, l=0.5)', () => {
    expectRgb(1 / 6, 1, 0.5, [1, 1, 0]);
  });

  it('converts cyan (h=0.5, s=1, l=0.5)', () => {
    expectRgb(0.5, 1, 0.5, [0, 1, 1]);
  });

  it('converts magenta (h=5/6, s=1, l=0.5)', () => {
    expectRgb(5 / 6, 1, 0.5, [1, 0, 1]);
  });

  it('handles desaturated color (s=0.5, l=0.5)', () => {
    const [r, g, b] = hslToRgbScalar(0, 0.5, 0.5);
    expect(r).toBeCloseTo(0.75, 4);
    expect(g).toBeCloseTo(0.25, 4);
    expect(b).toBeCloseTo(0.25, 4);
  });

  it('handles light color (l=0.75)', () => {
    const [r, g, b] = hslToRgbScalar(0, 1, 0.75);
    expect(r).toBeCloseTo(1, 4);
    expect(g).toBeCloseTo(0.5, 4);
    expect(b).toBeCloseTo(0.5, 4);
  });

  it('handles dark color (l=0.25)', () => {
    const [r, g, b] = hslToRgbScalar(0, 1, 0.25);
    expect(r).toBeCloseTo(0.5, 4);
    expect(g).toBeCloseTo(0, 4);
    expect(b).toBeCloseTo(0, 4);
  });

  it('all outputs are in [0,1] for random inputs', () => {
    // Property test: for any valid HSL input, outputs are bounded
    const testValues = [0, 0.1, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 0.9, 0.999];
    for (const h of testValues) {
      for (const s of testValues) {
        for (const l of testValues) {
          const [r, g, b] = hslToRgbScalar(h, s, l);
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThanOrEqual(1);
          expect(g).toBeGreaterThanOrEqual(0);
          expect(g).toBeLessThanOrEqual(1);
          expect(b).toBeGreaterThanOrEqual(0);
          expect(b).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('is deterministic', () => {
    const [r1, g1, b1] = hslToRgbScalar(0.3, 0.7, 0.4);
    const [r2, g2, b2] = hslToRgbScalar(0.3, 0.7, 0.4);
    expect(r1).toBe(r2);
    expect(g1).toBe(g2);
    expect(b1).toBe(b2);
  });
});
