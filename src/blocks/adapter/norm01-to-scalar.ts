/**
 * Norm01ToScalar Block
 *
 * Promote normalized [0,1] to scalar (identity).
 */

import { registerBlock } from '../registry';
import { canonicalType, unitScalar, payloadStride, contractClamp01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';

registerBlock({
  type: 'Adapter_Norm01ToScalar',
  label: 'Norm01 → Scalar',
  category: 'adapter',
  description: 'Promote normalized [0,1] to scalar (identity)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'scalar' }, contract: { kind: 'clamp01' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'scalar' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Normalized [0,1] → scalar (identity)',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()) },
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
        out: { id: input.id, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
