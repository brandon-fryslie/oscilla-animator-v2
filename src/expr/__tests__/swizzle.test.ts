/**
 * Swizzle Utility Tests
 *
 * Tests for swizzle.ts utilities: component indexing, validation, and result types.
 */

import { describe, it, expect } from 'vitest';
import {
  componentIndex,
  isVectorType,
  vectorComponentCount,
  validateSwizzle,
  swizzleResultType,
  isValidSwizzle,
  POSITION_COMPONENTS,
  COLOR_COMPONENTS,
} from '../swizzle';
import { FLOAT, VEC2, VEC3, COLOR } from '../../core/canonical-types';

describe('Swizzle Constants', () => {
  it('POSITION_COMPONENTS contains x, y, z', () => {
    expect(POSITION_COMPONENTS).toEqual(['x', 'y', 'z']);
  });

  it('COLOR_COMPONENTS contains r, g, b, a', () => {
    expect(COLOR_COMPONENTS).toEqual(['r', 'g', 'b', 'a']);
  });
});

describe('componentIndex', () => {
  it('maps x/r to 0', () => {
    expect(componentIndex('x')).toBe(0);
    expect(componentIndex('r')).toBe(0);
  });

  it('maps y/g to 1', () => {
    expect(componentIndex('y')).toBe(1);
    expect(componentIndex('g')).toBe(1);
  });

  it('maps z/b to 2', () => {
    expect(componentIndex('z')).toBe(2);
    expect(componentIndex('b')).toBe(2);
  });

  it('maps w/a to 3', () => {
    expect(componentIndex('w')).toBe(3);
    expect(componentIndex('a')).toBe(3);
  });

  it('returns -1 for invalid component', () => {
    expect(componentIndex('invalid')).toBe(-1);
    expect(componentIndex('q')).toBe(-1);
    expect(componentIndex('!')).toBe(-1);
  });
});

describe('isVectorType', () => {
  it('returns true for vec2', () => {
    expect(isVectorType(VEC2)).toBe(true);
  });

  it('returns true for vec3', () => {
    expect(isVectorType(VEC3)).toBe(true);
  });

  it('returns true for color', () => {
    expect(isVectorType(COLOR)).toBe(true);
  });

  it('returns false for float', () => {
    expect(isVectorType(FLOAT)).toBe(false);
  });
});

describe('vectorComponentCount', () => {
  it('returns 2 for vec2', () => {
    expect(vectorComponentCount(VEC2)).toBe(2);
  });

  it('returns 3 for vec3', () => {
    expect(vectorComponentCount(VEC3)).toBe(3);
  });

  it('returns 4 for color', () => {
    expect(vectorComponentCount(COLOR)).toBe(4);
  });

  it('returns 0 for float', () => {
    expect(vectorComponentCount(FLOAT)).toBe(0);
  });
});

describe('validateSwizzle', () => {
  describe('vec3 patterns', () => {
    it('accepts single component x, y, z', () => {
      expect(validateSwizzle('x', VEC3)).toBeUndefined();
      expect(validateSwizzle('y', VEC3)).toBeUndefined();
      expect(validateSwizzle('z', VEC3)).toBeUndefined();
    });

    it('accepts cross-access r, g, b', () => {
      expect(validateSwizzle('r', VEC3)).toBeUndefined();
      expect(validateSwizzle('g', VEC3)).toBeUndefined();
      expect(validateSwizzle('b', VEC3)).toBeUndefined();
    });

    it('accepts multi-component patterns', () => {
      expect(validateSwizzle('xy', VEC3)).toBeUndefined();
      expect(validateSwizzle('xz', VEC3)).toBeUndefined();
      expect(validateSwizzle('xyz', VEC3)).toBeUndefined();
      expect(validateSwizzle('zyx', VEC3)).toBeUndefined();
    });

    it('rejects w and a (no 4th component)', () => {
      expect(validateSwizzle('w', VEC3)).toMatch(/has no component 'w'/);
      expect(validateSwizzle('a', VEC3)).toMatch(/has no component 'a'/);
    });

    it('rejects invalid characters', () => {
      expect(validateSwizzle('q', VEC3)).toMatch(/Invalid component 'q'/);
    });

    it('rejects patterns too long', () => {
      expect(validateSwizzle('xyzxy', VEC3)).toMatch(/too long/);
    });
  });

  describe('color patterns', () => {
    it('accepts single component r, g, b, a', () => {
      expect(validateSwizzle('r', COLOR)).toBeUndefined();
      expect(validateSwizzle('g', COLOR)).toBeUndefined();
      expect(validateSwizzle('b', COLOR)).toBeUndefined();
      expect(validateSwizzle('a', COLOR)).toBeUndefined();
    });

    it('accepts cross-access x, y, z, w', () => {
      expect(validateSwizzle('x', COLOR)).toBeUndefined();
      expect(validateSwizzle('y', COLOR)).toBeUndefined();
      expect(validateSwizzle('z', COLOR)).toBeUndefined();
      expect(validateSwizzle('w', COLOR)).toBeUndefined();
    });

    it('accepts multi-component patterns', () => {
      expect(validateSwizzle('rgb', COLOR)).toBeUndefined();
      expect(validateSwizzle('rgba', COLOR)).toBeUndefined();
      expect(validateSwizzle('bgra', COLOR)).toBeUndefined();
      expect(validateSwizzle('ar', COLOR)).toBeUndefined();
    });
  });

  describe('vec2 patterns', () => {
    it('accepts x and y', () => {
      expect(validateSwizzle('x', VEC2)).toBeUndefined();
      expect(validateSwizzle('y', VEC2)).toBeUndefined();
      expect(validateSwizzle('xy', VEC2)).toBeUndefined();
    });

    it('rejects z', () => {
      expect(validateSwizzle('z', VEC2)).toMatch(/has no component 'z'/);
    });
  });

  describe('error cases', () => {
    it('rejects empty pattern', () => {
      expect(validateSwizzle('', VEC3)).toMatch(/Empty swizzle pattern/);
    });

    it('rejects non-vector types', () => {
      expect(validateSwizzle('x', FLOAT)).toMatch(/does not support component access/);
    });
  });
});

describe('swizzleResultType', () => {
  it('returns FLOAT for single component', () => {
    expect(swizzleResultType('x')).toEqual(FLOAT);
    expect(swizzleResultType('r')).toEqual(FLOAT);
  });

  it('returns VEC2 for two components', () => {
    expect(swizzleResultType('xy')).toEqual(VEC2);
    expect(swizzleResultType('rg')).toEqual(VEC2);
  });

  it('returns VEC3 for three components', () => {
    expect(swizzleResultType('xyz')).toEqual(VEC3);
    expect(swizzleResultType('rgb')).toEqual(VEC3);
  });

  it('returns COLOR for four components', () => {
    expect(swizzleResultType('rgba')).toEqual(COLOR);
    expect(swizzleResultType('xyzw')).toEqual(COLOR);
  });

  it('throws for invalid pattern length', () => {
    expect(() => swizzleResultType('')).toThrow();
    expect(() => swizzleResultType('xyzwx')).toThrow();
  });
});

describe('isValidSwizzle', () => {
  it('returns true for valid patterns', () => {
    expect(isValidSwizzle('x', VEC3)).toBe(true);
    expect(isValidSwizzle('xyz', VEC3)).toBe(true);
    expect(isValidSwizzle('rgba', COLOR)).toBe(true);
  });

  it('returns false for invalid patterns', () => {
    expect(isValidSwizzle('w', VEC3)).toBe(false);
    expect(isValidSwizzle('x', FLOAT)).toBe(false);
    expect(isValidSwizzle('', VEC3)).toBe(false);
  });
});
