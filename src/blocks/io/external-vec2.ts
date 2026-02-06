/**
 * ExternalVec2 Block
 *
 * Read external channels as vec2 (channelBase.x, channelBase.y).
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, FLOAT, VEC2 } from '../../core/canonical-types';

registerBlock({
  type: 'ExternalVec2',
  label: 'External Vec2',
  category: 'io',
  description: 'Read external channels as vec2 (channelBase.x, channelBase.y)',
  form: 'primitive',
  capability: 'io',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    channelBase: {
      label: 'Channel Base',
      type: canonicalType(FLOAT),
      defaultValue: 'mouse',
      exposedAsPort: false,
      uiHint: {
        kind: 'select',
        options: [
          { value: 'mouse', label: 'Mouse Position' },
          { value: 'mouse.wheel', label: 'Mouse Wheel Delta' },
        ],
      },
    },
  },
  outputs: {
    position: { label: 'Position', type: canonicalType(VEC2) },
  },
  lower: ({ ctx, config }) => {
    const channelBase = (config?.channelBase as string) ?? 'mouse';

    const xSig = ctx.b.external(`${channelBase}.x`, canonicalType(FLOAT));
    const ySig = ctx.b.external(`${channelBase}.y`, canonicalType(FLOAT));

    const outType = ctx.outTypes[0];
    const stride = payloadStride(outType.payload);

    // Pure lowering: construct multi-component signal from scalar components
    const vec2Sig = ctx.b.construct([xSig, ySig], outType);

    return {
      outputsById: {
        position: { id: vec2Sig, slot: undefined, type: outType, stride, components: [xSig, ySig] },
      },
      effects: {
        slotRequests: [{ portId: 'position', type: outType }],
      },
    };
  },
});
