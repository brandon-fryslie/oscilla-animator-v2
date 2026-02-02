/**
 * HslToRgba Block (Adapter)
 *
 * Convert color from HSL to RGBA color space.
 * Alpha passes through unchanged.
 * Uses the hslToRgb ValueExpr intrinsic.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitHsl, unitRgba01 } from '../../core/canonical-types';
import { COLOR } from '../../core/canonical-types';

registerBlock({
  type: 'Adapter_HslToRgba',
  label: 'HSL → RGBA',
  category: 'adapter',
  description: 'Convert color from HSL to RGBA color space',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    from: { payload: COLOR, unit: { kind: 'color', unit: 'hsl' }, extent: 'any' },
    to: { payload: COLOR, unit: { kind: 'color', unit: 'rgba01' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'HSL → RGBA color space conversion',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'HSL', type: canonicalType(COLOR, unitHsl()) },
  },
  outputs: {
    out: { label: 'RGBA', type: canonicalType(COLOR, unitRgba01()) },
  },
  lower: ({ ctx, inputsById }) => {
    const input = inputsById.in;
    if (!input) throw new Error('HslToRgba requires input');

    const outType = ctx.outTypes[0];

    // Use the hslToRgb structural intrinsic
    const result = ctx.b.hslToRgb(input.id, outType);
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
