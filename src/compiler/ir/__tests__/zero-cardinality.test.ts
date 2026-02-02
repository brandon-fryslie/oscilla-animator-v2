/**
 * Zero-Cardinality Tests
 *
 * Documents that canonicalConst() produces zero-cardinality types
 * and that axis validation recognizes zero-cardinality as 'const' kind.
 *
 * NOTE: IRBuilder.constant() does NOT yet enforce zero-cardinality because
 * the cardinality solver doesn't treat zero as a "universal donor" compatible
 * with any other cardinality. See bead oscilla-animator-v2-73lv.
 *
 * When the solver is updated, constant() should be changed to always emit
 * zero-cardinality and these tests should be updated accordingly.
 */

import { describe, it, expect } from 'vitest';
import { createIRBuilder } from '../IRBuilderImpl';
import { floatConst, FLOAT, requireInst, canonicalType, canonicalConst, type CardinalityValue } from '../../../core/canonical-types';
import type { CardinalityVarId } from '../../../core/ids';

describe('Zero-cardinality type constructors', () => {
  it('canonicalConst() produces zero-cardinality', () => {
    const type = canonicalConst(FLOAT);
    const card = requireInst(type.extent.cardinality, 'cardinality');
    expect(card.kind).toBe('zero');
  });

  it('canonicalConst() produces continuous temporality', () => {
    const type = canonicalConst(FLOAT);
    const tempo = requireInst(type.extent.temporality, 'temporality');
    expect(tempo.kind).toBe('continuous');
  });

  it('IRBuilder.constant() preserves caller-provided type (pending solver update)', () => {
    const builder = createIRBuilder();
    const signalType = canonicalType(FLOAT);
    const constId = builder.constant(floatConst(42), signalType);

    const expr = builder.getValueExpr(constId);
    expect(expr).toBeDefined();
    expect(expr!.kind).toBe('const');

    // Currently preserves caller type (cardinality=one for signal)
    // TODO: After cardinality solver supports zero as universal donor,
    // constant() should enforce zero-cardinality here
    const card = requireInst<CardinalityValue, CardinalityVarId>(expr!.type.extent.cardinality, 'cardinality');
    expect(card.kind).toBe('one');
  });
});
