/**
 * MakeColorHSL Block
 *
 * Pack scalar channels into a color+hsl value.
 * This is THE enforcement point for color validity:
 * h is wrapped via Wrap01, s/l/a are clamped to [0,1].
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitHsl, unitScalar } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';

registerBlock({
  type: 'MakeColorHSL',
  label: 'Make Color HSL',
  category: 'color',
  description: 'Pack h, s, l, a into a color+hsl value with enforcement (wrap hue, clamp others)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    h: { label: 'Hue', type: canonicalType(FLOAT, unitScalar()), defaultSource: defaultSourceConst(0.0) },
    s: { label: 'Saturation', type: canonicalType(FLOAT, unitScalar()), defaultSource: defaultSourceConst(1.0) },
    l: { label: 'Lightness', type: canonicalType(FLOAT, unitScalar()), defaultSource: defaultSourceConst(0.5) },
    a: { label: 'Alpha', type: canonicalType(FLOAT, unitScalar()), defaultSource: defaultSourceConst(1.0) },
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
    const floatType = canonicalType(FLOAT, unitScalar());

    // Enforce: wrap hue, clamp s/l/a
    const wrap01 = ctx.b.opcode(OpCode.Wrap01);
    const clamp = ctx.b.opcode(OpCode.Clamp);
    const zero = ctx.b.constant({ kind: 'float', value: 0 }, floatType);
    const one = ctx.b.constant({ kind: 'float', value: 1 }, floatType);

    const hWrapped = ctx.b.kernelMap(hInput.id, wrap01, floatType);
    const sClamped = ctx.b.kernelZip([sInput.id, zero, one], clamp, floatType);
    const lClamped = ctx.b.kernelZip([lInput.id, zero, one], clamp, floatType);
    const aClamped = ctx.b.kernelZip([aInput.id, zero, one], clamp, floatType);

    const result = ctx.b.construct([hWrapped, sClamped, lClamped, aClamped], outType);
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        color: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
