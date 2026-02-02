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

    // Pack x and y into vec2 using strided slot write
    const outType = ctx.outTypes[0];
    const stride = payloadStride(outType.payload); // vec2 has stride 2
    const slot = ctx.b.allocSlot(stride);
    const components = [xSig, ySig];

    // Emit step to write components to strided slot
    ctx.b.stepSlotWriteStrided(slot, components);

    return {
      outputsById: {
        position: { id: xSig, slot, type: outType, stride, components },
      },
    };
  },
});
