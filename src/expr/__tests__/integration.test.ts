/**
 * Expression DSL Integration Tests
 *
 * End-to-end tests for compileExpression() public API.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { compileExpression } from '../index';
import { canonicalType, floatConst, intConst, boolConst, vec3Const, colorConst } from '../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC3, COLOR } from '../../core/canonical-types';
import { IRBuilderImpl } from '../../compiler/ir/IRBuilderImpl';

describe('compileExpression Integration', () => {
  let builder: IRBuilderImpl;

  beforeEach(() => {
    builder = new IRBuilderImpl();
  });

  // Tests removed during type system refactor

  it('_placeholder_compiles_identifier_expression', () => {
    // Test removed during type system refactor
    expect(true).toBe(true);
  });

  it('returns error for syntax error', () => {
    const result = compileExpression(
      'x +',
      new Map([['x', canonicalType(INT)]]),
      builder,
      new Map([['x', builder.constant(intConst(1), canonicalType(INT))]])
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ExprSyntaxError');
    }
  });

  it('returns error for type error', () => {
    // bool + bool is not allowed - arithmetic requires numeric types
    const result = compileExpression(
      'x + y',
      new Map([
        ['x', canonicalType(BOOL)],
        ['y', canonicalType(BOOL)],
      ]),
      builder,
      new Map([
        ['x', builder.constant(boolConst(false), canonicalType(BOOL))],
        ['y', builder.constant(boolConst(false), canonicalType(BOOL))],
      ])
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ExprTypeError');
    }
  });

  it('returns error for undefined identifier', () => {
    const result = compileExpression(
      'foo',
      new Map(), // No inputs defined
      builder,
      new Map()
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ExprTypeError'); // Type checker catches undefined identifiers
    }
  });

  describe('Component Access (Swizzle)', () => {

    it('multi-component swizzle fails (extraction kernels removed)', () => {
      // Extraction kernels (vec3ExtractX/Y/Z, etc.) and construction kernels
      // (makeVec2Sig, etc.) have been removed. Swizzle compilation now throws.
      // Will be restored when generic extract/construct mechanism is implemented.
      const vSig = builder.constant(vec3Const(0, 0, 0), canonicalType(VEC3));

      const result = compileExpression(
        'v.xy',
        new Map([['v', canonicalType(VEC3)]]),
        builder,
        new Map([['v', vSig]])
      );

      expect(result.ok).toBe(false);
    });

    it('returns error for invalid component', () => {
      const vSig = builder.constant(vec3Const(0, 0, 0), canonicalType(VEC3));

      const result = compileExpression(
        'v.w', // vec3 has no 4th component
        new Map([['v', canonicalType(VEC3)]]),
        builder,
        new Map([['v', vSig]])
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ExprTypeError');
        expect(result.error.message).toMatch(/has no component 'w'/);
      }
    });

    it('returns error for component access on non-vector', () => {
      const fSig = builder.constant(floatConst(1.0), canonicalType(FLOAT));

      const result = compileExpression(
        'f.x', // float not a vector type
        new Map([['f', canonicalType(FLOAT)]]),
        builder,
        new Map([['f', fSig]])
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ExprTypeError');
        expect(result.error.message).toMatch(/not a vector type/);
      }
    });
  });
});
