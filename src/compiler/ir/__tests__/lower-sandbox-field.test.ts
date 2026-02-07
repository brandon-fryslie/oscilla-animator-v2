import { describe, it, expect } from 'vitest';
import { IRBuilderImpl } from '../IRBuilderImpl';
import { LowerSandbox } from '../LowerSandbox';
import {
  canonicalField, canonicalSignal,
  FLOAT, COLOR, instanceRef, unitHsl, unitTurns,
  requireInst, isMany, isOne,
} from '../../../core/canonical-types';

describe('LowerSandbox field-extent types', () => {
  it('HueRainbow macro with field-extent outTypes produces field-extent expressions', () => {
    const builder = new IRBuilderImpl();
    const instances = new Map();

    const sandbox = new LowerSandbox(builder, 'TestParent', 'test-parent-1', instances);

    // Create a field-extent color type (many cardinality)
    const ref = instanceRef('circle-domain', 'inst-1');
    const fieldColorType = canonicalField(COLOR, unitHsl(), ref);

    // Create a signal-level float input (phase)
    const phaseType = canonicalSignal(FLOAT, unitTurns());
    const phaseExpr = builder.constant({ kind: 'float', value: 0.5 }, phaseType);

    // Macro-expand HueRainbow with field-extent output types
    const outputs = sandbox.lowerBlock(
      'HueRainbow',
      { t: phaseExpr },
      {},
      [fieldColorType]
    );

    // The output expression should exist
    expect(outputs.out).toBeDefined();

    // Verify the emitted expression has field-extent type
    const outExpr = builder.getValueExpr(outputs.out);
    expect(outExpr).toBeDefined();
    const card = requireInst(outExpr!.type.extent.cardinality, 'cardinality');
    expect(isMany(card)).toBe(true);
  });

  it('HueRainbow macro with signal-extent outTypes produces signal-extent expressions', () => {
    const builder = new IRBuilderImpl();
    const instances = new Map();
    const sandbox = new LowerSandbox(builder, 'TestParent', 'test-parent-1', instances);

    const signalColorType = canonicalSignal(COLOR, unitHsl());
    const phaseType = canonicalSignal(FLOAT, unitTurns());
    const phaseExpr = builder.constant({ kind: 'float', value: 0.5 }, phaseType);

    const outputs = sandbox.lowerBlock(
      'HueRainbow',
      { t: phaseExpr },
      {},
      [signalColorType]
    );

    const outExpr = builder.getValueExpr(outputs.out);
    expect(outExpr).toBeDefined();
    const card = requireInst(outExpr!.type.extent.cardinality, 'cardinality');
    expect(isOne(card)).toBe(true);
  });
});
