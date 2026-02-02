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
    gamma: { label: 'Gamma', type: canonicalType(FLOAT), defaultValue: 1.0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: ({ inputsById, ctx, config }) => {
    const input = inputsById.in;
    if (!input) throw new Error('PowerGamma input is required');

    const gamma = (config?.gamma as number) ?? 1.0;
    if (!isFinite(gamma) || gamma < 0) {
      throw new Error(`PowerGamma gamma must be >= 0 and finite (got ${gamma})`);
    }
    const outType = ctx.outTypes[0];

    // clamp(x, 0, 1)
    const zeroConst = ctx.b.constant(floatConst(0.0), canonicalType(FLOAT));
    const oneConst = ctx.b.constant(floatConst(1.0), canonicalType(FLOAT));
    const clampFn = ctx.b.opcode(OpCode.Clamp);
    const clamped = ctx.b.kernelZip([input.id, zeroConst, oneConst], clampFn, outType);

    // pow(clamped, gamma)
    const gammaConst = ctx.b.constant(floatConst(gamma), canonicalType(FLOAT));
    const powFn = ctx.b.opcode(OpCode.Pow);
    const result = ctx.b.kernelZip([clamped, gammaConst], powFn, outType);

    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
