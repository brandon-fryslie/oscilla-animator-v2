/**
 * ColorPicker Block
 *
 * A constant authoring source that produces a user-space color (HSL+A).
 * h/s/l/a are exposed as inputs with defaults, allowing both constant
 * use (via UI sliders on the defaults) and dynamic wiring.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitHsl, unitTurns, unitScalar, contractWrap01, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';

registerBlock({
  type: 'ColorPicker',
  label: 'Color Picker',
  category: 'color',
  description: 'Constant HSL+A color source',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    h: { label: 'Hue', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()), defaultSource: defaultSourceConst(0.0), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    s: { label: 'Saturation', type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()), defaultSource: defaultSourceConst(1.0), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    l: { label: 'Lightness', type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()), defaultSource: defaultSourceConst(0.5), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    a: { label: 'Alpha', type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()), defaultSource: defaultSourceConst(1.0), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
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
