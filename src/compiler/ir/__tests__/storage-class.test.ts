import { describe, it, expect } from 'vitest';
import { deriveStorageLayout } from '../storage-class';
import {
  canonicalSignal,
  canonicalField,
  FLOAT,
  VEC3,
  VEC4,
  COLOR,
  unitNone,
  instanceRef,
} from '../../../core/canonical-types';
import type { CanonicalType } from '../../../core/canonical-types';

const INST = instanceRef('testDomain', 'testInstance');

describe('deriveStorageLayout', () => {
  it('float/one → f64/stride 1', () => {
    const type = canonicalSignal(FLOAT, unitNone());
    const layout = deriveStorageLayout(type);
    expect(layout).toEqual({ storage: 'f64', stride: 1 });
  });

  it('vec3/one → f64/stride 3', () => {
    const type = canonicalSignal(VEC3, unitNone());
    const layout = deriveStorageLayout(type);
    expect(layout).toEqual({ storage: 'f64', stride: 3 });
  });

  it('color/one → f64/stride 4', () => {
    const type = canonicalSignal(COLOR, unitNone());
    const layout = deriveStorageLayout(type);
    expect(layout).toEqual({ storage: 'f64', stride: 4 });
  });

  it('vec4/one → f64/stride 4', () => {
    const type = canonicalSignal(VEC4, unitNone());
    const layout = deriveStorageLayout(type);
    expect(layout).toEqual({ storage: 'f64', stride: 4 });
  });

  it('float/many → object/stride 1', () => {
    const type = canonicalField(FLOAT, unitNone(), INST);
    const layout = deriveStorageLayout(type);
    expect(layout).toEqual({ storage: 'object', stride: 1 });
  });

  it('vec3/many → object/stride 1', () => {
    const type = canonicalField(VEC3, unitNone(), INST);
    const layout = deriveStorageLayout(type);
    expect(layout).toEqual({ storage: 'object', stride: 1 });
  });

  it('overrideStride respected for f64 storage', () => {
    const type = canonicalSignal(FLOAT, unitNone());
    const layout = deriveStorageLayout(type, 7);
    expect(layout).toEqual({ storage: 'f64', stride: 7 });
  });

  it('overrideStride ignored for object storage', () => {
    const type = canonicalField(FLOAT, unitNone(), INST);
    const layout = deriveStorageLayout(type, 7);
    expect(layout).toEqual({ storage: 'object', stride: 1 });
  });

  it('var cardinality throws', () => {
    // Build a type with var cardinality (inference-only, must not reach backend)
    const type: CanonicalType = {
      payload: FLOAT,
      unit: unitNone(),
      extent: {
        cardinality: { kind: 'var', var: 'c:test' as any },
        temporality: { kind: 'inst', value: { kind: 'continuous' } },
        binding: { kind: 'inst', value: { kind: 'unbound' } },
        perspective: { kind: 'inst', value: { kind: 'default' } },
        branch: { kind: 'inst', value: { kind: 'default' } },
      },
    };
    expect(() => deriveStorageLayout(type)).toThrow(/Expected instantiated cardinality/);
  });
});
