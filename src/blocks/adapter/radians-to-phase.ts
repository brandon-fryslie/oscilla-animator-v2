/**
 * RadiansToPhase01 Block
 *
 * Convert radians to phase [0,1) with wrapping.
 */

import { registerBlock } from '../registry';
import { canonicalType, unitTurns, unitNone, unitRadians, payloadStride, floatConst, contractWrap01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto, mapAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const RADIANS_TO_PHASE_CARD = cardinalityVar(cardinalityVarId('radians_to_phase_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Adapter_RadiansToPhase01',
  label: 'Radians → Phase',
  category: 'adapter',
  description: 'Convert radians to phase [0,1) with wrapping',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'angle', unit: 'radians' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'angle', unit: 'turns' }, contract: { kind: 'wrap01' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Radians → phase [0,1) with wrapping',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitRadians(), { cardinality: RADIANS_TO_PHASE_CARD }) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitTurns(), { cardinality: RADIANS_TO_PHASE_CARD }, contractWrap01()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Lens block input is required');

    const outType = ctx.outTypes[0];
    const twoPi = ctx.b.constant(floatConst(6.283185307179586), canonicalType(FLOAT, unitNone()));
    const divFn = ctx.b.opcode(OpCode.Div);
    const divided = zipAuto([input.id, twoPi], divFn, outType, ctx.b);
    const wrapFn = ctx.b.opcode(OpCode.Wrap01);
    const wrapped = mapAuto(divided, wrapFn, outType, ctx.b);
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
