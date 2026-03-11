/**
 * MixColor Block
 *
 * Blend between two colors with parameter t.
 * Uses shortest-arc hue interpolation (correct for circular hue space).
 * c/l/a use standard linear lerp.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitOklch, unitNone, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';
import { withoutContract, zipAuto, mapAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const MIX_COLOR_CARD = cardinalityVar(cardinalityVarId('mix_color_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'MixColor',
    label: 'Mix Color',
    category: 'color',
    description: 'Blend two OKLCH colors using shortest-arc hue interpolation',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      a: { label: 'Color A', type: canonicalType(COLOR, unitOklch(), { cardinality: MIX_COLOR_CARD }) },
      b: { label: 'Color B', type: canonicalType(COLOR, unitOklch(), { cardinality: MIX_COLOR_CARD }) },
      t: { label: 'Mix', type: canonicalType(FLOAT, unitNone(), { cardinality: MIX_COLOR_CARD }, contractClamp01()), defaultSource: defaultSourceConst(0.5) },
    },
    outputs: {
      color: { label: 'Color', type: canonicalType(COLOR, unitOklch(), { cardinality: MIX_COLOR_CARD }) },
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
      const ac = ctx.b.extract(aInput.id, 1, intermediateFloat);
      const al = ctx.b.extract(aInput.id, 2, intermediateFloat);
      const aa = ctx.b.extract(aInput.id, 3, intermediateFloat);
  
      const bh = ctx.b.extract(bInput.id, 0, intermediateFloat);
      const bc = ctx.b.extract(bInput.id, 1, intermediateFloat);
      const bl = ctx.b.extract(bInput.id, 2, intermediateFloat);
      const ba = ctx.b.extract(bInput.id, 3, intermediateFloat);
  
      // Clamp t to [0,1]
      const clampFn = ctx.b.opcode(OpCode.Clamp);
      const zero = ctx.b.constant({ kind: 'float', value: 0 }, intermediateFloat);
      const one = ctx.b.constant({ kind: 'float', value: 1 }, intermediateFloat);
      const tClamped = zipAuto([tInput.id, zero, one], clampFn, intermediateFloat, ctx.b);
  
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
      const diff = zipAuto([bh, ah], subFn, intermediateFloat, ctx.b);
      const shifted = zipAuto([diff, half], addFn, intermediateFloat, ctx.b);
      const fractVal = mapAuto(shifted, fractFn, intermediateFloat, ctx.b);
      const dh = zipAuto([fractVal, half], subFn, intermediateFloat, ctx.b);
      const dhScaled = zipAuto([dh, tClamped], mulFn, intermediateFloat, ctx.b);
      const hSum = zipAuto([ah, dhScaled], addFn, intermediateFloat, ctx.b);
      const hOut = mapAuto(hSum, wrap01Fn, intermediateFloat, ctx.b);
  
      // Linear lerp for c, l, a
      const lerpFn = ctx.b.opcode(OpCode.Lerp);
      const cOut = zipAuto([ac, bc, tClamped], lerpFn, intermediateFloat, ctx.b);
      const lOut = zipAuto([al, bl, tClamped], lerpFn, intermediateFloat, ctx.b);
      const aOut = zipAuto([aa, ba, tClamped], lerpFn, intermediateFloat, ctx.b);
  
      // Reconstruct
      const result = ctx.b.construct([hOut, cOut, lOut, aOut], outType);
  
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
}
