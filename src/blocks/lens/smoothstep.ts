/**
 * Smoothstep Block
 *
 * y = smoothstep(edge0, edge1, x)
 *
 * Standard S-curve remap with smooth interpolation.
 * Formula: t = clamp((x - edge0) / (edge1 - edge0), 0, 1); y = t * t * (3 - 2 * t)
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Smoothstep',
  label: 'Smoothstep',
  category: 'lens',
  description: 'y = smoothstep(edge0, edge1, x) - S-curve remap',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT) },
    edge0: { label: 'Edge 0', type: canonicalType(FLOAT), defaultValue: 0.0 },
    edge1: { label: 'Edge 1', type: canonicalType(FLOAT), defaultValue: 1.0 },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const edge0 = inputsById.edge0;
    const edge1 = inputsById.edge1;
    if (!input) throw new Error('Smoothstep: in is required');
    if (!edge0) throw new Error('Smoothstep: edge0 is required');
    if (!edge1) throw new Error('Smoothstep: edge1 is required');

    const outType = ctx.outTypes[0];

    // t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
    const subFn = ctx.b.opcode(OpCode.Sub);
    const numerator = ctx.b.kernelZip([input.id, edge0.id], subFn, outType);
    const denominator = ctx.b.kernelZip([edge1.id, edge0.id], subFn, outType);

    const divFn = ctx.b.opcode(OpCode.Div);
    const ratio = ctx.b.kernelZip([numerator, denominator], divFn, outType);

    const zeroConst = ctx.b.constant(floatConst(0.0), canonicalType(FLOAT));
    const oneConst = ctx.b.constant(floatConst(1.0), canonicalType(FLOAT));
    const clampFn = ctx.b.opcode(OpCode.Clamp);
    const t = ctx.b.kernelZip([ratio, zeroConst, oneConst], clampFn, outType);

    // y = t * t * (3 - 2 * t)
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const tt = ctx.b.kernelZip([t, t], mulFn, outType);

    const twoConst = ctx.b.constant(floatConst(2.0), canonicalType(FLOAT));
    const twoT = ctx.b.kernelZip([twoConst, t], mulFn, outType);

    const threeConst = ctx.b.constant(floatConst(3.0), canonicalType(FLOAT));
    const threeMinusTwoT = ctx.b.kernelZip([threeConst, twoT], subFn, outType);

    const result = ctx.b.kernelZip([tt, threeMinusTwoT], mulFn, outType);

    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
