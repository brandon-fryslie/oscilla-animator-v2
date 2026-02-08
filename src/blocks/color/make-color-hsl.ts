/**
 * MakeColorHSL Block
 *
 * Pack scalar channels into a color+hsl value.
 * This is THE enforcement point for color validity:
 * h is wrapped via Wrap01, s/l/a are clamped to [0,1].
 */

import { registerBlock } from '../registry';
import { canonicalType, canonicalConst, payloadStride, unitHsl, unitTurns, unitNone, contractWrap01, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';
import { withoutContract, zipAuto } from '../lower-utils';

registerBlock({
  type: 'MakeColorHSL',
  label: 'Make Color HSL',
  category: 'color',
  description: 'Pack h, s, l, a into a color+hsl value with enforcement (wrap hue, clamp others)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    h: { label: 'Hue', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()), defaultSource: defaultSourceConst(0.0) },
    s: { label: 'Saturation', type: canonicalType(FLOAT, unitNone(), undefined, contractClamp01()), defaultSource: defaultSourceConst(1.0) },
    l: { label: 'Lightness', type: canonicalType(FLOAT, unitNone(), undefined, contractClamp01()), defaultSource: defaultSourceConst(0.5) },
    a: { label: 'Alpha', type: canonicalType(FLOAT, unitNone(), undefined, contractClamp01()), defaultSource: defaultSourceConst(1.0) },
  },
  outputs: {
    color: { label: 'Color', type: canonicalType(COLOR, unitHsl()) },
  },
  lower: ({ ctx, inputsById }) => {
    const hInput = inputsById.h;
    const sInput = inputsById.s;
    const lInput = inputsById.l;
    const aInput = inputsById.a;
    if (!hInput || !sInput || !lInput || !aInput) {
      throw new Error('MakeColorHSL requires all inputs (h, s, l, a)');
    }

    const outType = ctx.outTypes[0];
    // Derive intermediate float type from resolved output extent (preserves cardinality)
    const intermediateFloat = withoutContract({
      payload: FLOAT,
      unit: unitTurns(),
      extent: outType.extent,
    });
    // Enforce: wrap hue, clamp s/l/a
    const wrap01 = ctx.b.opcode(OpCode.Wrap01);
    const clamp = ctx.b.opcode(OpCode.Clamp);
    // Constants are card=zero (universal donors) — zipAuto handles cardinality alignment
    const zero = ctx.b.constant({ kind: 'float', value: 0 }, canonicalConst(FLOAT, unitNone()));
    const one = ctx.b.constant({ kind: 'float', value: 1 }, canonicalConst(FLOAT, unitNone()));

    const hWrapped = ctx.b.kernelMap(hInput.id, wrap01, intermediateFloat);
    const sClamped = zipAuto([sInput.id, zero, one], clamp, intermediateFloat, ctx.b);
    const lClamped = zipAuto([lInput.id, zero, one], clamp, intermediateFloat, ctx.b);
    const aClamped = zipAuto([aInput.id, zero, one], clamp, intermediateFloat, ctx.b);

    const result = ctx.b.construct([hWrapped, sClamped, lClamped, aClamped], outType);

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
