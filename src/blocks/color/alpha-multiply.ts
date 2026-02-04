/**
 * AlphaMultiply Block
 *
 * Multiply color alpha by a scalar factor, clamping the result.
 * h/s/l pass through unchanged.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitHsl, unitScalar, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';

registerBlock({
  type: 'AlphaMultiply',
  label: 'Alpha Multiply',
  category: 'color',
  description: 'Multiply color alpha by a factor (output clamped to [0,1])',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'Color', type: canonicalType(COLOR, unitHsl()) },
    alpha: { label: 'Alpha', type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()), defaultSource: defaultSourceConst(1.0) },
  },
  outputs: {
    out: { label: 'Color', type: canonicalType(COLOR, unitHsl()) },
  },
  lower: ({ ctx, inputsById }) => {
    const colorInput = inputsById.in;
    const alphaInput = inputsById.alpha;
    if (!colorInput || !alphaInput) throw new Error('AlphaMultiply requires in and alpha inputs');

    const outType = ctx.outTypes[0];
    const floatType = canonicalType(FLOAT, unitScalar(), undefined, contractClamp01());

    // Extract channels
    const h = ctx.b.extract(colorInput.id, 0, floatType);
    const s = ctx.b.extract(colorInput.id, 1, floatType);
    const l = ctx.b.extract(colorInput.id, 2, floatType);
    const a = ctx.b.extract(colorInput.id, 3, floatType);

    // a2 = clamp01(a * alpha) — clamp output only, not input
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const clampFn = ctx.b.opcode(OpCode.Clamp);
    const zero = ctx.b.constant({ kind: 'float', value: 0 }, floatType);
    const one = ctx.b.constant({ kind: 'float', value: 1 }, floatType);

    const aMultiplied = ctx.b.kernelZip([a, alphaInput.id], mulFn, floatType);
    const aClamped = ctx.b.kernelZip([aMultiplied, zero, one], clampFn, floatType);

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
