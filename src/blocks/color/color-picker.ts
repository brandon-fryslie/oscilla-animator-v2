/**
 * ColorPicker Block
 *
 * A constant authoring source that produces a user-space color (OKLCH+A).
 * h/c/l/a are exposed as inputs with defaults, allowing both constant
 * use (via UI sliders on the defaults) and dynamic wiring.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitOklch, unitTurns, unitNone, contractWrap01, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';
import { zipAuto, mapAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const COLOR_PICKER_CARD = cardinalityVar(cardinalityVarId('color_picker_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'ColorPicker',
    label: 'Color Picker',
    category: 'color',
    description: 'Constant OKLCH+A color source',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      h: { label: 'Hue', type: canonicalType(FLOAT, unitTurns(), { cardinality: COLOR_PICKER_CARD }, contractWrap01()), defaultSource: defaultSourceConst(0.0), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
      s: { label: 'Chroma', type: canonicalType(FLOAT, unitNone(), { cardinality: COLOR_PICKER_CARD }, contractClamp01()), defaultSource: defaultSourceConst(1.0), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
      l: { label: 'Lightness', type: canonicalType(FLOAT, unitNone(), { cardinality: COLOR_PICKER_CARD }, contractClamp01()), defaultSource: defaultSourceConst(0.5), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
      a: { label: 'Alpha', type: canonicalType(FLOAT, unitNone(), { cardinality: COLOR_PICKER_CARD }, contractClamp01()), defaultSource: defaultSourceConst(1.0), uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    },
    outputs: {
      color: { label: 'Color', type: canonicalType(COLOR, unitOklch(), { cardinality: COLOR_PICKER_CARD }) },
    },
    lower: ({ ctx, inputsById }) => {
      const hInput = inputsById.h;
      const sInput = inputsById.s;
      const lInput = inputsById.l;
      const aInput = inputsById.a;
      if (!hInput || !sInput || !lInput || !aInput) {
        throw new Error('ColorPicker requires all inputs (h, s/chroma, l, a)');
      }
  
      const outType = ctx.outTypes[0];
      const hType = canonicalType(FLOAT, unitTurns(), outType.extent, contractWrap01());
      const unitType = canonicalType(FLOAT, unitNone(), outType.extent, contractClamp01());
  
      // Enforce color validity: wrap hue, clamp c/l/a
      const wrap01 = ctx.b.opcode(OpCode.Wrap01);
      const clamp = ctx.b.opcode(OpCode.Clamp);
      const zero = ctx.b.constant({ kind: 'float', value: 0 }, unitType);
      const one = ctx.b.constant({ kind: 'float', value: 1 }, unitType);
  
      const hWrapped = mapAuto(hInput.id, wrap01, hType, ctx.b);
      const sClamped = zipAuto([sInput.id, zero, one], clamp, unitType, ctx.b);
      const lClamped = zipAuto([lInput.id, zero, one], clamp, unitType, ctx.b);
      const aClamped = zipAuto([aInput.id, zero, one], clamp, unitType, ctx.b);
  
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
}
