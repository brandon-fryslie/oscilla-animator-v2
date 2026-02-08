/**
 * MixColor Block
 *
 * Blend between two colors with parameter t.
 * Uses shortest-arc hue interpolation (correct for circular hue space).
 * s/l/a use standard linear lerp.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitHsl, unitNone, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';
import { withoutContract } from '../lower-utils';

registerBlock({
  type: 'MixColor',
  label: 'Mix Color',
  category: 'color',
  description: 'Blend two HSL colors using shortest-arc hue interpolation',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    a: { label: 'Color A', type: canonicalType(COLOR, unitHsl()) },
    b: { label: 'Color B', type: canonicalType(COLOR, unitHsl()) },
    t: { label: 'Mix', type: canonicalType(FLOAT, unitNone(), undefined, contractClamp01()), defaultSource: defaultSourceConst(0.5) },
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
    // Derive intermediate float type from resolved output extent (preserves cardinality)
    const intermediateFloat = withoutContract({
      payload: FLOAT,
      unit: unitNone(),
      extent: outType.extent,
    });

    // Extract channels from both colors
    const ah = ctx.b.extract(aInput.id, 0, intermediateFloat);
    const as = ctx.b.extract(aInput.id, 1, intermediateFloat);
    const al = ctx.b.extract(aInput.id, 2, intermediateFloat);
    const aa = ctx.b.extract(aInput.id, 3, intermediateFloat);

    const bh = ctx.b.extract(bInput.id, 0, intermediateFloat);
    const bs = ctx.b.extract(bInput.id, 1, intermediateFloat);
    const bl = ctx.b.extract(bInput.id, 2, intermediateFloat);
    const ba = ctx.b.extract(bInput.id, 3, intermediateFloat);

    // Clamp t to [0,1]
    const clampFn = ctx.b.opcode(OpCode.Clamp);
    const zero = ctx.b.constant({ kind: 'float', value: 0 }, intermediateFloat);
    const one = ctx.b.constant({ kind: 'float', value: 1 }, intermediateFloat);
    const tClamped = ctx.b.kernelZip([tInput.id, zero, one], clampFn, intermediateFloat);

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

    const half = ctx.b.constant({ kind: 'float', value: 0.5 }, intermediateFloat);
    const diff = ctx.b.kernelZip([bh, ah], subFn, intermediateFloat);
    const shifted = ctx.b.kernelZip([diff, half], addFn, intermediateFloat);
    const fractVal = ctx.b.kernelMap(shifted, fractFn, intermediateFloat);
    const dh = ctx.b.kernelZip([fractVal, half], subFn, intermediateFloat);
    const dhScaled = ctx.b.kernelZip([dh, tClamped], mulFn, intermediateFloat);
    const hSum = ctx.b.kernelZip([ah, dhScaled], addFn, intermediateFloat);
    const hOut = ctx.b.kernelMap(hSum, wrap01Fn, intermediateFloat);

    // Linear lerp for s, l, a
    const lerpFn = ctx.b.opcode(OpCode.Lerp);
    const sOut = ctx.b.kernelZip([as, bs, tClamped], lerpFn, intermediateFloat);
    const lOut = ctx.b.kernelZip([al, bl, tClamped], lerpFn, intermediateFloat);
    const aOut = ctx.b.kernelZip([aa, ba, tClamped], lerpFn, intermediateFloat);

    // Reconstruct
    const result = ctx.b.construct([hOut, sOut, lOut, aOut], outType);

    return {
      outputsById: {
        color: { id: result, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'color', type: outType },
        ],
      },
    };
  },
});
