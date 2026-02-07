/**
 * Tests for inference-types axis var extensions (Milestone 2).
 *
 * Verifies that:
 * - finalizeInferenceType resolves axis vars
 * - finalizeInferenceType throws on unresolved axis vars
 * - isInferenceCanonicalizable correctly detects unresolved vars
 * - applyPartialSubstitution resolves what it can, leaves the rest
 */
import { describe, it, expect } from 'vitest';
import {
  finalizeInferenceType,
  isInferenceCanonicalizable,
  applyPartialSubstitution,
  EMPTY_SUBSTITUTION,
  type Substitution,
  type InferenceCanonicalType,
} from '../inference-types';
import {
  axisInst,
  axisVar,
  DEFAULT_BINDING,
  DEFAULT_PERSPECTIVE,
  DEFAULT_BRANCH,
  type CardinalityValue,
  type TemporalityValue,
} from '../canonical-types';
import type { CardinalityVarId, TemporalityVarId } from '../ids';

// =============================================================================
// Helpers
// =============================================================================

function makeConcreteInferenceType(): InferenceCanonicalType {
  return {
    payload: { kind: 'float' },
    unit: { kind: 'none' },
    extent: {
      cardinality: axisInst<CardinalityValue, CardinalityVarId>({ kind: 'one' }),
      temporality: axisInst<TemporalityValue, TemporalityVarId>({ kind: 'continuous' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
  };
}

function makeTypeWithCardinalityVar(varId: string): InferenceCanonicalType {
  return {
    payload: { kind: 'float' },
    unit: { kind: 'none' },
    extent: {
      cardinality: axisVar<CardinalityValue, CardinalityVarId>(varId as CardinalityVarId),
      temporality: axisInst<TemporalityValue, TemporalityVarId>({ kind: 'continuous' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
  };
}

function makeTypeWithPayloadVar(varId: string): InferenceCanonicalType {
  return {
    payload: { kind: 'var', id: varId },
    unit: { kind: 'none' },
    extent: {
      cardinality: axisInst<CardinalityValue, CardinalityVarId>({ kind: 'one' }),
      temporality: axisInst<TemporalityValue, TemporalityVarId>({ kind: 'continuous' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('finalizeInferenceType (axis var extensions)', () => {
  it('resolves concrete types with empty substitution', () => {
    const t = makeConcreteInferenceType();
    const result = finalizeInferenceType(t, EMPTY_SUBSTITUTION);

    expect(result.payload).toEqual({ kind: 'float' });
    expect(result.unit).toEqual({ kind: 'none' });
    expect(result.extent.cardinality).toEqual(axisInst({ kind: 'one' }));
  });

  it('resolves cardinality vars via substitution', () => {
    const t = makeTypeWithCardinalityVar('c0');
    const subst: Substitution = {
      payloads: new Map(),
      units: new Map(),
      cardinalities: new Map([['c0' as CardinalityVarId, { kind: 'one' } as CardinalityValue]]),
    };

    const result = finalizeInferenceType(t, subst);
    expect(result.extent.cardinality).toEqual(axisInst({ kind: 'one' }));
  });

  it('throws on unresolved cardinality var', () => {
    const t = makeTypeWithCardinalityVar('c0');
    expect(() => finalizeInferenceType(t, EMPTY_SUBSTITUTION)).toThrow(/cardinality.*c0/i);
  });

  it('throws on unresolved payload var', () => {
    const t = makeTypeWithPayloadVar('p0');
    expect(() => finalizeInferenceType(t, EMPTY_SUBSTITUTION)).toThrow(/payload.*p0/i);
  });

  it('resolves payload vars via substitution', () => {
    const t = makeTypeWithPayloadVar('p0');
    const subst: Substitution = {
      payloads: new Map([['p0', { kind: 'float' }]]),
      units: new Map(),
    };

    const result = finalizeInferenceType(t, subst);
    expect(result.payload).toEqual({ kind: 'float' });
  });
});

describe('isInferenceCanonicalizable', () => {
  it('returns true for fully concrete type', () => {
    const t = makeConcreteInferenceType();
    expect(isInferenceCanonicalizable(t, EMPTY_SUBSTITUTION)).toBe(true);
  });

  it('returns false when cardinality var is unresolved', () => {
    const t = makeTypeWithCardinalityVar('c0');
    expect(isInferenceCanonicalizable(t, EMPTY_SUBSTITUTION)).toBe(false);
  });

  it('returns true when cardinality var has substitution', () => {
    const t = makeTypeWithCardinalityVar('c0');
    const subst: Substitution = {
      payloads: new Map(),
      units: new Map(),
      cardinalities: new Map([['c0' as CardinalityVarId, { kind: 'one' } as CardinalityValue]]),
    };
    expect(isInferenceCanonicalizable(t, subst)).toBe(true);
  });

  it('returns false when payload var is unresolved', () => {
    const t = makeTypeWithPayloadVar('p0');
    expect(isInferenceCanonicalizable(t, EMPTY_SUBSTITUTION)).toBe(false);
  });

  it('returns true when payload var has substitution', () => {
    const t = makeTypeWithPayloadVar('p0');
    const subst: Substitution = {
      payloads: new Map([['p0', { kind: 'float' }]]),
      units: new Map(),
    };
    expect(isInferenceCanonicalizable(t, subst)).toBe(true);
  });
});

describe('applyPartialSubstitution', () => {
  it('resolves payload var when available', () => {
    const t = makeTypeWithPayloadVar('p0');
    const subst: Substitution = {
      payloads: new Map([['p0', { kind: 'vec2' }]]),
      units: new Map(),
    };

    const result = applyPartialSubstitution(t, subst);
    expect(result.payload).toEqual({ kind: 'vec2' });
    // Unit unchanged
    expect(result.unit).toEqual(t.unit);
  });

  it('leaves payload var unresolved when not in substitution', () => {
    const t = makeTypeWithPayloadVar('p0');
    const result = applyPartialSubstitution(t, EMPTY_SUBSTITUTION);
    expect(result.payload).toEqual({ kind: 'var', id: 'p0' });
  });

  it('resolves cardinality var when available', () => {
    const t = makeTypeWithCardinalityVar('c0');
    const subst: Substitution = {
      payloads: new Map(),
      units: new Map(),
      cardinalities: new Map([['c0' as CardinalityVarId, { kind: 'one' } as CardinalityValue]]),
    };

    const result = applyPartialSubstitution(t, subst);
    expect(result.extent.cardinality).toEqual(axisInst({ kind: 'one' }));
  });

  it('leaves cardinality var unresolved when not in substitution', () => {
    const t = makeTypeWithCardinalityVar('c0');
    const result = applyPartialSubstitution(t, EMPTY_SUBSTITUTION);
    expect(result.extent.cardinality).toEqual(axisVar('c0'));
  });

  it('preserves contract through substitution', () => {
    const t: InferenceCanonicalType = {
      ...makeConcreteInferenceType(),
      contract: { kind: 'clamp01' },
    };
    const result = applyPartialSubstitution(t, EMPTY_SUBSTITUTION);
    expect(result.contract).toEqual({ kind: 'clamp01' });
  });
});
