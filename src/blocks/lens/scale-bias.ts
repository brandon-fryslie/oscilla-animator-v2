/**
 * ScaleBias Block
 *
 * y = x * scale + bias
 *
 * The most fundamental value transformation for value shaping.
 */

import { registerBlock } from '../registry';
import { payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { inferType, unitVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const SCALE_BIAS_CARD = cardinalityVar(cardinalityVarId('scale_bias_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'ScaleBias',
  label: 'Scale + Bias',
  category: 'lens',
  description: 'y = x * scale + bias',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  inputs: {
    in: { label: 'In', type: inferType(FLOAT, unitVar('sb_U'), { cardinality: SCALE_BIAS_CARD }) },
    scale: { label: 'Scale', type: inferType(FLOAT, unitVar('sb_U'), { cardinality: SCALE_BIAS_CARD }), defaultValue: 1.0 },
    bias: { label: 'Bias', type: inferType(FLOAT, unitVar('sb_U'), { cardinality: SCALE_BIAS_CARD }), defaultValue: 0.0 },
  },
  outputs: {
    out: { label: 'Out', type: inferType(FLOAT, unitVar('sb_U'), { cardinality: SCALE_BIAS_CARD }) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const scale = inputsById.scale;
    const bias = inputsById.bias;
    if (!input) throw new Error('ScaleBias: in is required');
    if (!scale) throw new Error('ScaleBias: scale is required');
    if (!bias) throw new Error('ScaleBias: bias is required');

    const outType = ctx.outTypes[0];

    // y = x * scale + bias
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const scaled = zipAuto([input.id, scale.id], mulFn, outType, ctx.b);

    const addFn = ctx.b.opcode(OpCode.Add);
    const result = zipAuto([scaled, bias.id], addFn, outType, ctx.b);

    return {
      outputsById: {
        out: { id: result, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
