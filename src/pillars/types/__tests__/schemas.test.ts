/**
 * src/pillars/types/__tests__/schemas.test.ts
 *
 * The schema layer's load-bearing property is the concrete/inference split:
 * a fully-instantiated `ZCanonicalType` must be incapable of holding a type
 * variable, while its inference counterpart must accept one. These tests pin
 * that boundary at runtime — the compile-time half is enforced by the types
 * themselves. [LAW:types-are-the-program]
 */

import { describe, it, expect } from 'vitest';
import {
  ZCanonicalTypeSchema,
  ZInferenceCanonicalTypeSchema,
  ZBundleTypeSchema,
  ZInferenceBundleTypeSchema,
  zFloat,
  zColor,
  oneExtent,
  manyExtent,
  payloadVar,
  cardinalityVar,
  instanceRef,
  type ZCanonicalType,
  type ZInferenceCanonicalType,
} from '../schemas';

describe('ZCanonicalType — concrete types', () => {
  it('round-trips a scalar float through JSON then re-parses', () => {
    const value: ZCanonicalType = {
      payload: { kind: 'float' },
      unit: { kind: 'none' },
      extent: oneExtent(),
    };
    const reparsed = ZCanonicalTypeSchema.safeParse(JSON.parse(JSON.stringify(value)));
    expect(reparsed.success).toBe(true);
    expect(reparsed).toMatchObject({ success: true });
    expect(reparsed.success && reparsed.data).toEqual(value);
  });

  it('round-trips a per-instance color through JSON then re-parses', () => {
    const value: ZCanonicalType = {
      payload: { kind: 'color' },
      unit: { kind: 'color', unit: 'rgba01' },
      extent: manyExtent(instanceRef('particles'), 1024),
    };
    const reparsed = ZCanonicalTypeSchema.safeParse(JSON.parse(JSON.stringify(value)));
    expect(reparsed.success).toBe(true);
    expect(reparsed.success && reparsed.data).toEqual(value);
  });

  it('rejects a structured unit with a wrong enum member', () => {
    const bad = {
      payload: { kind: 'float' },
      unit: { kind: 'angle', unit: 'gradians' },
      extent: oneExtent(),
    };
    expect(ZCanonicalTypeSchema.safeParse(bad).success).toBe(false);
  });
});

describe('concrete vs inference — the variable boundary', () => {
  it('a payload variable FAILS concrete parse but PASSES inference parse', () => {
    const withVar = {
      payload: payloadVar('a'),
      unit: { kind: 'none' },
      extent: oneExtent(),
    };
    expect(ZCanonicalTypeSchema.safeParse(withVar).success).toBe(false);
    expect(ZInferenceCanonicalTypeSchema.safeParse(withVar).success).toBe(true);
  });

  it('a cardinality variable FAILS concrete parse but PASSES inference parse', () => {
    const withVar: ZInferenceCanonicalType = {
      payload: { kind: 'float' },
      unit: { kind: 'none' },
      extent: { ...oneExtent(), cardinality: cardinalityVar('n') },
    };
    expect(ZCanonicalTypeSchema.safeParse(withVar).success).toBe(false);
    expect(ZInferenceCanonicalTypeSchema.safeParse(withVar).success).toBe(true);
  });

  it('every concrete type is also a valid inference type', () => {
    const concrete = zFloat();
    // zFloat returns an inference type, but its value carries no variables, so
    // it parses as concrete too — concrete ⊆ inference.
    expect(ZCanonicalTypeSchema.safeParse(concrete).success).toBe(true);
    expect(ZInferenceCanonicalTypeSchema.safeParse(concrete).success).toBe(true);
  });
});

describe('constructors', () => {
  it('zColor defaults to the rgba01 color unit', () => {
    expect(zColor().unit).toEqual({ kind: 'color', unit: 'rgba01' });
  });

  it('manyExtent omits capacity when not supplied', () => {
    expect(manyExtent(instanceRef('p')).cardinality).toEqual({
      kind: 'many',
      instance: 'p',
    });
  });

  it('canonical opts override unit and extent', () => {
    const t = zFloat({ unit: { kind: 'angle', unit: 'radians' } });
    expect(t.unit).toEqual({ kind: 'angle', unit: 'radians' });
  });
});

describe('ZBundleType', () => {
  it('round-trips a concrete bundle and rejects a variable-bearing field', () => {
    const bundle = {
      position: { payload: { kind: 'vec2' }, unit: { kind: 'none' }, extent: oneExtent() },
      angle: { payload: { kind: 'float' }, unit: { kind: 'angle', unit: 'radians' }, extent: oneExtent() },
    };
    expect(ZBundleTypeSchema.safeParse(JSON.parse(JSON.stringify(bundle))).success).toBe(true);

    const withVar = { ...bundle, free: { payload: payloadVar('a'), unit: { kind: 'none' }, extent: oneExtent() } };
    expect(ZBundleTypeSchema.safeParse(withVar).success).toBe(false);
    expect(ZInferenceBundleTypeSchema.safeParse(withVar).success).toBe(true);
  });
});
