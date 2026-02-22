/**
 * PhaseWrap01 Adapter Block
 *
 * Applies wrap01 contract to phase values while preserving phase units.
 */

import { registerBlock } from '../registry';
import { canonicalType, unitTurns, payloadStride, contractWrap01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { mapAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const PHASE_WRAP_CARD = cardinalityVar(cardinalityVarId('phase_wrap_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Adapter_PhaseWrap01',
    label: 'Wrap Phase [0,1)',
    category: 'adapter',
    description: 'Wrap phase values to [0,1) while preserving phase units',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    adapterSpec: {
      from: { payload: FLOAT, unit: unitTurns(), extent: 'any' },
      to: { payload: FLOAT, unit: unitTurns(), contract: { kind: 'wrap01' }, extent: 'any' },
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Phase → wrapped phase',
      purity: 'pure',
      stability: 'stable',
    },
    inputs: {
      in: { label: 'In', type: canonicalType(FLOAT, unitTurns(), { cardinality: PHASE_WRAP_CARD }) },
    },
    outputs: {
      out: {
        label: 'Out',
        type: canonicalType(FLOAT, unitTurns(), { cardinality: PHASE_WRAP_CARD }, contractWrap01()),
      },
    },
    lower: ({ inputsById, ctx }) => {
      const input = inputsById.in;
      if (!input) throw new Error('Adapter_PhaseWrap01: input is required');
  
      const outType = ctx.outTypes[0];
      const wrapFn = ctx.b.opcode(OpCode.Wrap01);
      const wrapped = mapAuto(input.id, wrapFn, outType, ctx.b);
  
      return {
        outputsById: {
          out: { id: wrapped, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [{ portId: 'out', type: outType }],
        },
      };
    },
  });
}
