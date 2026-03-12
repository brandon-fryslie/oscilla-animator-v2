import { describe, expect, it } from 'vitest';
import {
  buildCubicRibbonContour,
  clampParametricResolution,
  evaluateCubicBezierPosition,
  generateParametricTemplateTValues,
} from '../ParametricCurveGeometry';

describe('ParametricCurveGeometry', () => {
  it('generates canonical template progression for resolution=4', () => {
    const template = generateParametricTemplateTValues(4);
    expect(Array.from(template)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('evaluates cubic bezier point at t=0.5 using analytical fixture', () => {
    const position = evaluateCubicBezierPosition(
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
      0.5,
    );
    expect(position.x).toBeCloseTo(0.5, 6);
    expect(position.y).toBeCloseTo(0.75, 6);
  });

  it('builds finite ribbon contour for collapsed control points (no NaN)', () => {
    const contour = buildCubicRibbonContour(
      new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]),
      8,
      0.03,
    );
    expect(contour.length).toBe((8 + 1) * 4);
    for (const value of contour) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('sanitizes non-finite control points to a finite contour', () => {
    const contour = buildCubicRibbonContour(
      new Float32Array([Number.NaN, 0, Infinity, 1, 1, -Infinity, 0, 0]),
      10,
      0.05,
    );
    for (const value of contour) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('clamps invalid resolution values to minimum supported contract', () => {
    expect(clampParametricResolution(Number.NaN)).toBe(4);
    expect(clampParametricResolution(0)).toBe(4);
    expect(clampParametricResolution(3.9)).toBe(4);
  });
});
