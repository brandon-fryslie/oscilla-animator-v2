/**
 * MixColor Block
 *
 * Blend between two colors with parameter t.
 * Uses shortest-arc hue interpolation (correct for circular hue space).
 * s/l/a use standard linear lerp.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitHsl, unitScalar, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';

registerBlock({
  type: 'MixColor',
  label: 'Mix Color',
  category: 'color',
  description: 'Blend two HSL colors using shortest-arc hue interpolation',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    a: { label: 'Color A', type: canonicalType(COLOR, unitHsl()) },
    b: { label: 'Color B', type: canonicalType(COLOR, unitHsl()) },
    t: { label: 'Mix', type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()), defaultSource: defaultSourceConst(0.5) },
  },
  outputs: {
    color: { label: 'Color', type: canonicalType(COLOR, unitHsl()) },
  },
  lower: ({ ctx, inputsById }) => {
    const aInput = inputsById.a;
    const bInput = inputsById.b;
    const tInput = inputsById.t;
    if (!aInput || !bInput || !tInput) throw new Error('MixColor requires a, b, and t inputs');

    const outType = ctx.outTypes[0];
    const floatType = canonicalType(FLOAT, unitScalar());

    // Extract channels from both colors
    const ah = ctx.b.extract(aInput.id, 0, floatType);
    const as = ctx.b.extract(aInput.id, 1, floatType);
    const al = ctx.b.extract(aInput.id, 2, floatType);
    const aa = ctx.b.extract(aInput.id, 3, floatType);

    const bh = ctx.b.extract(bInput.id, 0, floatType);
    const bs = ctx.b.extract(bInput.id, 1, floatType);
    const bl = ctx.b.extract(bInput.id, 2, floatType);
    const ba = ctx.b.extract(bInput.id, 3, floatType);

    // Clamp t to [0,1]
    const clampFn = ctx.b.opcode(OpCode.Clamp);
    const zero = ctx.b.constant({ kind: 'float', value: 0 }, floatType);
    const one = ctx.b.constant({ kind: 'float', value: 1 }, floatType);
    const tClamped = ctx.b.kernelZip([tInput.id, zero, one], clampFn, floatType);

    // Shortest-arc hue interpolation:
    //   diff = bh - ah
    //   shifted = diff + 0.5
    //   dh = fract(shifted) - 0.5  (wrapSigned)
    //   h_out = wrap01(ah + dh * t)
    const subFn = ctx.b.opcode(OpCode.Sub);
    const addFn = ctx.b.opcode(OpCode.Add);
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const fractFn = ctx.b.opcode(OpCode.Fract);
    const wrap01Fn = ctx.b.opcode(OpCode.Wrap01);

    const half = ctx.b.constant({ kind: 'float', value: 0.5 }, floatType);
    const diff = ctx.b.kernelZip([bh, ah], subFn, floatType);
    const shifted = ctx.b.kernelZip([diff, half], addFn, floatType);
    const fractVal = ctx.b.kernelMap(shifted, fractFn, floatType);
    const dh = ctx.b.kernelZip([fractVal, half], subFn, floatType);
    const dhScaled = ctx.b.kernelZip([dh, tClamped], mulFn, floatType);
    const hSum = ctx.b.kernelZip([ah, dhScaled], addFn, floatType);
    const hOut = ctx.b.kernelMap(hSum, wrap01Fn, floatType);

    // Linear lerp for s, l, a
    const lerpFn = ctx.b.opcode(OpCode.Lerp);
    const sOut = ctx.b.kernelZip([as, bs, tClamped], lerpFn, floatType);
    const lOut = ctx.b.kernelZip([al, bl, tClamped], lerpFn, floatType);
    const aOut = ctx.b.kernelZip([aa, ba, tClamped], lerpFn, floatType);

    // Reconstruct
    const result = ctx.b.construct([hOut, sOut, lOut, aOut], outType);
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        color: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
