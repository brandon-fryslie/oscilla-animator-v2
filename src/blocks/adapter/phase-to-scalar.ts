/**
 * PhaseToScalar01 Block
 *
 * Semantic boundary: phase [0,1) to dimensionless scalar (identity).
 */

import { registerBlock } from '../registry';
import { canonicalType, unitTurns, unitNone, payloadStride, contractWrap01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const PHASE_TO_SCALAR_CARD = cardinalityVar(cardinalityVarId('phase_to_scalar_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Adapter_PhaseToScalar01',
    label: 'Phase → Scalar',
    category: 'adapter',
    description: 'Semantic boundary: phase [0,1) to dimensionless scalar (identity)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    adapterSpec: {
      from: { payload: FLOAT, unit: { kind: 'angle', unit: 'turns' }, contract: { kind: 'wrap01' }, extent: 'any' },
      to: { payload: FLOAT, unit: { kind: 'none' }, extent: 'any' },
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Phase [0,1) → scalar (semantic boundary)',
      purity: 'pure',
      stability: 'stable',
    },
    inputs: {
      in: { label: 'In', type: canonicalType(FLOAT, unitTurns(), { cardinality: PHASE_TO_SCALAR_CARD }, contractWrap01()) },
    },
    outputs: {
      out: { label: 'Out', type: canonicalType(FLOAT, unitNone(), { cardinality: PHASE_TO_SCALAR_CARD }) },
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
