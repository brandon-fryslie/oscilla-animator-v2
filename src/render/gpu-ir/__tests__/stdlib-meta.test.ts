/**
 * Tests for WGSL function metadata extraction via wgsl_reflect.
 *
 * Validates that extractWgslMeta correctly parses stdlib WGSL sources and
 * that STDLIB_META is pre-computed for all standard library functions.
 */
import { describe, it, expect } from 'vitest';
import { extractWgslMeta, STDLIB, STDLIB_META } from '../stdlib';

describe('extractWgslMeta', () => {
  it('extracts hash_u32 signature', () => {
    const meta = extractWgslMeta(STDLIB.find(f => f.name === 'hash_u32')!);
    expect(meta).toEqual({
      name: 'hash_u32',
      params: [{ name: 'v', type: 'u32' }],
      returnType: 'u32',
    });
  });

  it('extracts noise_simplex_2d signature', () => {
    const meta = extractWgslMeta(STDLIB.find(f => f.name === 'noise_simplex_2d')!);
    expect(meta).toEqual({
      name: 'noise_simplex_2d',
      params: [{ name: 'v', type: 'vec2f' }],
      returnType: 'f32',
    });
  });

  it('extracts noise_simplex_3d signature', () => {
    const meta = extractWgslMeta(STDLIB.find(f => f.name === 'noise_simplex_3d')!);
    expect(meta).toEqual({
      name: 'noise_simplex_3d',
      params: [{ name: 'v', type: 'vec3f' }],
      returnType: 'f32',
    });
  });

  it('throws for function name not in WGSL source', () => {
    expect(() =>
      extractWgslMeta({ name: 'nonexistent', wgsl: 'fn foo(x: f32) -> f32 { return x; }' }),
    ).toThrow("WGSL function 'nonexistent' not found in source");
  });
});

describe('STDLIB_META', () => {
  it('contains an entry for every stdlib function', () => {
    for (const fn of STDLIB) {
      expect(STDLIB_META.has(fn.name)).toBe(true);
    }
  });

  it('has the correct number of entries', () => {
    expect(STDLIB_META.size).toBe(STDLIB.length);
  });
});
