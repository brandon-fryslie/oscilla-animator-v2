/**
 * PhaseToScalar01 Block
 *
 * Semantic boundary: phase [0,1) to dimensionless scalar (identity).
 */

import { registerBlock } from '../registry';
import { canonicalType, unitPhase01, unitScalar, strideOf } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';

registerBlock({
  type: 'Adapter_PhaseToScalar01',
  label: 'Phase → Scalar',
  category: 'adapter',
  description: 'Semantic boundary: phase [0,1) to dimensionless scalar (identity)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'angle', unit: 'phase01' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'scalar' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Phase [0,1) → scalar (semantic boundary)',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitPhase01()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitScalar()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Lens block input is required');

    // Identity — no conversion needed, just re-type
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: input.id, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
