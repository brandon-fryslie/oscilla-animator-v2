/**
 * src/pillars/types/__tests__/derive-kind.test.ts
 *
 * `deriveKind` — one test per cardinality×temporality combination.
 * The function is total and must never throw. [LAW:behavior-not-structure]
 */

import { describe, it, expect } from 'vitest';
import { canonical, manyExtent, instanceRef } from '../schemas';
import type { ZCanonicalType } from '../schemas';
import { deriveKind } from '../validate/derive-kind';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const asConcrete = (t: import('../schemas').ZInferenceCanonicalType): ZCanonicalType =>
  t as unknown as ZCanonicalType;

const inst = instanceRef('i');

const signal = (): ZCanonicalType =>
  asConcrete(canonical({ kind: 'float' }));

const field = (): ZCanonicalType =>
  asConcrete(canonical({ kind: 'float' }, { extent: manyExtent(inst) }));

const event = (): ZCanonicalType =>
  asConcrete(
    canonical({ kind: 'bool' }, {
      extent: {
        cardinality: { kind: 'one' },
        temporality: { kind: 'discrete' },
        binding: { kind: 'unbound' },
        perspective: { kind: 'default' },
        branch: { kind: 'default' },
      },
    }),
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deriveKind', () => {
  it('continuous + cardinality:one → signal', () => {
    expect(deriveKind(signal())).toBe('signal');
  });

  it('continuous + cardinality:many → field', () => {
    expect(deriveKind(field())).toBe('field');
  });

  it('discrete temporality → event (regardless of payload)', () => {
    expect(deriveKind(event())).toBe('event');
  });

  it('discrete takes precedence over many cardinality', () => {
    const discreteMany = asConcrete(
      canonical({ kind: 'bool' }, {
        extent: {
          cardinality: { kind: 'many', instance: inst },
          temporality: { kind: 'discrete' },
          binding: { kind: 'unbound' },
          perspective: { kind: 'default' },
          branch: { kind: 'default' },
        },
      }),
    );
    // discrete always wins
    expect(deriveKind(discreteMany)).toBe('event');
  });

  it('never throws for any valid ZCanonicalType', () => {
    expect(() => deriveKind(signal())).not.toThrow();
    expect(() => deriveKind(field())).not.toThrow();
    expect(() => deriveKind(event())).not.toThrow();
  });
});
