import { describe, it, expect } from 'vitest';
import { deriveStorageLayout } from '../storage-class';
import {
  canonicalScalar,
  canonicalMany,
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
  it('float/one → canonical numeric (f32)/stride 1', () => {
    const type = canonicalScalar(FLOAT, unitNone());
    const layout = deriveStorageLayout(type);
    expect(layout).toEqual({ storage: 'f32', stride: 1 });
  });

  it('vec3/one → canonical numeric (f32)/stride 3', () => {
    const type = canonicalScalar(VEC3, unitNone());
    const layout = deriveStorageLayout(type);
    expect(layout).toEqual({ storage: 'f32', stride: 3 });
  });

  it('color/one → canonical numeric (f32)/stride 4', () => {
    const type = canonicalScalar(COLOR, unitNone());
    const layout = deriveStorageLayout(type);
    expect(layout).toEqual({ storage: 'f32', stride: 4 });
  });

  it('vec4/one → canonical numeric (f32)/stride 4', () => {
    const type = canonicalScalar(VEC4, unitNone());
    const layout = deriveStorageLayout(type);
    expect(layout).toEqual({ storage: 'f32', stride: 4 });
  });

  it('float/many → canonical numeric (f32)/stride 1', () => {
    const type = canonicalMany(FLOAT, unitNone(), INST);
    const layout = deriveStorageLayout(type);
    expect(layout).toEqual({ storage: 'f32', stride: 1 });
  });

  it('vec3/many → canonical numeric (f32)/stride 3', () => {
    const type = canonicalMany(VEC3, unitNone(), INST);
    const layout = deriveStorageLayout(type);
    expect(layout).toEqual({ storage: 'f32', stride: 3 });
  });

  it('overrideStride respected for canonical numeric storage', () => {
    const type = canonicalScalar(FLOAT, unitNone());
    const layout = deriveStorageLayout(type, 7);
    expect(layout).toEqual({ storage: 'f32', stride: 7 });
  });

  it('overrideStride respected for many-cardinality numeric storage', () => {
    const type = canonicalMany(FLOAT, unitNone(), INST);
    const layout = deriveStorageLayout(type, 7);
    expect(layout).toEqual({ storage: 'f32', stride: 7 });
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
