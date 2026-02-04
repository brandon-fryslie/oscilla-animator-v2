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
  loweringPurity: 'impure', // Multi-component external signal - TODO: needs stridedWrites in effects
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
    const components = [xSig, ySig];

    // TODO: This uses stepSlotWriteStrided which violates pure lowering
    // Should be: effects: { stridedWrites: [{ components }] }
    // For now, keep imperative until design decision is made
    const slot = ctx.b.allocSlot(stride);
    ctx.b.stepSlotWriteStrided(slot, components);

    return {
      outputsById: {
        position: { id: xSig, slot, type: outType, stride, components },
      },
    };
  },
});
