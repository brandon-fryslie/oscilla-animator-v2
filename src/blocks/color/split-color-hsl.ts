/**
 * SplitColorHSL Block
 *
 * Unpack a color+hsl value into its 4 scalar channels.
 * No additional clamping/wrapping — assumes upstream enforced.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitHsl, unitScalar } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';

registerBlock({
  type: 'SplitColorHSL',
  label: 'Split Color HSL',
  category: 'color',
  description: 'Unpack color+hsl into h, s, l, a channels',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    color: { label: 'Color', type: canonicalType(COLOR, unitHsl()) },
  },
  outputs: {
    h: { label: 'Hue', type: canonicalType(FLOAT, unitScalar()) },
    s: { label: 'Saturation', type: canonicalType(FLOAT, unitScalar()) },
    l: { label: 'Lightness', type: canonicalType(FLOAT, unitScalar()) },
    a: { label: 'Alpha', type: canonicalType(FLOAT, unitScalar()) },
  },
  lower: ({ ctx, inputsById }) => {
    const colorInput = inputsById.color;
    if (!colorInput) throw new Error('SplitColorHSL requires color input');

    const floatType = canonicalType(FLOAT, unitScalar());

    const h = ctx.b.extract(colorInput.id, 0, floatType);
    const s = ctx.b.extract(colorInput.id, 1, floatType);
    const l = ctx.b.extract(colorInput.id, 2, floatType);
    const a = ctx.b.extract(colorInput.id, 3, floatType);

    const hSlot = ctx.b.allocSlot();
    const sSlot = ctx.b.allocSlot();
    const lSlot = ctx.b.allocSlot();
    const aSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        h: { id: h, slot: hSlot, type: floatType, stride: payloadStride(floatType.payload) },
        s: { id: s, slot: sSlot, type: floatType, stride: payloadStride(floatType.payload) },
        l: { id: l, slot: lSlot, type: floatType, stride: payloadStride(floatType.payload) },
        a: { id: a, slot: aSlot, type: floatType, stride: payloadStride(floatType.payload) },
      },
    };
  },
});
