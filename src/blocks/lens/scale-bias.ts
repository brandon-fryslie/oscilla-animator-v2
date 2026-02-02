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
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'ScaleBias',
  label: 'Scale + Bias',
  category: 'lens',
  description: 'y = x * scale + bias',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT) },
    scale: { label: 'Scale', type: canonicalType(FLOAT), defaultValue: 1.0 },
    bias: { label: 'Bias', type: canonicalType(FLOAT), defaultValue: 0.0 },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
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
    const scaled = ctx.b.kernelZip([input.id, scale.id], mulFn, outType);

    const addFn = ctx.b.opcode(OpCode.Add);
    const result = ctx.b.kernelZip([scaled, bias.id], addFn, outType);

    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
