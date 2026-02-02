/**
 * PowerGamma Block
 *
 * y = pow(clamp01(x), gamma)
 *
 * Gamma curve control for value shaping. Clamps input to [0,1] before applying power.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'PowerGamma',
  label: 'Power/Gamma',
  category: 'lens',
  description: 'y = pow(clamp01(x), gamma) - gamma curve control',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT) },
    gamma: { label: 'Gamma', type: canonicalType(FLOAT), defaultValue: 1.0 },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const gamma = inputsById.gamma;
    if (!input) throw new Error('PowerGamma: in is required');
    if (!gamma) throw new Error('PowerGamma: gamma is required');

    const outType = ctx.outTypes[0];

    // clamp(x, 0, 1)
    const zeroConst = ctx.b.constant(floatConst(0.0), canonicalType(FLOAT));
    const oneConst = ctx.b.constant(floatConst(1.0), canonicalType(FLOAT));
    const clampFn = ctx.b.opcode(OpCode.Clamp);
    const clamped = ctx.b.kernelZip([input.id, zeroConst, oneConst], clampFn, outType);

    // pow(clamped, gamma)
    const powFn = ctx.b.opcode(OpCode.Pow);
    const result = ctx.b.kernelZip([clamped, gamma.id], powFn, outType);

    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
