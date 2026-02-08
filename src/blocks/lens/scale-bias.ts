/**
 * ScaleBias Block
 *
 * y = x * scale + bias
 *
 * The most fundamental value transformation for value shaping.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto } from '../lower-utils';

registerBlock({
  type: 'ScaleBias',
  label: 'Scale + Bias',
  category: 'lens',
  description: 'y = x * scale + bias',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: inferType(FLOAT, unitVar('sb_U')) },
    scale: { label: 'Scale', type: canonicalType(FLOAT), defaultValue: 1.0 },
    bias: { label: 'Bias', type: inferType(FLOAT, unitVar('sb_U')), defaultValue: 0.0 },
  },
  outputs: {
    out: { label: 'Out', type: inferType(FLOAT, unitVar('sb_U')) },
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
