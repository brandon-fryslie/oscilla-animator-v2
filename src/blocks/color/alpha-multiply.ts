/**
 * AlphaMultiply Block
 *
 * Multiply color alpha by a scalar factor, clamping the result.
 * h/s/l pass through unchanged.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitHsl, unitTurns, unitNone, contractWrap01, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';
import { zipAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const ALPHA_MULTIPLY_CARD = cardinalityVar(cardinalityVarId('alpha_multiply_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'AlphaMultiply',
    label: 'Alpha Multiply',
    category: 'color',
    description: 'Multiply color alpha by a factor (output clamped to [0,1])',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      in: { label: 'Color', type: canonicalType(COLOR, unitHsl(), { cardinality: ALPHA_MULTIPLY_CARD }) },
      alpha: { label: 'Alpha', type: canonicalType(FLOAT, unitNone(), { cardinality: ALPHA_MULTIPLY_CARD }, contractClamp01()), defaultSource: defaultSourceConst(1.0) },
    },
    outputs: {
      out: { label: 'Color', type: canonicalType(COLOR, unitHsl(), { cardinality: ALPHA_MULTIPLY_CARD }) },
    },
    lower: ({ ctx, inputsById }) => {
      const colorInput = inputsById.in;
      const alphaInput = inputsById.alpha;
      if (!colorInput || !alphaInput) throw new Error('AlphaMultiply requires in and alpha inputs');
  
      const outType = ctx.outTypes[0];
      const hueType = canonicalType(FLOAT, unitTurns(), outType.extent, contractWrap01());
      const normType = canonicalType(FLOAT, unitNone(), outType.extent, contractClamp01());
  
      // Extract channels
      const h = ctx.b.extract(colorInput.id, 0, hueType);
      const s = ctx.b.extract(colorInput.id, 1, normType);
      const l = ctx.b.extract(colorInput.id, 2, normType);
      const a = ctx.b.extract(colorInput.id, 3, normType);
  
      // a2 = clamp01(a * alpha) — clamp output only, not input
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const clampFn = ctx.b.opcode(OpCode.Clamp);
      const zero = ctx.b.constant({ kind: 'float', value: 0 }, normType);
      const one = ctx.b.constant({ kind: 'float', value: 1 }, normType);
  
      const aMultiplied = zipAuto([a, alphaInput.id], mulFn, normType, ctx.b);
      const aClamped = zipAuto([aMultiplied, zero, one], clampFn, normType, ctx.b);
  
      // Reconstruct with modified alpha
      const result = ctx.b.construct([h, s, l, aClamped], outType);
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
}
