import { describe, expect, it } from 'vitest';
import { IRBuilderImpl } from '../IRBuilderImpl';
import { canonicalScalar, floatConst, vec3Const } from '../../../core/canonical-types';

describe('IRBuilderImpl.extract normalization', () => {
  it('normalizes scalar extract(0) to identity', () => {
    const builder = new IRBuilderImpl();
    const floatType = canonicalScalar({ kind: 'float' }, { kind: 'none' });
    const scalar = builder.constant(floatConst(42), floatType);

    const extracted = builder.extract(scalar, 0, floatType);

    expect(extracted).toBe(scalar);
  });

  it('rejects scalar extract with out-of-range component index', () => {
    const builder = new IRBuilderImpl();
    const floatType = canonicalScalar({ kind: 'float' }, { kind: 'none' });
    const scalar = builder.constant(floatConst(42), floatType);

    expect(() => builder.extract(scalar, 1, floatType)).toThrow('out of range for scalar input');
  });

  it('folds const vector extraction to scalar const upstream', () => {
    const builder = new IRBuilderImpl();
    const vec3Type = canonicalScalar({ kind: 'vec3' }, { kind: 'none' });
    const floatType = canonicalScalar({ kind: 'float' }, { kind: 'none' });
    const vec = builder.constant(vec3Const(1, 2, 3), vec3Type);

    const extracted = builder.extract(vec, 1, floatType);
    const expr = builder.getValueExpr(extracted);

    expect(expr).toMatchObject({
      kind: 'const',
      value: { kind: 'float', value: 2 },
    });
  });
});
