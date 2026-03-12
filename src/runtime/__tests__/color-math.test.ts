import { describe, it, expect } from 'vitest';
import { oklchToRgbScalar } from '../color-math';

describe('oklchToRgbScalar', () => {
  const expectRgb = (h: number, c: number, l: number, expected: [number, number, number]) => {
    const [r, g, b] = oklchToRgbScalar(h, c, l);
    expect(r).toBeCloseTo(expected[0], 3);
    expect(g).toBeCloseTo(expected[1], 3);
    expect(b).toBeCloseTo(expected[2], 3);
  };

  it('converts achromatic gray (c=0) with equal channels', () => {
    const [r, g, b] = oklchToRgbScalar(0, 0, 0.5);
    expect(r).toBeCloseTo(g, 3);
    expect(g).toBeCloseTo(b, 3);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(1);
  });

  it('converts black (l=0)', () => {
    expectRgb(0, 0, 0, [0, 0, 0]);
  });

  it('converts white (l=1)', () => {
    expectRgb(0, 0, 1, [1, 1, 1]);
  });

  it('maps known OKLCH red primary to sRGB red', () => {
    // Source: canonical Oklab/OKLCH values for sRGB red.
    const [r, g, b] = oklchToRgbScalar(29.2338851923426 / 360, 0.2576833077361567, 0.6279553606145516);
    expect(r).toBeCloseTo(1, 3);
    expect(g).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
  });

  it('maps known OKLCH green primary to sRGB green', () => {
    const [r, g, b] = oklchToRgbScalar(142.49533888780996 / 360, 0.2948272403370167, 0.8664396115356694);
    expect(r).toBeLessThan(0.01);
    expect(g).toBeGreaterThan(0.99);
    expect(b).toBeLessThan(0.01);
  });

  it('maps known OKLCH blue primary to sRGB blue', () => {
    const [r, g, b] = oklchToRgbScalar(264.052020638055 / 360, 0.31321437166460114, 0.4520137183853429);
    expect(r).toBeLessThan(0.01);
    expect(g).toBeLessThan(0.01);
    expect(b).toBeGreaterThan(0.99);
  });

  it('all outputs are in [0,1] for random inputs', () => {
    // Property test: for any valid OKLCH input, outputs are bounded
    const testValues = [0, 0.1, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 0.9, 0.999];
    for (const h of testValues) {
      for (const c of testValues) {
        for (const l of testValues) {
          const [r, g, b] = oklchToRgbScalar(h, c, l);
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
    const [r1, g1, b1] = oklchToRgbScalar(0.3, 0.2, 0.7);
    const [r2, g2, b2] = oklchToRgbScalar(0.3, 0.2, 0.7);
    expect(r1).toBe(r2);
    expect(g1).toBe(g2);
    expect(b1).toBe(b2);
  });
});
