/**
 * Substitution is the inference→concrete boundary's working surface: applying a
 * total substitution must yield a value that parses as `ZCanonicalType`, and a
 * partial one must yield a value that does NOT. That parse — not a scattered
 * `kind === 'inst'` check — is the single enforcer of the boundary, so these
 * tests pin both directions of it. [LAW:single-enforcer]
 */

import { describe, it, expect } from 'vitest';
import {
  ZCanonicalTypeSchema,
  canonical,
  oneExtent,
  payloadVar,
  unitVar,
  cardinalityVar,
  payloadVarId,
  unitVarId,
  cardinalityVarId,
  instanceRef,
  type ZInferenceCanonicalType,
} from '../../schemas';
import { applySubstitution, EMPTY_SUBSTITUTION, type Substitution } from '../substitution';

describe('applySubstitution', () => {
  it('returns the input unchanged under the empty substitution', () => {
    const type = canonical(payloadVar('p'), { unit: unitVar('u') });
    expect(applySubstitution(type, EMPTY_SUBSTITUTION)).toEqual(type);
  });

  it('replaces a bound payload variable', () => {
    const subst: Substitution = {
      payloads: new Map([[payloadVarId('p'), { kind: 'vec3' }]]),
      units: new Map(),
      cardinalities: new Map(),
    };
    const result = applySubstitution(canonical(payloadVar('p')), subst);
    expect(result.payload).toEqual({ kind: 'vec3' });
  });

  it('replaces a bound unit variable (resolving to a structured angle unit)', () => {
    // The landed schema makes `angle.unit` a closed enum, so the only unit
    // variable is the top-level one; this covers a unit var resolving to an
    // angle, which is the realizable form of "incl. nested in angle".
    const subst: Substitution = {
      payloads: new Map(),
      units: new Map([[unitVarId('u'), { kind: 'angle', unit: 'radians' }]]),
      cardinalities: new Map(),
    };
    const result = applySubstitution(canonical({ kind: 'float' }, { unit: unitVar('u') }), subst);
    expect(result.unit).toEqual({ kind: 'angle', unit: 'radians' });
  });

  it('replaces a bound cardinality variable', () => {
    const subst: Substitution = {
      payloads: new Map(),
      units: new Map(),
      cardinalities: new Map([[cardinalityVarId('n'), { kind: 'many', instance: instanceRef('dots') }]]),
    };
    const type = canonical({ kind: 'float' }, { extent: { ...oneExtent(), cardinality: cardinalityVar('n') } });
    const result = applySubstitution(type, subst);
    expect(result.extent.cardinality).toEqual({ kind: 'many', instance: 'dots' });
  });

  it('produces a value that parses as concrete once every variable is bound', () => {
    const subst: Substitution = {
      payloads: new Map([[payloadVarId('p'), { kind: 'float' }]]),
      units: new Map([[unitVarId('u'), { kind: 'none' }]]),
      cardinalities: new Map([[cardinalityVarId('n'), { kind: 'one' }]]),
    };
    const type: ZInferenceCanonicalType = {
      payload: payloadVar('p'),
      unit: unitVar('u'),
      extent: { ...oneExtent(), cardinality: cardinalityVar('n') },
    };
    expect(ZCanonicalTypeSchema.safeParse(applySubstitution(type, subst)).success).toBe(true);
  });

  it('leaves a surviving variable that FAILS the concrete parse (partial substitution)', () => {
    // Only the payload is bound; the unit variable survives, so the result is
    // still an inference type and the concrete parse must reject it.
    const subst: Substitution = {
      payloads: new Map([[payloadVarId('p'), { kind: 'float' }]]),
      units: new Map(),
      cardinalities: new Map(),
    };
    const type = canonical(payloadVar('p'), { unit: unitVar('u') });
    const result = applySubstitution(type, subst);
    expect(result.unit).toEqual(unitVar('u'));
    expect(ZCanonicalTypeSchema.safeParse(result).success).toBe(false);
  });
});
