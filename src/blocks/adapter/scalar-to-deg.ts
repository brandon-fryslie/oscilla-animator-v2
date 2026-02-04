/**
 * ScalarToDeg Block
 *
 * Reinterpret scalar as degrees (identity).
 */

import { registerBlock } from '../registry';
import { canonicalType, unitDegrees, unitScalar, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';

registerBlock({
  type: 'Adapter_ScalarToDeg',
  label: 'Scalar → Deg',
  category: 'adapter',
  description: 'Reinterpret scalar as degrees (identity)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'scalar' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'angle', unit: 'degrees' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Scalar → degrees (identity)',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitScalar()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitDegrees()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Lens block input is required');

    // Identity — no conversion needed, just re-type
    const outType = ctx.outTypes[0];
    return {
      outputsById: {
        out: { id: input.id, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
