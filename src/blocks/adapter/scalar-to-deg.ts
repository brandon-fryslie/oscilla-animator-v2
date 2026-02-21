/**
 * ScalarToDeg Block
 *
 * Reinterpret scalar as degrees (identity).
 */

import { registerBlock } from '../registry';
import { canonicalType, unitDegrees, unitNone, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const SCALAR_TO_DEG_CARD = cardinalityVar(cardinalityVarId('scalar_to_deg_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Adapter_ScalarToDeg',
  label: 'Scalar → Deg',
  category: 'adapter',
  description: 'Reinterpret scalar as degrees (identity)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'none' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'angle', unit: 'degrees' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Scalar → degrees (identity)',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitNone(), { cardinality: SCALAR_TO_DEG_CARD }) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitDegrees(), { cardinality: SCALAR_TO_DEG_CARD }) },
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
