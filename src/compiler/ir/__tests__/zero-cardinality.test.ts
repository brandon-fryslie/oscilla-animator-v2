/**
 * Zero-Cardinality Enforcement Tests
 *
 * Verify that IRBuilder.constant() emits zero-cardinality values.
 * TYPE-SYSTEM-INVARIANTS #P0
 */

import { describe, it, expect } from 'vitest';
import { createIRBuilder } from '../IRBuilderImpl';
import { floatConst, vec2Const, FLOAT, VEC2, requireInst, canonicalType } from '../../../core/canonical-types';

describe('IRBuilder.constant() zero-cardinality enforcement', () => {
  it('should emit zero-cardinality for float constants', () => {
    const builder = createIRBuilder();
    const constId = builder.constant(floatConst(42), canonicalType(FLOAT));

    const expr = builder.getValueExpr(constId);
    expect(expr).toBeDefined();
    expect(expr!.kind).toBe('const');

    const card = requireInst(expr!.type.extent.cardinality, 'cardinality');
    expect(card.kind).toBe('zero');
  });

  it('should emit zero-cardinality for vec2 constants', () => {
    const builder = createIRBuilder();
    const constId = builder.constant(vec2Const(1, 2), canonicalType(VEC2));

    const expr = builder.getValueExpr(constId);
    expect(expr).toBeDefined();
    expect(expr!.kind).toBe('const');

    const card = requireInst(expr!.type.extent.cardinality, 'cardinality');
    expect(card.kind).toBe('zero');
  });

  it('should override caller-provided cardinality to zero', () => {
    const builder = createIRBuilder();
    // Caller mistakenly passes signal type (cardinality=one)
    const signalType = canonicalType(FLOAT);
    const card = requireInst(signalType.extent.cardinality, 'cardinality');
    expect(card.kind).toBe('one'); // Verify caller passed one

    const constId = builder.constant(floatConst(99), signalType);

    const expr = builder.getValueExpr(constId);
    const resultCard = requireInst(expr!.type.extent.cardinality, 'cardinality');
    expect(resultCard.kind).toBe('zero'); // IRBuilder overrode to zero
  });

  it('should preserve payload and unit while enforcing zero-cardinality', () => {
    const builder = createIRBuilder();
    const constId = builder.constant(floatConst(3.14), canonicalType(FLOAT));

    const expr = builder.getValueExpr(constId);
    expect(expr!.type.payload.kind).toBe('float');
    expect(expr!.type.unit.kind).toBe('scalar');

    const card = requireInst(expr!.type.extent.cardinality, 'cardinality');
    expect(card.kind).toBe('zero');

    const tempo = requireInst(expr!.type.extent.temporality, 'temporality');
    expect(tempo.kind).toBe('continuous');
  });
});
