import { describe, expect, it } from 'vitest';
import { canonicalScalar, FLOAT } from '../../core/canonical-types';
import { IRBuilderImpl } from '../ir/IRBuilderImpl';

describe('IRBuilderImpl slot layout inputs', () => {
  it('preserves slot labels when slot types are refreshed', () => {
    const builder = new IRBuilderImpl();
    const labeledType = canonicalScalar(FLOAT);
    const slot = builder.allocTypedSlot(labeledType, 'osc1.out');

    builder.registerSlotType(slot, labeledType);

    expect(builder.getSlotLayoutInputs().get(slot)?.label).toBe('osc1.out');
  });
});
