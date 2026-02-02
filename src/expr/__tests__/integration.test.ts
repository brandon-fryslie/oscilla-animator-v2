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

    it('single-component swizzle compiles successfully (v.x)', () => {
      const vSig = builder.constant(vec3Const(1, 2, 3), canonicalType(VEC3));

      const result = compileExpression(
        'v.x',
        new Map([['v', canonicalType(VEC3)]]),
        builder,
        new Map([['v', vSig]])
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Verify the result is a valid ValueExprId
        const expr = builder.getValueExpr(result.value);
        expect(expr).toBeDefined();
        expect(expr?.kind).toBe('extract');
        if (expr && expr.kind === 'extract') {
          expect(expr.componentIndex).toBe(0);
        }
      }
    });

    it('multi-component swizzle compiles to construct/extract (v.xy)', () => {
      const vSig = builder.constant(vec3Const(1, 2, 3), canonicalType(VEC3));

      const result = compileExpression(
        'v.xy',
        new Map([['v', canonicalType(VEC3)]]),
        builder,
        new Map([['v', vSig]])
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Verify the result is a construct node
        const expr = builder.getValueExpr(result.value);
        expect(expr).toBeDefined();
        expect(expr?.kind).toBe('construct');
        if (expr && expr.kind === 'construct') {
          expect(expr.components.length).toBe(2);
          // Verify components are extract nodes
          const comp0 = builder.getValueExpr(expr.components[0]);
          const comp1 = builder.getValueExpr(expr.components[1]);
          expect(comp0?.kind).toBe('extract');
          expect(comp1?.kind).toBe('extract');
        }
      }
    });

    it('color.rgb compiles to construct with 3 extract nodes', () => {
      const cSig = builder.constant(colorConst(255, 128, 64, 255), canonicalType(COLOR));

      const result = compileExpression(
        'c.rgb',
        new Map([['c', canonicalType(COLOR)]]),
        builder,
        new Map([['c', cSig]])
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const expr = builder.getValueExpr(result.value);
        expect(expr).toBeDefined();
        expect(expr?.kind).toBe('construct');
        if (expr && expr.kind === 'construct') {
          expect(expr.components.length).toBe(3);
        }
      }
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
