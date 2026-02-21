/**
 * ScalarToPhase01 Block
 *
 * Wrap scalar to phase [0,1) with cyclic semantics.
 */

import { registerBlock } from '../registry';
import { canonicalType, unitTurns, unitNone, payloadStride, contractWrap01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto, mapAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const SCALAR_TO_PHASE_CARD = cardinalityVar(cardinalityVarId('scalar_to_phase_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Adapter_ScalarToPhase01',
  label: 'Scalar → Phase',
  category: 'adapter',
  description: 'Wrap scalar to phase [0,1) with cyclic semantics',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'none' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'angle', unit: 'turns' }, contract: { kind: 'wrap01' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Scalar → phase [0,1) with wrapping',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitNone(), { cardinality: SCALAR_TO_PHASE_CARD }) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitTurns(), { cardinality: SCALAR_TO_PHASE_CARD }, contractWrap01()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Lens block input is required');

    const outType = ctx.outTypes[0];
    const wrapFn = ctx.b.opcode(OpCode.Wrap01);
    const wrapped = mapAuto(input.id, wrapFn, outType, ctx.b);
    return {
      outputsById: {
        out: { id: wrapped, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
