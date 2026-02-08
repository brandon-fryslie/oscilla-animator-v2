/**
 * ColorPicker Block
 *
 * A constant authoring source that produces a user-space color (HSL+A).
 * h/s/l/a are exposed as inputs with defaults, allowing both constant
 * use (via UI sliders on the defaults) and dynamic wiring.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitHsl, unitTurns, unitNone, contractWrap01, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';
import { zipAuto, mapAuto } from '../lower-utils';

registerBlock({
  type: 'ColorPicker',
  label: 'Color Picker',
  category: 'color',
  description: 'Constant HSL+A color source',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    h: { label: 'Hue', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()), defaultSource: defaultSourceConst(0.0), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    s: { label: 'Saturation', type: canonicalType(FLOAT, unitNone(), undefined, contractClamp01()), defaultSource: defaultSourceConst(1.0), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    l: { label: 'Lightness', type: canonicalType(FLOAT, unitNone(), undefined, contractClamp01()), defaultSource: defaultSourceConst(0.5), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    a: { label: 'Alpha', type: canonicalType(FLOAT, unitNone(), undefined, contractClamp01()), defaultSource: defaultSourceConst(1.0), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
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
      throw new Error('ColorPicker requires all inputs (h, s, l, a)');
    }

    const outType = ctx.outTypes[0];
    const floatType = canonicalType(FLOAT, unitTurns(), undefined, contractWrap01());

    // Enforce color validity: wrap hue, clamp s/l/a
    const wrap01 = ctx.b.opcode(OpCode.Wrap01);
    const clamp = ctx.b.opcode(OpCode.Clamp);
    const zero = ctx.b.constant({ kind: 'float', value: 0 }, floatType);
    const one = ctx.b.constant({ kind: 'float', value: 1 }, floatType);

    const hWrapped = mapAuto(hInput.id, wrap01, floatType, ctx.b);
    const sClamped = zipAuto([sInput.id, zero, one], clamp, floatType, ctx.b);
    const lClamped = zipAuto([lInput.id, zero, one], clamp, floatType, ctx.b);
    const aClamped = zipAuto([aInput.id, zero, one], clamp, floatType, ctx.b);

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
