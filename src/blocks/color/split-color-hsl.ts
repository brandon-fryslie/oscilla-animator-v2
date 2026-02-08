/**
 * SplitColorHSL Block
 *
 * Unpack a color+hsl value into its 4 scalar channels.
 * No additional clamping/wrapping — assumes upstream enforced.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitHsl, unitTurns, unitNone, contractWrap01, contractClamp01 } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';

registerBlock({
  type: 'SplitColorHSL',
  label: 'Split Color HSL',
  category: 'color',
  description: 'Unpack color+hsl into h, s, l, a channels',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    color: { label: 'Color', type: canonicalType(COLOR, unitHsl()) },
  },
  outputs: {
    h: { label: 'Hue', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()) },
    s: { label: 'Saturation', type: canonicalType(FLOAT, unitNone(), undefined, contractClamp01()) },
    l: { label: 'Lightness', type: canonicalType(FLOAT, unitNone(), undefined, contractClamp01()) },
    a: { label: 'Alpha', type: canonicalType(FLOAT, unitNone(), undefined, contractClamp01()) },
  },
  lower: ({ ctx, inputsById }) => {
    const colorInput = inputsById.color;
    if (!colorInput) throw new Error('SplitColorHSL requires color input');

    const hueType = canonicalType(FLOAT, unitTurns(), undefined, contractWrap01());
    const normType = canonicalType(FLOAT, unitNone(), undefined, contractClamp01());

    const h = ctx.b.extract(colorInput.id, 0, hueType);
    const s = ctx.b.extract(colorInput.id, 1, normType);
    const l = ctx.b.extract(colorInput.id, 2, normType);
    const a = ctx.b.extract(colorInput.id, 3, normType);

    return {
      outputsById: {
        h: { id: h, slot: undefined, type: hueType, stride: payloadStride(hueType.payload) },
        s: { id: s, slot: undefined, type: normType, stride: payloadStride(normType.payload) },
        l: { id: l, slot: undefined, type: normType, stride: payloadStride(normType.payload) },
        a: { id: a, slot: undefined, type: normType, stride: payloadStride(normType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'h', type: hueType },
          { portId: 's', type: normType },
          { portId: 'l', type: normType },
          { portId: 'a', type: normType },
        ],
      },
    };
  },
});
