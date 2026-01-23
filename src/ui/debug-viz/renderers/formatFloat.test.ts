import { describe, it, expect } from 'vitest';
import { formatFloat, isInvalidFloat } from './formatFloat';

describe('formatFloat', () => {
  it('formats zero as "0.000"', () => {
    expect(formatFloat(0)).toBe('0.000');
  });

  it('formats negative zero as "0.000"', () => {
    expect(formatFloat(-0)).toBe('0.000');
  });

  it('formats NaN', () => {
    expect(formatFloat(NaN)).toBe('NaN');
  });

  it('formats positive Infinity', () => {
    expect(formatFloat(Infinity)).toBe('+Inf');
  });

  it('formats negative Infinity', () => {
    expect(formatFloat(-Infinity)).toBe('-Inf');
  });

  describe('values in [0.001, 9999]', () => {
    it('formats 0.5 with 4 sig digits', () => {
      expect(formatFloat(0.5)).toBe('0.5000');
    });

    it('formats 1.0 with 4 sig digits', () => {
      expect(formatFloat(1.0)).toBe('1.000');
    });

    it('formats 3.14159 with 4 sig digits', () => {
      expect(formatFloat(3.14159)).toBe('3.142');
    });

    it('formats 9999 within range', () => {
      expect(formatFloat(9999)).toBe('9999');
    });

    it('formats 0.001 at lower boundary', () => {
      expect(formatFloat(0.001)).toBe('0.001000');
    });

    it('formats negative values in range', () => {
      expect(formatFloat(-2.5)).toBe('-2.500');
    });

    it('formats 42.0', () => {
      expect(formatFloat(42)).toBe('42.00');
    });
  });

  describe('values outside [0.001, 9999]', () => {
    it('formats very small values in scientific notation', () => {
      expect(formatFloat(0.0001)).toBe('1.00e-4');
    });

    it('formats very large values in scientific notation', () => {
      expect(formatFloat(10000)).toBe('1.00e+4');
    });

    it('formats very large negative values', () => {
      expect(formatFloat(-100000)).toBe('-1.00e+5');
    });

    it('formats extremely small values', () => {
      expect(formatFloat(1e-20)).toBe('1.00e-20');
    });
  });
});

describe('isInvalidFloat', () => {
  it('returns true for NaN', () => {
    expect(isInvalidFloat(NaN)).toBe(true);
  });

  it('returns true for Infinity', () => {
    expect(isInvalidFloat(Infinity)).toBe(true);
  });

  it('returns true for -Infinity', () => {
    expect(isInvalidFloat(-Infinity)).toBe(true);
  });

  it('returns false for 0', () => {
    expect(isInvalidFloat(0)).toBe(false);
  });

  it('returns false for normal numbers', () => {
    expect(isInvalidFloat(42.5)).toBe(false);
  });
});
