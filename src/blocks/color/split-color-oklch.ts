/**
 * SplitColorOKLCH Block
 *
 * Unpack a color+oklch value into its 4 scalar channels.
 * No additional clamping/wrapping — assumes upstream enforced.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitOklch, unitTurns, unitNone, contractWrap01, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const SPLIT_COLOR_HSL_CARD = cardinalityVar(cardinalityVarId('split_color_hsl_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'SplitColorOKLCH',
    label: 'Split Color OKLCH',
    category: 'color',
    description: 'Unpack color+oklch into h, s, l, a channels',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      color: { label: 'Color', type: canonicalType(COLOR, unitOklch(), { cardinality: SPLIT_COLOR_HSL_CARD }) },
    },
    outputs: {
      h: { label: 'Hue', type: canonicalType(FLOAT, unitTurns(), { cardinality: SPLIT_COLOR_HSL_CARD }, contractWrap01()) },
      s: { label: 'Saturation', type: canonicalType(FLOAT, unitNone(), { cardinality: SPLIT_COLOR_HSL_CARD }, contractClamp01()) },
      l: { label: 'Lightness', type: canonicalType(FLOAT, unitNone(), { cardinality: SPLIT_COLOR_HSL_CARD }, contractClamp01()) },
      a: { label: 'Alpha', type: canonicalType(FLOAT, unitNone(), { cardinality: SPLIT_COLOR_HSL_CARD }, contractClamp01()) },
    },
    lower: ({ ctx, inputsById }) => {
      const colorInput = inputsById.color;
      if (!colorInput) throw new Error('SplitColorOKLCH requires color input');
  
      const hueType = ctx.outTypes[0];
      const satType = ctx.outTypes[1];
      const lightType = ctx.outTypes[2];
      const alphaType = ctx.outTypes[3];
      if (!hueType || !satType || !lightType || !alphaType) {
        throw new Error('SplitColorOKLCH missing resolved output types from pass1');
      }
  
      const h = ctx.b.extract(colorInput.id, 0, hueType);
      const s = ctx.b.extract(colorInput.id, 1, satType);
      const l = ctx.b.extract(colorInput.id, 2, lightType);
      const a = ctx.b.extract(colorInput.id, 3, alphaType);
  
      return {
        outputsById: {
          h: { id: h, slot: undefined, type: hueType, stride: payloadStride(hueType.payload) },
          s: { id: s, slot: undefined, type: satType, stride: payloadStride(satType.payload) },
          l: { id: l, slot: undefined, type: lightType, stride: payloadStride(lightType.payload) },
          a: { id: a, slot: undefined, type: alphaType, stride: payloadStride(alphaType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'h', type: hueType },
            { portId: 's', type: satType },
            { portId: 'l', type: lightType },
            { portId: 'a', type: alphaType },
          ],
        },
      };
    },
  });
}
