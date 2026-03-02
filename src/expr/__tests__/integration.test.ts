/**
 * Expression DSL Integration Tests
 *
 * End-to-end tests for compileExpression() public API.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { compileExpression } from '../index';
import {
  canonicalType,
  canonicalMany,
  requireInst,
  instanceRef,
  floatConst,
  intConst,
  boolConst,
  vec3Const,
  colorConst,
} from '../../core/canonical-types';
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

  it('compiles named constants without explicit inputs', () => {
    const result = compileExpression(
      'sin(pi * 0.5) + tau * deg2rad',
      new Map(),
      builder,
      new Map()
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const expr = builder.getValueExpr(result.value);
      expect(expr).toBeDefined();
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
        // Constant inputs may fold swizzles to const; non-folded paths remain extract.
        const expr = builder.getValueExpr(result.value);
        expect(expr).toBeDefined();
        if (expr?.kind === 'extract') {
          expect(expr.componentIndex).toBe(0);
        } else {
          expect(expr?.kind).toBe('const');
          if (expr?.kind === 'const') {
            expect(expr.value).toEqual(floatConst(1));
          }
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
          // Constant-folding may reduce extract nodes to const components.
          const comp0 = builder.getValueExpr(expr.components[0]);
          const comp1 = builder.getValueExpr(expr.components[1]);
          if (comp0?.kind === 'extract') {
            expect(comp0.componentIndex).toBe(0);
          } else {
            expect(comp0?.kind).toBe('const');
            if (comp0?.kind === 'const') {
              expect(comp0.value).toEqual(floatConst(1));
            }
          }
          if (comp1?.kind === 'extract') {
            expect(comp1.componentIndex).toBe(1);
          } else {
            expect(comp1?.kind).toBe('const');
            if (comp1?.kind === 'const') {
              expect(comp1.value).toEqual(floatConst(2));
            }
          }
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
        expect(result.error.message).toMatch(/Cannot access member/);
      }
    });
  });

  describe('Many-cardinality propagation', () => {
    it('preserves many extent for arithmetic with scalar literals', () => {
      const inst = instanceRef('grid', 'inst_expr_many');
      const manyFloat = canonicalMany(FLOAT, undefined, inst);
      const field = builder.intrinsic('normalizedIndex', manyFloat);

      const result = compileExpression(
        'x + 1',
        new Map([['x', manyFloat]]),
        builder,
        new Map([['x', field]])
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const expr = builder.getValueExpr(result.value);
        expect(expr).toBeDefined();
        const card = requireInst(expr!.type.extent.cardinality, 'cardinality');
        expect(card.kind).toBe('many');
        if (card.kind === 'many') {
          expect(card.instance.instanceId).toBe(inst.instanceId);
        }
      }
    });

    it('preserves many extent for vector swizzle on field inputs', () => {
      const inst = instanceRef('grid', 'inst_expr_swizzle');
      const manyFloat = canonicalMany(FLOAT, undefined, inst);
      const manyVec3 = canonicalMany(VEC3, undefined, inst);

      const x = builder.intrinsic('normalizedIndex', manyFloat);
      const y = builder.intrinsic('normalizedIndex', manyFloat);
      const z = builder.intrinsic('normalizedIndex', manyFloat);
      const v = builder.constructAuto([x, y, z], manyVec3);

      const result = compileExpression(
        'v.xy',
        new Map([['v', manyVec3]]),
        builder,
        new Map([['v', v]])
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const expr = builder.getValueExpr(result.value);
        expect(expr).toBeDefined();
        const card = requireInst(expr!.type.extent.cardinality, 'cardinality');
        expect(card.kind).toBe('many');
      }
    });

    it('mapField broadcasts one values over field extent', () => {
      const inst = instanceRef('grid', 'inst_expr_mapfield');
      const manyFloat = canonicalMany(FLOAT, undefined, inst);
      const oneFloat = canonicalType(FLOAT);
      const field = builder.intrinsic('normalizedIndex', manyFloat);
      const one = builder.constant(floatConst(0.5), oneFloat);

      const result = compileExpression(
        'mapField(v, f)',
        new Map([
          ['v', oneFloat],
          ['f', manyFloat],
        ]),
        builder,
        new Map([
          ['v', one],
          ['f', field],
        ])
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const expr = builder.getValueExpr(result.value);
        expect(expr).toBeDefined();
        const card = requireInst(expr!.type.extent.cardinality, 'cardinality');
        expect(card.kind).toBe('many');
      }
    });
  });

  describe('Multiline program syntax', () => {
    it('compiles assignments + output expression', () => {
      const xSig = builder.constant(floatConst(0.25), canonicalType(FLOAT));

      const result = compileExpression(
        [
          'phase = x * 6.2832',
          'phase + 1.0',
        ].join('\n'),
        new Map([['x', canonicalType(FLOAT)]]),
        builder,
        new Map([['x', xSig]])
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const expr = builder.getValueExpr(result.value);
        expect(expr).toBeDefined();
      }
    });

    it('supports // comments and returns reassignment warnings', () => {
      const xSig = builder.constant(floatConst(0.25), canonicalType(FLOAT));

      const result = compileExpression(
        [
          '// setup',
          'phase = x * 6.2832',
          'phase = phase + 0.5 // bump',
          'sin(phase)',
        ].join('\n'),
        new Map([['x', canonicalType(FLOAT)]]),
        builder,
        new Map([['x', xSig]])
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.warnings?.length ?? 0).toBe(1);
      }
    });
  });
});
