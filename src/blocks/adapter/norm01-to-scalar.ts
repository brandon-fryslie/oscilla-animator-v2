/**
 * Norm01ToScalar Block
 *
 * Promote normalized [0,1] to scalar (identity).
 */

import { registerBlock } from '../registry';
import { canonicalType, unitNone, payloadStride, contractClamp01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const NORM01_TO_SCALAR_CARD = cardinalityVar(cardinalityVarId('norm01_to_scalar_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Adapter_Norm01ToScalar',
    label: 'Norm01 → Scalar',
    category: 'adapter',
    description: 'Promote normalized [0,1] to scalar (identity)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    adapterSpec: {
      from: { payload: FLOAT, unit: { kind: 'none' }, contract: { kind: 'clamp01' }, extent: 'any' },
      to: { payload: FLOAT, unit: { kind: 'none' }, extent: 'any' },
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Normalized [0,1] → scalar (identity)',
      purity: 'pure',
      stability: 'stable',
    },
    inputs: {
      in: { label: 'In', type: canonicalType(FLOAT, unitNone(), { cardinality: NORM01_TO_SCALAR_CARD }, contractClamp01()) },
    },
    outputs: {
      out: { label: 'Out', type: canonicalType(FLOAT, unitNone(), { cardinality: NORM01_TO_SCALAR_CARD }) },
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
}
